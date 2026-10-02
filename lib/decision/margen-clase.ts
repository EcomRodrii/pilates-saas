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
import type { Reserva, Sesion, Suscripcion } from '@/lib/types';
import type { SnapshotEstudio } from './tipos.ts';
import { PREFIJO_SUSCRIPCION_DE_CLASE_SUELTA } from '../reservas/clase-suelta.ts';
import { construirIndices, frecuenciaHabitual, precioMedioSesion, type IndicesSenal } from './senales.ts';

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

/** La suscripción que pagó esta plaza. Si la reserva gastó una sesión, es
 *  ESA (`bonoSuscripcionId`, la decide `reservar_plaza`), esté como esté hoy.
 *  Si no (cuota, o reserva de antes de rastrearlo), la ACTIVA de la socia que
 *  cubre este tipo de clase. Itera TODAS las suscripciones ACTIVAS (no
 *  `idx.suscripcionActivaPorSocio`, índice de UNA sola por socia) — con
 *  `planes_por_tipo_de_clase` una socia puede tener un MENSUAL general Y un
 *  bono de un tipo de clase concreto a la vez (mismo punto ciego ya corregido
 *  en finanzas.ts F1). Si más de una cubre, prioriza la más específica (con
 *  `tiposClaseIds` propio) sobre la genérica. Nunca una clase suelta del
 *  mostrador que no gastó esta reserva: es de UNA clase, y gastada sigue
 *  ACTIVA para siempre (se imputaría su precio a clases pagadas con otra cosa). */
function suscripcionParaClase(reserva: Reserva, tipoClaseId: string, s: SnapshotEstudio, idx: IndicesSenal): Suscripcion | null {
  const gastada = reserva.bonoSuscripcionId ? s.suscripciones.find(sus => sus.id === reserva.bonoSuscripcionId) : undefined;
  if (gastada) return gastada;
  const socioId = reserva.socioId;
  const cubren = s.suscripciones.filter(sus => {
    if (sus.socioId !== socioId || sus.estado !== 'ACTIVA') return false;
    if (sus.id.startsWith(PREFIJO_SUSCRIPCION_DE_CLASE_SUELTA)) return false;
    const plan = idx.planPorId.get(sus.planId);
    if (!plan) return false;
    return !plan.tiposClaseIds || plan.tiposClaseIds.length === 0 || plan.tiposClaseIds.includes(tipoClaseId);
  });
  if (cubren.length === 0) return null;
  const especifica = cubren.find(sus => (idx.planPorId.get(sus.planId)?.tiposClaseIds?.length ?? 0) > 0);
  return especifica ?? cubren[0];
}

/** Ingreso real imputado a UN asistente de una sesión, por su plan real (no
 *  el promedio de estudio) — MENSUAL por su frecuencia real, BONO por
 *  precio/sesiones de su plan, PUNTUAL por el precio del plan.
 *
 *  La clase suelta del mostrador es, desde el 2-oct-2026, la tarifa PUNTUAL
 *  que gasta la reserva (lib/reservas/clase-suelta.ts), igual que la que se
 *  compra en la app: cuenta aquí por el precio de la tarifa, en la reserva que
 *  la gastó. Límite v1: si la sesión tiene precio propio (un taller), lo
 *  cobrado puede ser otro; y los recibos sueltos de antes (`rec-suelta-` sin
 *  suscripción, #2467) no tienen suscripción y caen en el `precioPuntual` de
 *  abajo. */
function ingresoAsistente(reserva: Reserva, tipoClaseId: string, sesion: Sesion, s: SnapshotEstudio, idx: IndicesSenal): number {
  const sus = suscripcionParaClase(reserva, tipoClaseId, s, idx);
  if (sus) {
    const plan = idx.planPorId.get(sus.planId);
    if (plan) {
      if (plan.tipo === 'MENSUAL') {
        const freq = frecuenciaHabitual(reserva.socioId, idx);
        return freq !== null && freq > 0 ? plan.precio / (freq * 4.33) : 0;
      }
      if (plan.tipo === 'BONO' && plan.sesiones && plan.sesiones > 0) return plan.precio / plan.sesiones;
      if (plan.tipo === 'PUNTUAL') return plan.precio;
    }
  }
  // Sin suscripción que cubra esta clase: si la sesión tiene precio de
  // clase suelta propio, es la mejor aproximación disponible para v1.
  return sesion.precioPuntual ?? 0;
}

/** Asistentes que de verdad ocuparon plaza en la sesión (no lista de espera,
 *  no pendiente de aprobar, no cancelada). No-show excluido a propósito de
 *  v1 — el informe lo trata como señal de retención, no de ingreso. */
function asistentesReales(sesionId: string, reservas: Reserva[]): Reserva[] {
  return reservas.filter(r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'));
}

export function margenSesion(sesion: Sesion, s: SnapshotEstudio, idx: IndicesSenal): MargenSesion {
  const reservasSesion = asistentesReales(sesion.id, s.reservas);

  const ingresoImputado = reservasSesion.reduce(
    (acc, r) => acc + ingresoAsistente(r, sesion.tipoClaseId, sesion, s, idx), 0
  );

  const tarifaHora = idx.tarifaHoraPorInstructor.get(sesion.instructorId) ?? null;
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
