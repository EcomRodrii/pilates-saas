// Señales: hechos derivados del snapshot, compartidos por todos los
// especialistas (DECISION-OS-NUCLEO.md §1). Índices Map precomputados UNA vez
// (patrón P0-19 de lib/automation-engine.ts) — nadie vuelve a iterar las
// colecciones completas por socia.
import type { Reserva, Suscripcion, PlanTarifa, AutomationLog, Recibo, Socio, Sesion, TipoClase } from '@/lib/types';
import type { SnapshotEstudio } from './tipos.ts';

export interface IndicesSenal {
  socioPorId: Map<string, Socio>;
  planPorId: Map<string, PlanTarifa>;
  sesionPorId: Map<string, Sesion>;
  tipoClasePorId: Map<string, TipoClase>;
  // Reservas ASISTIDA por socia, ordenadas desc por creadoEn (fecha de asistencia).
  asistidasPorSocio: Map<string, Reserva[]>;
  // Todas las reservas por socia (cualquier estado), ordenadas desc por creadoEn.
  todasPorSocio: Map<string, Reserva[]>;
  suscripcionActivaPorSocio: Map<string, Suscripcion>;
  // Todas las suscripciones por socia (cualquier estado), ordenadas desc por
  // fechaInicio — para detectar bajas que NO renovaron (sin ACTIVA vigente).
  suscripcionesPorSocio: Map<string, Suscripcion[]>;
  recibosCobradosPorSocio: Map<string, Recibo[]>;
  recibosPendientes: Recibo[];
  logsPorSocio: Map<string, AutomationLog[]>;
  // Plazas ocupadas (estado != CANCELADA) por sesión.
  ocupadasPorSesion: Map<string, number>;
}

function agrupar<T>(items: T[], claveDe: (item: T) => string | null | undefined): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const clave = claveDe(item);
    if (!clave) continue;
    const arr = mapa.get(clave);
    if (arr) arr.push(item); else mapa.set(clave, [item]);
  }
  return mapa;
}

function ordenarDesc(reservas: Reserva[]): Reserva[] {
  return [...reservas].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export function construirIndices(s: SnapshotEstudio): IndicesSenal {
  const asistidasPorSocioRaw = agrupar(s.reservas.filter(r => r.estado === 'ASISTIDA'), r => r.socioId);
  const todasPorSocioRaw = agrupar(s.reservas, r => r.socioId);

  const asistidasPorSocio = new Map<string, Reserva[]>();
  for (const [k, v] of asistidasPorSocioRaw) asistidasPorSocio.set(k, ordenarDesc(v));
  const todasPorSocio = new Map<string, Reserva[]>();
  for (const [k, v] of todasPorSocioRaw) todasPorSocio.set(k, ordenarDesc(v));

  const suscripcionActivaPorSocio = new Map<string, Suscripcion>();
  for (const sus of s.suscripciones) {
    if (sus.estado === 'ACTIVA' && !suscripcionActivaPorSocio.has(sus.socioId)) {
      suscripcionActivaPorSocio.set(sus.socioId, sus);
    }
  }

  const suscripcionesPorSocioRaw = agrupar(s.suscripciones, sus => sus.socioId);
  const suscripcionesPorSocio = new Map<string, Suscripcion[]>();
  for (const [k, v] of suscripcionesPorSocioRaw) {
    suscripcionesPorSocio.set(k, [...v].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio)));
  }

  const recibosCobradosPorSocio = agrupar(
    s.recibos.filter(r => r.estado === 'COBRADO' && r.socioId),
    r => r.socioId
  );

  const ocupadasPorSesion = new Map<string, number>();
  for (const r of s.reservas) {
    if (r.estado === 'CANCELADA') continue;
    ocupadasPorSesion.set(r.sesionId, (ocupadasPorSesion.get(r.sesionId) ?? 0) + 1);
  }

  return {
    socioPorId: new Map(s.socios.map(soc => [soc.id, soc])),
    planPorId: new Map(s.planesTarifa.map(p => [p.id, p])),
    sesionPorId: new Map(s.sesiones.map(se => [se.id, se])),
    tipoClasePorId: new Map(s.tiposClase.map(t => [t.id, t])),
    asistidasPorSocio,
    todasPorSocio,
    suscripcionActivaPorSocio,
    suscripcionesPorSocio,
    recibosCobradosPorSocio,
    recibosPendientes: s.recibos.filter(r => r.estado === 'PENDIENTE'),
    logsPorSocio: agrupar(s.automationLogs, l => l.socioId),
    ocupadasPorSesion,
  };
}

