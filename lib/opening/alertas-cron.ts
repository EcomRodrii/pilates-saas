import type { SupabaseClient } from '@supabase/supabase-js';
import { hoyEnEstudio } from '../utils.ts';
import { emitirAlertaApertura } from '../notifications/emit.ts';
import { detectarAlertas, type AlertaApertura } from './alertas.ts';
import { debeMostrarApertura, diasHastaApertura, DIAS_TRAS_APERTURA } from './visibilidad.ts';
import type { AnalisisCapacidad } from './capacidad.ts';
import { cargarAnalisis, cargarEstadoApertura, cargarEtapas, sincronizarAlertas, type EstadoAperturaServidor } from './servidor.ts';

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
): Promise<{ detectadas: AlertaApertura[]; nuevas: AlertaApertura[] }> {
  const { etapas, planes } = await cargarEtapas(admin, studioId);
  const detectadas = detectarAlertas({
    diasHastaApertura: diasHastaApertura(estado.fechaApertura, now),
    analisis,
    etapas,
    planActivo: new Map(planes.map(p => [p.id, p.activo])),
    objetivoPreventa: estado.config.objetivoPreventa,
  });
  const nuevas = await sincronizarAlertas(admin, studioId, detectadas, now, opciones);
  return { detectadas, nuevas };
}

export interface ResumenAlertasApertura {
  estudios: number;
  nuevas: number;
  errores: number;
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
  const resumen: ResumenAlertasApertura = { estudios: 0, nuevas: 0, errores: 0 };
  for (const { id } of data ?? []) {
    const studioId = id as string;
    try {
      const estado = await cargarEstadoApertura(admin, studioId);
      if (!estado) continue;
      resumen.estudios++;
      if (!debeMostrarApertura(estado, now)) {
        await sincronizarAlertas(admin, studioId, [], now);
        continue;
      }
      const analisis = await cargarAnalisis(admin, studioId, estado.config, now);
      const { nuevas } = await evaluarAlertasApertura(admin, studioId, estado, analisis, now);
      for (const a of nuevas) {
        await emitirAlertaApertura({ studioId, fecha: hoy, tipo: a.tipo, titulo: a.titulo, descripcion: a.descripcion });
      }
      resumen.nuevas += nuevas.length;
    } catch (e) {
      // Un estudio que falla no deja sin revisar a los demás.
      resumen.errores++;
      console.error('[opening:alertas-cron]', studioId, e instanceof Error ? e.message : e);
    }
  }
  return resumen;
}
