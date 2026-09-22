import type { SupabaseClient } from '@supabase/supabase-js';
import { hoyEnEstudio, inicioDelDiaEstudio, TZ_ESTUDIO } from '../utils.ts';
import { emitirAlertaApertura, emitirBriefApertura } from '../notifications/emit.ts';
import { puedeVer } from '../permisos-reglas.ts';
import { construirBrief } from './brief.ts';
import { recuperarPlazasDelEstudio } from './cupo.ts';
import { avisarAbrimos, tocaAvisarAbrimos } from './abrimos.ts';
import { recomendar } from './onboarding.ts';
import { detectarAlertas, type AlertaApertura } from './alertas.ts';
import { debeMostrarApertura, diasHastaApertura, DIAS_TRAS_APERTURA } from './visibilidad.ts';
import type { AnalisisCapacidad } from './capacidad.ts';
import { cargarAnalisis, cargarDatosListo, cargarEstadoApertura, cargarEtapas, sincronizarAlertas, type EstadoAperturaServidor, type PlanVenta } from './servidor.ts';
import { ACCION_LISTO, bloqueantesPendientes, evaluarListo, type DatosListo } from './listo.ts';
import type { EtapaVista } from './etapas.ts';

/** Margen tras la ventana de la sección para resolver alertas que se queden abiertas. */
const DIAS_LIMPIEZA = DIAS_TRAS_APERTURA + 30;

/**
 * Detecta las alertas con el estado de AHORA y deja alertas_opening igual.
 * Único dueño de «qué alertas tiene un estudio»: lo usan la tarjeta de la home
 * (para no enseñar un aviso ya resuelto) y el cron (que además notifica).
 */
export async function evaluarAlertasApertura(
  admin: SupabaseClient, studioId: string, estado: EstadoAperturaServidor, analisis: AnalisisCapacidad, now: Date,
  opciones: { abrirNuevas: boolean } = { abrirNuevas: true },
): Promise<{ detectadas: AlertaApertura[]; nuevas: AlertaApertura[]; etapas: EtapaVista[]; planes: PlanVenta[]; datosListo: DatosListo }> {
  const [{ etapas, planes }, datosListo] = await Promise.all([
    cargarEtapas(admin, studioId),
    cargarDatosListo(admin, studioId, estado.fechaApertura, now),
  ]);
  // Para la alerta da igual quién pueda arreglarlo: el rol solo decide los enlaces.
  const pendientesListo = bloqueantesPendientes(evaluarListo(datosListo, now, () => true)).map(c => c.id);
  const detectadas = detectarAlertas({
    diasHastaApertura: diasHastaApertura(estado.fechaApertura, now),
    analisis,
    etapas,
    planActivo: new Map(planes.map(p => [p.id, p.activo])),
    objetivoPreventa: estado.config.objetivoPreventa,
    pendientesListo,
    hoy: hoyEnEstudio(now),
  });
  const nuevas = await sincronizarAlertas(admin, studioId, detectadas, now, opciones);
  return { detectadas, nuevas, etapas, planes, datosListo };
}

export interface ResumenAlertasApertura {
  estudios: number;
  nuevas: number;
  briefs: number;
  /** Socias avisadas con «abrimos mañana». */
  abrimos: number;
  errores: number;
}

/** El brief sale por la mañana; varias horas por si una pasada del cron falla (la clave por día evita el doble). */
const HORAS_BRIEF = new Set([8, 9, 10, 11]);
const SEVERIDAD = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 } as const;

function horaEnEstudio(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ_ESTUDIO, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

/** Ventas (cuotas que empezaron) e interesadas dadas de alta AYER, en el día del estudio. */
async function novedadesDeAyer(admin: SupabaseClient, studioId: string, now: Date) {
  const hoy = hoyEnEstudio(now);
  const ayer = hoyEnEstudio(new Date(new Date(inicioDelDiaEstudio(hoy)).getTime() - 1));
  const [ventas, interesadas] = await Promise.all([
    admin.from('suscripciones').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).eq('fecha_inicio', ayer),
    admin.from('socios').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).is('borrado_en', null).in('lead_stage', ['LEAD', 'INTERESADA'])
      .gte('fecha_alta', inicioDelDiaEstudio(ayer)).lt('fecha_alta', inicioDelDiaEstudio(hoy)),
  ]);
  if (ventas.error) throw ventas.error;
  if (interesadas.error) throw interesadas.error;
  return { ventasAyer: ventas.count ?? 0, interesadasAyer: interesadas.count ?? 0 };
}