const MS_DIA = 86400000;

/**
 * Media de asistencias/semana en las 8 semanas previas a la última asistencia.
 * Requiere al menos 4 asistencias en esa ventana para ser válida — si no, null
 * (socia con historial insuficiente; ver casos borde, Núcleo §9).
 */
export function frecuenciaHabitual(socioId: string, idx: IndicesSenal): number | null {
  const asistidas = idx.asistidasPorSocio.get(socioId) ?? [];
  if (asistidas.length === 0) return null;
  const ultimaTs = new Date(asistidas[0].creadoEn).getTime();
  const desde = ultimaTs - 8 * 7 * MS_DIA;
  const enVentana = asistidas.filter(r => {
    const ts = new Date(r.creadoEn).getTime();
    return ts >= desde && ts <= ultimaTs;
  });
  if (enVentana.length < 4) return null;
  return enVentana.length / 8;
}

/** Días desde la última asistencia. null = nunca ha asistido. */
export function diasSinVenir(socioId: string, idx: IndicesSenal, now: Date): number | null {
  const asistidas = idx.asistidasPorSocio.get(socioId) ?? [];
  if (asistidas.length === 0) return null;
  return Math.floor((now.getTime() - new Date(asistidas[0].creadoEn).getTime()) / MS_DIA);
}

/**
 * Umbral de ausencia anómala, relativo a la frecuencia habitual de la socia
 * (Núcleo §1): max(14, 3 × (7 / frecuenciaHabitual)). Sin frecuencia válida,
 * umbral absoluto conservador de 21 días (Núcleo §9).
 */
export function umbralAnomalo(socioId: string, idx: IndicesSenal): number {
  const freq = frecuenciaHabitual(socioId, idx);
  if (freq === null || freq <= 0) return 21;
  return Math.max(14, 3 * (7 / freq));
}

export function ausenciaAnomala(socioId: string, idx: IndicesSenal, now: Date): boolean {
  const dias = diasSinVenir(socioId, idx, now);
  if (dias === null) return false;
  return dias > umbralAnomalo(socioId, idx);
}

/** Días hasta el fin de la suscripción ACTIVA. null = sin suscripción activa o sin fecha de fin. */
export function renovacionProxima(socioId: string, idx: IndicesSenal, now: Date): number | null {
  const sus = idx.suscripcionActivaPorSocio.get(socioId);
  if (!sus || !sus.fechaFin) return null;
  return Math.floor((new Date(sus.fechaFin).getTime() - now.getTime()) / MS_DIA);
}

/**
 * Valor mensual de la socia (Núcleo §1): precio del plan ACTIVO; para bonos,
 * precio/sesiones × frecuenciaHabitual × 4.33; fallback: media de recibos
 * COBRADOS de los últimos 90 días ÷ 3.
 */
export function valorMensual(socioId: string, idx: IndicesSenal, now: Date): number {
  const sus = idx.suscripcionActivaPorSocio.get(socioId);
  if (sus) {
    const plan = idx.planPorId.get(sus.planId);
    if (plan) {
      if (plan.tipo === 'BONO') {
        if (plan.sesiones && plan.sesiones > 0) {
          const freq = frecuenciaHabitual(socioId, idx);
          if (freq !== null) return (plan.precio / plan.sesiones) * freq * 4.33;
        }
        // bono sin frecuencia fiable → cae al fallback de recibos, no al precio bruto del bono
      } else {
        return plan.precio;
      }
    }
  }
  const recibos = (idx.recibosCobradosPorSocio.get(socioId) ?? []).filter(r => {
    if (!r.fechaCobro) return false;
    return now.getTime() - new Date(r.fechaCobro).getTime() <= 90 * MS_DIA;
  });
  if (recibos.length === 0) return 0;
  return recibos.reduce((acc, r) => acc + r.importe, 0) / 3;
}

/** Días desde el último contacto registrado (cualquier acción de automation_logs). null = nunca. */
export function diasDesdeUltimoContacto(socioId: string, idx: IndicesSenal, now: Date): number | null {
  const logs = idx.logsPorSocio.get(socioId) ?? [];
  if (logs.length === 0) return null;
  const masReciente = logs.reduce((max, l) => (l.ejecutadoEn > max.ejecutadoEn ? l : max));
  return Math.floor((now.getTime() - new Date(masReciente.ejecutadoEn).getTime()) / MS_DIA);
}

/**
 * Emails ejecutados en los últimos 60 días sin reserva posterior en los 7 días
 * siguientes a cada uno (Núcleo §1) — cuenta los que "no obtuvieron respuesta".
 */
