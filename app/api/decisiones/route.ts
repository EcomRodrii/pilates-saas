import { NextRequest, NextResponse } from 'next/server';
import { MOTIVO_SILENCIO_APERTURA } from '@/lib/decision/umbral';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { bloqueoPorPlan } from '@/lib/decision/plan-servidor';
import {
  dbListPendientes, dbGetResumenDiarioReciente, dbGetMensajeDia, dbListMensajesRecientes,
  dbGetRecomendacion, dbListOutcomesRecientes, dbCountAutonomasHoy,
} from '@/lib/decision/db';
import { calcularEstadoEspecialista } from '@/lib/decision/director';
import { seleccionarPrioridadesHome } from '@/lib/decision/prioridad';
import { fraseConfianza } from '@/lib/decision/copy';
import { efectoAlAprobar } from '@/lib/decision/efecto-aprobar';
import { canalesDeSocias } from '@/lib/decision/canales-socia';
import { MARKETING_MODULE_ENABLED } from '@/lib/feature-flags';
import type { EspecialistaId, Impacto, Recomendacion } from '@/lib/decision/tipos';
import type { ActividadReciente } from '@/lib/types';

// GET /api/decisiones — resumen del día + prioridades + estado por
// especialista + actividad reciente (DECISION-OS-ARQUITECTURA.md §7).
// MVP: solo PROPIETARIO (DECISION-OS-ANALISIS.md §8, corregido en revisión).
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const sinPlan = await bloqueoPorPlan(sesion.studioId);
  if (sinPlan) return sinPlan;

  const now = new Date();
  const fechaHoy = now.toISOString().slice(0, 10);
  const [resumenCompleto, pendientesCrudos, actividadRes, mensajeHoy, mensajesRecientes, outcomesRecientes, nAutonomasHoy] = await Promise.all([
    dbGetResumenDiarioReciente(sesion.studioId, now),
    dbListPendientes(sesion.studioId),
    requireSupabaseAdmin().from('actividad_reciente').select('*').eq('studio_id', sesion.studioId).order('creado_en', { ascending: false }).limit(10),
    dbGetMensajeDia(sesion.studioId, fechaHoy),
    dbListMensajesRecientes(sesion.studioId, now, 7),
    dbListOutcomesRecientes(sesion.studioId, 3),
    dbCountAutonomasHoy(sesion.studioId, now),
  ]);

  // MARKETING queda fuera de TODO lo que ve el cliente mientras el módulo
  // siga congelado (`MARKETING_MODULE_ENABLED`, lib/feature-flags.ts) — mismo
  // criterio que ya aplica `motor.ts` para no generarle candidatas nuevas.
  // Sin este filtro, una recomendación vieja de cuando el módulo estuvo
  // reactivado brevemente (ago-2026) seguía colándose como tarjeta real en
  // "Recomendaciones de hoy" Y como especialista vivo en "Mi Equipo",
  // prometiendo una campaña que /marketing no existe para cumplir (queja de
  // producto, 23-sep-2026). Un solo filtro en el origen cubre los tres sitios
  // que consumen `pendientes` de abajo.
  const pendientes = MARKETING_MODULE_ENABLED
    ? pendientesCrudos
    : pendientesCrudos.filter(r => r.especialista !== 'MARKETING');

  // `estadoGeneral` es un dato interno del director (director.ts, para
  // redactar el saludo) sin ningún consumidor en el cliente desde que
  // ExecutiveSummary quitó su badge — auditoría de arquitectura, 22-sep-2026.
  // Se recorta aquí para que el contrato del cliente no siga prometiendo un
  // campo que nadie pinta.
  const resumen = resumenCompleto
    ? (({ estadoGeneral: _estadoGeneral, ...resto }) => resto)(resumenCompleto)
    : null;

  // El Umbral (lib/decision/umbral.ts): el veredicto del día es el elemento
  // principal de la pantalla — construido a partir de `decision_mensajes_dia`,
  // no de la lista completa de pendientes.
  // Acotada al estudio de la sesión: se lee con service-role y se devuelve tal
  // cual en `veredicto.recomendacion`, así que un `recomendacion_id` que no
  // fuera de este estudio no puede enseñar la de otro. Si la lectura falla, un
  // error que se pueda reintentar: sin ella, el veredicto diría «Todo bajo
  // control» sobre el mensaje del día que no se ha podido leer.
  const recomendacionGanadora = mensajeHoy?.tipo === 'MENSAJE' && mensajeHoy.recomendacionId
    ? await dbGetRecomendacion(mensajeHoy.recomendacionId, sesion.studioId)
    : null;
  if (recomendacionGanadora === undefined) {
    return NextResponse.json({ error: 'No se ha podido leer el mensaje de hoy. Vuelve a intentarlo.' }, { status: 500 });
  }
  // Qué hace de verdad el botón principal de cada recomendación que se pinta
  // (lib/decision/efecto-aprobar.ts): cobrar, mandarle un mensaje a la socia o
  // solo marcarla. Lo dice el servidor, que es quien la ejecuta, y con los
  // canales de AHORA: sin email ni WhatsApp por el que llegarle, «Enviarle el
  // mensaje» no se ofrece (lib/decision/canales-socia.ts, una consulta).
  const canales = await canalesDeSocias(sesion.studioId, [
    ...(recomendacionGanadora ? [recomendacionGanadora] : []), ...pendientes,
  ]);
  const conEfecto = (r: Recomendacion) => ({ ...r, efecto: efectoAlAprobar(r, canales(r)) });
  // Callar porque la apertura ya habló no es «una semana tranquila».
  const semanaTranquila = mensajesRecientes.length >= 5
    && mensajesRecientes.every(m => m.tipo === 'SILENCIO' && m.motivoSilencio !== MOTIVO_SILENCIO_APERTURA);
  const veredicto = {
    tipo: mensajeHoy?.tipo ?? ('SIN_ANALIZAR' as const),
    recomendacion: recomendacionGanadora ? conEfecto(recomendacionGanadora) : null,
    fraseConfianza: recomendacionGanadora ? fraseConfianza(recomendacionGanadora.confianza.nivel) : null,
    semanaTranquila,
    porApertura: mensajeHoy?.tipo === 'SILENCIO' && mensajeHoy.motivoSilencio === MOTIVO_SILENCIO_APERTURA,
  };
  const seguimiento = outcomesRecientes.map(o => ({
    outcome: o.outcome, tipo: o.recomendacionTipo, titulo: o.recomendacionTitulo,
    socioId: o.socioId, medidoEn: o.medidoEn,
  }));

  // Mismo score+prioridad ya persistidos por el análisis; aquí solo se
  // selecciona qué cabe en el bloque Prioridades (≤3, ≤2/especialista).
  const prioridades = seleccionarPrioridadesHome(pendientes);
  // El resto de situaciones detectadas (MEDIA/BAJA, o las que no cupieron en el
  // cap de Prioridades) también deben ser ACCIONABLES: antes solo se contaban en
  // "Mi Equipo" pero no se mostraban en ningún sitio, así que un especialista con
  // "7 situaciones pendientes" no dejaba ver NINGUNA. Se devuelven ordenadas por
  // score para pintarlas como tarjetas bajo Prioridades.
  const idsPrioridad = new Set(prioridades.map(r => r.id));
  const masSituaciones = pendientes
    .filter(r => !idsPrioridad.has(r.id))
    .sort((a, b) => b.score - a.score);

  // Sembrado con los especialistas MVP activos (ESPECIALISTAS en
  // lib/decision/especialistas/contrato.ts): un especialista con 0 pendientes
  // igual muestra su tarjeta ("todo en orden"), no desaparece de Mi Equipo.
  // MARKETING no se siembra mientras el módulo siga congelado: `pendientes`
  // ya viene sin sus filas (filtro de arriba), así que si se sembrara vacío
  // aquí aparecería como "especialista al día" en vez de no aparecer.
  const porEspecialistaMap = new Map<EspecialistaId, Recomendacion[]>([
    ['RETENCION', []], ['INGRESOS', []], ['AGENDA', []], ['CAPTACION', []],
    ['FINANZAS', []], ['EQUIPO', []], ['ONBOARDING', []],
    ...(MARKETING_MODULE_ENABLED ? [['MARKETING', []] as [EspecialistaId, Recomendacion[]]] : []),
  ]);
  for (const r of pendientes) {
    const arr = porEspecialistaMap.get(r.especialista) ?? [];
    arr.push(r);
    porEspecialistaMap.set(r.especialista, arr);
  }
  const porEspecialista = [...porEspecialistaMap.entries()].map(([especialista, recs]) => {
    const eurMesDe = (imp: Impacto) => (imp.unidad === 'EUR' ? imp.valor / 3 : imp.valor);
    const valorTotal = recs.reduce((acc, r) => acc + (r.impacto ? eurMesDe(r.impacto) : 0), 0);
    const impactoTotal: Impacto | null = valorTotal > 0
      ? { valor: Math.round(valorTotal * 100) / 100, unidad: 'EUR_MES', formula: '' }
      : null;
    return { especialista, pendientes: recs.length, impactoTotal, estado: calcularEstadoEspecialista(recs) };
  });

  // Mapeo manual snake_case→camelCase: mapActividadReciente() vive privado en
  // supabase-data.ts, no se exporta (Arquitectura §5 — este módulo no lo toca).
  const actividad: ActividadReciente[] = (actividadRes.data ?? []).map(r => ({
    id: r.id, studioId: r.studio_id, tipo: r.tipo, texto: r.texto,
    socioId: r.socio_id ?? null, enlace: r.enlace ?? null, creadoEn: r.creado_en,
    actorNombre: r.actor_nombre ?? null,
  }));

  return NextResponse.json({
    resumen,
    veredicto,
    seguimiento,
    prioridades: prioridades.map(conEfecto),
    masSituaciones: masSituaciones.map(conEfecto),
    porEspecialista,
    actividad,
    // Reorganización Centro de Control §1: cuenta lo que el piloto automático
    // ya resolvió hoy sin esperar criterio — reusa dbCountAutonomasHoy (ya
    // existía para el cupo diario del piloto, sin caller aquí hasta ahora).
    nAutonomasHoy,
  });
}
