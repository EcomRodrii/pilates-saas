// Margen de contribución real por clase (informe estratégico ago-2026, Parte
// III.4.2): "la dueña piensa en meses, su software le da informes mensuales
// — pero su negocio ocurre por clases". Cálculo puro, on-demand, sin
// persistir nada: tarifas y precios de plan cambian, y una "unidad
// económica" congelada como hecho histórico sería una aproximación
// disfrazada de dato inmutable.
//
// No integrado en el Decision OS (Agenda/Umbral) — esas fórmulas usan un
// precio MEDIO de estudio a propósito, para decidir sobre franjas
// recurrentes, no sobre una clase suelta; mezclarlas arriesgaría su
// contrato ya testeado sin necesidad. Esto vive aparte, para Informes.
import type { Reserva, Sesion } from '@/lib/types';
import type { SnapshotEstudio } from './tipos.ts';
import { construirIndices, frecuenciaHabitual, type IndicesSenal } from './senales.ts';
import { precioMedioSesion } from './especialistas/agenda.ts';

export interface MargenSesion {
  sesionId: string;
  asistentes: number;
  ingresoImputado: number;
  // null = tarifa/hora de la instructora sin fijar (dato opcional, PR #562)
  // — nunca se asume 0€, que falsearía el margen al alza.
  costeInstructora: number | null;
  // Margen sobre coste de INSTRUCTORA, no total: no existe hoy ningún
  // concepto de coste de sala en el esquema (alquiler/coste-hora) — se
  // omite explícitamente en vez de aproximarlo a ciegas. Ver UI: se
  // etiqueta "margen sobre coste de instructora", nunca "margen total".
  margen: number | null;
  breakEvenAsistentes: number | null;
}

const MS_HORA = 3600000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** Ingreso real imputado a UN asistente de una sesión, por su plan real (no
 *  el promedio de estudio) — MENSUAL por su frecuencia real, BONO por
 *  precio/sesiones de su plan, PUNTUAL por el precio del plan si no hay
 *  `precioPuntual` propio en la sesión. */
function ingresoAsistente(socioId: string, idx: IndicesSenal): number {
  const sus = idx.suscripcionActivaPorSocio.get(socioId);
  if (!sus) return 0;
  const plan = idx.planPorId.get(sus.planId);
  if (!plan) return 0;
  if (plan.tipo === 'MENSUAL') {
    const freq = frecuenciaHabitual(socioId, idx);
    if (freq === null || freq <= 0) return 0;
    return plan.precio / (freq * 4.33);
  }
  if (plan.tipo === 'BONO' && plan.sesiones && plan.sesiones > 0) {
    return plan.precio / plan.sesiones;
  }
  if (plan.tipo === 'PUNTUAL') return plan.precio;
  return 0;
}

/** Asistentes que de verdad ocuparon plaza en la sesión (no lista de espera,
 *  no pendiente de aprobar, no cancelada). No-show excluido a propósito de
 *  v1 — el informe lo trata como señal de retención, no de ingreso. */
function asistentesReales(sesionId: string, reservas: Reserva[]): Reserva[] {
  return reservas.filter(r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'));
}

export function margenSesion(sesion: Sesion, s: SnapshotEstudio, idx: IndicesSenal): MargenSesion {
  const reservasSesion = asistentesReales(sesion.id, s.reservas);

  const ingresoImputado = sesion.precioPuntual !== null
    ? reservasSesion.length * sesion.precioPuntual
    : reservasSesion.reduce((acc, r) => acc + ingresoAsistente(r.socioId, idx), 0);

  const tarifaHora = s.instructorTarifas.get(sesion.instructorId) ?? null;
  const duracionHoras = (new Date(sesion.fin).getTime() - new Date(sesion.inicio).getTime()) / MS_HORA;
  const costeInstructora = tarifaHora === null ? null : redondear2(tarifaHora * duracionHoras);

  const precioMedio = precioMedioSesion(s, idx);
  const breakEvenAsistentes = costeInstructora !== null && precioMedio > 0
    ? Math.ceil(costeInstructora / precioMedio)
    : null;

  return {
    sesionId: sesion.id,
    asistentes: reservasSesion.length,
    ingresoImputado: redondear2(ingresoImputado),
    costeInstructora,
    margen: costeInstructora === null ? null : redondear2(ingresoImputado - costeInstructora),
    breakEvenAsistentes,
  };
}

/** Batch: calcula el índice UNA vez, no por sesión (mismo patrón que el
 *  resto de especialistas — `construirIndices` es la pieza cara). */
export function margenSesiones(sesiones: Sesion[], s: SnapshotEstudio): MargenSesion[] {
  const idx = construirIndices(s);
  return sesiones.map(se => margenSesion(se, s, idx));
}