export function emailsSinRespuesta(socioId: string, idx: IndicesSenal, now: Date): number {
  const logs = (idx.logsPorSocio.get(socioId) ?? []).filter(l =>
    l.resultado === 'EJECUTADO' &&
    l.accion === 'ENVIAR_EMAIL' &&
    now.getTime() - new Date(l.ejecutadoEn).getTime() <= 60 * MS_DIA
  );
  if (logs.length === 0) return 0;
  const reservas = idx.todasPorSocio.get(socioId) ?? [];
  let sinRespuesta = 0;
  for (const log of logs) {
    const logTs = new Date(log.ejecutadoEn).getTime();
    const huboReservaPosterior = reservas.some(r => {
      const rTs = new Date(r.creadoEn).getTime();
      return rTs > logTs && rTs <= logTs + 7 * MS_DIA;
    });
    if (!huboReservaPosterior) sinRespuesta++;
  }
  return sinRespuesta;
}

/** Reservas NO_ASISTIO / ASISTIDA / CANCELADA en los últimos 30 días, y el ratio de no-shows. */
export function noShow30d(socioId: string, idx: IndicesSenal, now: Date): { noShows: number; total: number; ratio: number } {
  const reservas = (idx.todasPorSocio.get(socioId) ?? []).filter(r => {
    if (now.getTime() - new Date(r.creadoEn).getTime() > 30 * MS_DIA) return false;
    return r.estado === 'NO_ASISTIO' || r.estado === 'ASISTIDA' || r.estado === 'CANCELADA';
  });
  const noShows = reservas.filter(r => r.estado === 'NO_ASISTIO').length;
  const total = reservas.length;
  return { noShows, total, ratio: total > 0 ? noShows / total : 0 };
}

/**
 * Baja silenciosa: la socia NO tiene suscripción ACTIVA vigente pero su última
 * suscripción venció/se canceló hace `maxDias` días o menos (Núcleo §1, hueco de
 * renovación). Devuelve los días desde que venció, o null si sigue con ACTIVA,
 * nunca tuvo suscripción, o la baja es demasiado antigua para reactivar.
 */
export function diasDesdeVencimientoSinRenovar(socioId: string, idx: IndicesSenal, now: Date, maxDias = 45): number | null {
  if (idx.suscripcionActivaPorSocio.has(socioId)) return null;
  const historial = idx.suscripcionesPorSocio.get(socioId) ?? [];
  if (historial.length === 0) return null;
  // La más reciente con fecha de fin en el pasado (venció o se canceló con fecha).
  let mejor: number | null = null;
  for (const sus of historial) {
    if (sus.estado === 'ACTIVA' || sus.estado === 'PAUSADA') continue;
    if (!sus.fechaFin) continue;
    const dias = Math.floor((now.getTime() - new Date(sus.fechaFin).getTime()) / MS_DIA);
    if (dias < 0) continue; // aún no ha vencido
    if (mejor === null || dias < mejor) mejor = dias;
  }
  if (mejor === null || mejor > maxDias) return null;
  return mejor;
}

/** Nº total de asistencias registradas en la ventana del snapshot — prueba de que la socia llegó a engancharse. */
export function totalAsistencias(socioId: string, idx: IndicesSenal): number {
  return (idx.asistidasPorSocio.get(socioId) ?? []).length;
}

/**
 * Recibos PENDIENTE vencidos SIN cobro automático posible (socia sin tarjeta
 * guardada), agrupados por socia. Ventana amplia por defecto (hasta 90 días) —
 * a diferencia de pagosEnRiesgo (reintento con tarjeta ≤30d), aquí la gestión es
 * manual y la deuda vieja es la que más urge reclamar. Solo socias activas.
 */
export function impagosManualesPorSocio(idx: IndicesSenal, now: Date, maxDias = 90): Map<string, Recibo[]> {
  const porSocio = new Map<string, Recibo[]>();
  for (const r of idx.recibosPendientes) {
    if (!r.socioId) continue;
    const socio = idx.socioPorId.get(r.socioId);
    if (!socio?.activo) continue;
    // Con tarjeta guardada → es trabajo de RECUPERAR_PAGOS (reintento auto), no de aquí.
    if (socio.stripeCustomerId && socio.stripePaymentMethodId) continue;
    const dias = Math.floor((now.getTime() - new Date(r.fechaVencimiento).getTime()) / MS_DIA);
    if (dias < 0 || dias > maxDias) continue;
    const arr = porSocio.get(r.socioId) ?? [];
    arr.push(r);
    porSocio.set(r.socioId, arr);
  }
  return porSocio;
}