/**
 * Barrido de alertas de Opening OS. Corre dentro del cron horario de
 * notif-trial (sin job ni invocaciones nuevas). Solo mira estudios con fecha
 * de apertura puesta: sin fecha no hay de qué avisar. Uno que ya no ve la
 * sección (abrió hace más de 30 días, o marcó «ya está abierto») se queda sin
 * alertas abiertas en vez de arrastrarlas en la bandeja.
 */
export async function barrerAlertasApertura(admin: SupabaseClient, now = new Date()): Promise<ResumenAlertasApertura> {
  const desde = hoyEnEstudio(new Date(now.getTime() - DIAS_LIMPIEZA * 86_400_000));
  const { data, error } = await admin.from('studios').select('id')
    .not('fecha_apertura', 'is', null).gte('fecha_apertura', desde).limit(1000);
  if (error) throw error;

  const hoy = hoyEnEstudio(now);
  const resumen: ResumenAlertasApertura = { estudios: 0, nuevas: 0, briefs: 0, abrimos: 0, errores: 0 };
  const tocaBrief = HORAS_BRIEF.has(horaEnEstudio(now));
  for (const { id } of data ?? []) {
    const studioId = id as string;
    try {
      const estado = await cargarEstadoApertura(admin, studioId);
      if (!estado) continue;
      resumen.estudios++;
      // Plazas de cupo abandonadas: vuelven a la venta aunque nadie intente
      // comprar (el mostrador las vería ocupadas hasta entonces).
      await recuperarPlazasDelEstudio(admin, studioId);
      if (!debeMostrarApertura(estado, now)) {
        await sincronizarAlertas(admin, studioId, [], now);
        continue;
      }
      const analisis = await cargarAnalisis(admin, studioId, estado.config, now);
      const { detectadas, nuevas, etapas, planes, datosListo } = await evaluarAlertasApertura(admin, studioId, estado, analisis, now);
      for (const a of nuevas) {
        await emitirAlertaApertura({ studioId, fecha: hoy, tipo: a.tipo, titulo: a.titulo, descripcion: a.descripcion });
      }
      resumen.nuevas += nuevas.length;

      if (tocaBrief && tocaAvisarAbrimos({
        encendido: estado.config.avisarAbrimos,
        diasHastaApertura: diasHastaApertura(estado.fechaApertura, now),
        fechaAproximada: estado.respuestas?.fechaAproximada ?? false,
      })) {
        resumen.abrimos += await avisarAbrimos(admin, studioId);
      }

      if (tocaBrief) {
        // Lo imprescindible que falte va antes que cualquier recomendación.
        const [pendiente] = bloqueantesPendientes(evaluarListo(datosListo, now, () => true));
        const [recomendado] = recomendar({
          respuestas: estado.respuestas,
          alertas: detectadas.map(a => a.tipo),
          hayPlanes: planes.some(p => p.activo),
          hayEtapaFundadora: etapas.some(e => e.etapa === 'FUNDADORA'),
          // El brief va a toda la gerencia: el paso se nombra, no se enlaza.
          puedeVer: href => puedeVer('PROPIETARIO', href),
        });
        const [masGrave] = [...detectadas].sort((a, b) => SEVERIDAD[a.severidad] - SEVERIDAD[b.severidad]);
        const brief = construirBrief({
          diasHastaApertura: diasHastaApertura(estado.fechaApertura, now),
          fechaAproximada: estado.respuestas?.fechaAproximada ?? false,
          ...(await novedadesDeAyer(admin, studioId, now)),
          alerta: masGrave ?? null,
          siguientePaso: pendiente ? { titulo: ACCION_LISTO[pendiente.id] } : recomendado ?? null,
        });
        if (brief) {
          await emitirBriefApertura({ studioId, fecha: hoy, ...brief });
          resumen.briefs++;
        }
      }
    } catch (e) {
      // Un estudio que falla no deja sin revisar a los demás.
      resumen.errores++;
      console.error('[opening:alertas-cron]', studioId, e instanceof Error ? e.message : e);
    }
  }
  return resumen;
}