/** Recibos PENDIENTE vencidos (0..maxDias días de retraso), particionados por si la socia tiene tarjeta guardada. */
export function pagosEnRiesgo(idx: IndicesSenal, now: Date, maxDias = 30): { conTarjeta: Recibo[]; sinTarjeta: Recibo[] } {
  const vencidos = idx.recibosPendientes.filter(r => {
    const dias = Math.floor((now.getTime() - new Date(r.fechaVencimiento).getTime()) / MS_DIA);
    return dias >= 0 && dias <= maxDias;
  });
  const conTarjeta: Recibo[] = [];
  const sinTarjeta: Recibo[] = [];
  for (const r of vencidos) {
    const socio = r.socioId ? idx.socioPorId.get(r.socioId) : undefined;
    if (socio?.activo && socio.stripeCustomerId && socio.stripePaymentMethodId) conTarjeta.push(r);
    else sinTarjeta.push(r);
  }
  return { conTarjeta, sinTarjeta };
}

export interface FranjaRecurrente {
  clave: string; // `${diaSemana}-${hora}:${minuto}-${tipoClaseId}`
  sesionesOrdenadas: Sesion[]; // más reciente primero
  ocupaciones: number[]; // ratio ocupadas/aforo, alineado con sesionesOrdenadas
}

/**
 * Agrupa sesiones YA celebradas por franja recurrente (mismo día de la semana +
 * hora + tipo de clase), acotado a una ventana reciente — mismo patrón P0-19
 * que lib/automation-engine.ts CLASE_LLENA_RECURRENTE.
 */
export function agruparFranjasRecurrentes(idx: IndicesSenal, s: SnapshotEstudio, now: Date, ocurrenciasMinimas: number): Map<string, FranjaRecurrente> {
  const ventanaMs = (ocurrenciasMinimas + 3) * 7 * MS_DIA;
  const desde = now.getTime() - ventanaMs;
  const grupos = new Map<string, Sesion[]>();
  for (const se of s.sesiones) {
    if (se.cancelada) continue;
    const t = new Date(se.inicio).getTime();
    if (t > now.getTime() || t < desde) continue;
    const inicio = new Date(se.inicio);
    const clave = `${inicio.getUTCDay()}-${inicio.getUTCHours()}:${String(inicio.getUTCMinutes()).padStart(2, '0')}-${se.tipoClaseId}`;
    const grupo = grupos.get(clave) ?? [];
    grupo.push(se);
    grupos.set(clave, grupo);
  }
  const resultado = new Map<string, FranjaRecurrente>();
  for (const [clave, sesiones] of grupos) {
    const ordenadas = [...sesiones].sort((a, b) => b.inicio.localeCompare(a.inicio));
    const ocupaciones = ordenadas.map(se => {
      if (se.aforoMaximo <= 0) return 0;
      return (idx.ocupadasPorSesion.get(se.id) ?? 0) / se.aforoMaximo;
    });
    resultado.set(clave, { clave, sesionesOrdenadas: ordenadas, ocupaciones });
  }
  return resultado;
}

/** Clave de franja recurrente de una sesión (mismo formato que agruparFranjasRecurrentes). */
export function claveFranjaDe(se: Sesion): string {
  const inicio = new Date(se.inicio);
  return `${inicio.getUTCDay()}-${inicio.getUTCHours()}:${String(inicio.getUTCMinutes()).padStart(2, '0')}-${se.tipoClaseId}`;
}

/** ¿La franja sigue viva? — hay al menos una sesión FUTURA no cancelada en ella. */
export function hayProximaSesionEnFranja(clave: string, s: SnapshotEstudio, now: Date): boolean {
  return s.sesiones.some(se =>
    !se.cancelada && new Date(se.inicio).getTime() > now.getTime() && claveFranjaDe(se) === clave
  );
}

/** Media de socias en LISTA_ESPERA en las últimas N ocurrencias de una franja. */
export function demandaInsatisfecha(franja: FranjaRecurrente, s: SnapshotEstudio, n: number): number {
  const ultimasN = franja.sesionesOrdenadas.slice(0, n);
  if (ultimasN.length === 0) return 0;
  const idsSesion = new Set(ultimasN.map(se => se.id));
  const enEspera = s.reservas.filter(r => idsSesion.has(r.sesionId) && r.estado === 'LISTA_ESPERA').length;
  return enEspera / ultimasN.length;
}
