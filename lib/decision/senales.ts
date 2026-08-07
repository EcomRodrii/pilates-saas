// Señales: hechos derivados del snapshot, compartidos por todos los
// especialistas (DECISION-OS-NUCLEO.md §1). Índices Map precomputados UNA vez
// (patrón P0-19 de lib/engines/automation-engine.ts) — nadie vuelve a iterar las
// colecciones completas por socia.
import type { Reserva, Suscripcion, PlanTarifa, AutomationLog, Recibo, Socio, Sesion, TipoClase } from '@/lib/types';
import type { SnapshotEstudio, IntentoFallidoSnapshot } from './tipos.ts';
import { riesgoNoShow, type RiesgoNoShow, type ReservaHistorica } from '../no-show.ts';

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
  // Tarifa/hora por instructora (null = sin fijar). Construido aquí, no en
  // SnapshotEstudio (array JSON-safe) — ver InstructorTarifaSnapshot en tipos.ts.
  tarifaHoraPorInstructor: Map<string, number | null>;
  // Socios que cada socio ha REFERIDO (Socio.referidoPor), para onboarding.ts.
  referidosPorSocio: Map<string, Socio[]>;
  // Intentos de reserva self-service rechazados por socia, 90d (informe fila 14).
  intentosFallidosPorSocio: Map<string, IntentoFallidoSnapshot[]>;
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

  const tarifaHoraPorInstructor = new Map<string, number | null>(
    s.instructorTarifas.map(t => [t.instructorId, t.tarifaHora])
  );

  const referidosPorSocio = agrupar(s.socios, soc => soc.referidoPor);

  const intentosFallidosPorSocio = agrupar(s.intentosFallidos, i => i.socioId);

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
    tarifaHoraPorInstructor,
    referidosPorSocio,
    intentosFallidosPorSocio,
  };
}

const MS_DIA = 86400000;

function frecuenciaDesdeAsistidas(asistidas: Reserva[]): number | null {
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

/**
 * Media de asistencias/semana en las 8 semanas previas a la última asistencia.
 * Requiere al menos 4 asistencias en esa ventana para ser válida — si no, null
 * (socia con historial insuficiente; ver casos borde, Núcleo §9).
 */
export function frecuenciaHabitual(socioId: string, idx: IndicesSenal): number | null {
  return frecuenciaDesdeAsistidas(idx.asistidasPorSocio.get(socioId) ?? []);
}

/**
 * Igual que `frecuenciaHabitual`, pero acotada a UN tipo de clase (Finanzas
 * F2, informe fila 16). Necesaria para no inflar la frecuencia con
 * asistencias de otra disciplina — una socia con bono de Mat que también
 * hace Reformer con otro plan (`planes_por_tipo_de_clase`, mismo punto ciego
 * que ya corrigió F1 en P2-5) tendría una `frecuenciaHabitual` total mayor
 * que su frecuencia real en Mat, abaratando artificialmente el coste
 * estimado de un mensual de Mat. `tipoClaseId: null` = sin acotar (mismo
 * resultado que `frecuenciaHabitual`, para planes que cubren todas las clases).
 */
export function frecuenciaHabitualPorTipoClase(socioId: string, tipoClaseId: string | null, idx: IndicesSenal): number | null {
  const asistidas = idx.asistidasPorSocio.get(socioId) ?? [];
  if (tipoClaseId === null) return frecuenciaDesdeAsistidas(asistidas);
  return frecuenciaDesdeAsistidas(asistidas.filter(r => idx.sesionPorId.get(r.sesionId)?.tipoClaseId === tipoClaseId));
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

/** Días desde el alta de la socia. null si no se encuentra en el índice. */
export function diasDesdeAlta(socioId: string, idx: IndicesSenal, now: Date): number | null {
  const socio = idx.socioPorId.get(socioId);
  if (!socio) return null;
  return Math.floor((now.getTime() - new Date(socio.fechaAlta).getTime()) / MS_DIA);
}

/** Asistencias (ASISTIDA) dentro de los primeros 30 días desde el alta. */
export function visitasEnOnboarding(socioId: string, idx: IndicesSenal): number {
  const socio = idx.socioPorId.get(socioId);
  if (!socio) return 0;
  const desde = new Date(socio.fechaAlta).getTime();
  const hasta = desde + 30 * MS_DIA;
  const asistidas = idx.asistidasPorSocio.get(socioId) ?? [];
  return asistidas.filter(r => {
    const t = new Date(r.creadoEn).getTime();
    return t >= desde && t < hasta;
  }).length;
}

/**
 * Socias que ESTA socia trajo (Socio.referidoPor) y que ya hicieron su
 * primera clase dentro de los 30 días de onboarding de la referidora —
 * "conocidas" del informe estratégico. La primera asistencia de un referido
 * es la más antigua de `asistidasPorSocio` (ordenado desc), mismo criterio
 * que `esPrimeraAsistencia` (lib/booking-logic.ts) usa para el premio de
 * referidos — no se reinventa el criterio, solo se consulta con fecha.
 */
export function conocidasEnOnboarding(socioId: string, idx: IndicesSenal): number {
  const socio = idx.socioPorId.get(socioId);
  if (!socio) return 0;
  const desde = new Date(socio.fechaAlta).getTime();
  const hasta = desde + 30 * MS_DIA;
  const referidos = idx.referidosPorSocio.get(socioId) ?? [];
  let n = 0;
  for (const referido of referidos) {
    const asistidas = idx.asistidasPorSocio.get(referido.id) ?? [];
    if (asistidas.length === 0) continue;
    const primera = asistidas[asistidas.length - 1];
    const t = new Date(primera.creadoEn).getTime();
    if (t >= desde && t < hasta) n++;
  }
  return n;
}

/**
 * Nº de intentos de reserva self-service rechazados por la socia dentro de
 * `ventanaDias` (informe fila 14 — "quería pagar y no pudo"). Cuenta
 * cualquier motivo por igual: lo que importa es la frustración repetida, no
 * la causa concreta (aforo lleno vs. sin plan son ambas fricción real).
 */
export function intentosFallidosRecientes(socioId: string, idx: IndicesSenal, now: Date, ventanaDias: number): number {
  const intentos = idx.intentosFallidosPorSocio.get(socioId) ?? [];
  const desde = now.getTime() - ventanaDias * MS_DIA;
  return intentos.filter(i => new Date(i.creadoEn).getTime() >= desde).length;
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

/**
 * Riesgo de plantón de una socia con el score graduado de lib/no-show.ts —
 * sustituye al antiguo umbral booleano `noShow30d` (≥3 no-shows y ratio≥40%,
 * que trataba igual a quien falló 3 de 4 la semana pasada que a quien falló 3
 * de 40 hace dos meses; ver la cabecera de no-show.ts para el resto de razones).
 *
 * Traduce las reservas de la socia (creadoEn) a historial por FECHA DE CLASE
 * (idx.sesionPorId → inicio), que es lo que riesgoNoShow necesita para pesar
 * por recencia real. Una reserva cuya sesión no está en el snapshot se omite
 * en vez de sustituir por creadoEn — mentir la fecha sería peor que no contarla.
 */
export function riesgoNoShowDeSocio(socioId: string, idx: IndicesSenal, now: Date): RiesgoNoShow {
  const reservas = idx.todasPorSocio.get(socioId) ?? [];
  const historial: ReservaHistorica[] = [];
  for (const r of reservas) {
    const sesion = idx.sesionPorId.get(r.sesionId);
    if (sesion) historial.push({ estado: r.estado, fecha: sesion.inicio });
  }
  return riesgoNoShow(historial, now);
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
 * que lib/engines/automation-engine.ts CLASE_LLENA_RECURRENTE.
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

export interface VariacionOcupacion {
  /** (mediaReciente - mediaAnterior) / mediaAnterior — ej. -0.11 = cayó 11%. */
  pctVariacion: number;
  mediaReciente: number;
  mediaAnterior: number;
}

/**
 * Variación de ocupación entre dos ventanas consecutivas de `n` ocurrencias de
 * una misma franja recurrente (últimas n vs. las n inmediatamente anteriores).
 * Null si no hay las 2n ocurrencias completas — nunca extrapola con muestra
 * parcial, mismo principio anti-injusticia que confianza.ts. `n` se pasa desde
 * el caller (agenda.ts, OCURRENCIAS_MINIMAS) en vez de fijarse aquí, para
 * mantener esa constante en un único sitio.
 */
export function variacionOcupacionFranja(franja: FranjaRecurrente, n: number): VariacionOcupacion | null {
  if (franja.ocupaciones.length < n * 2) return null;
  const reciente = franja.ocupaciones.slice(0, n);
  const anterior = franja.ocupaciones.slice(n, n * 2);
  const mediaReciente = reciente.reduce((a, b) => a + b, 0) / n;
  const mediaAnterior = anterior.reduce((a, b) => a + b, 0) / n;
  if (mediaAnterior === 0) return null;
  return { pctVariacion: (mediaReciente - mediaAnterior) / mediaAnterior, mediaReciente, mediaAnterior };
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

/**
 * Precio medio por sesión, ponderado por socias activas (mismo criterio que
 * Ingresos §2.2). Compartido: lo usa Agenda para valorar plazas vacías en una
 * franja infrautilizada, y margen-clase.ts como precio de referencia del
 * break-even de una clase suelta — señal genérica de "cuánto vale en
 * promedio una plaza", no propia de ningún especialista.
 */
export function precioMedioSesion(s: SnapshotEstudio, idx: IndicesSenal): number {
  const precios: number[] = [];
  for (const socio of s.socios) {
    if (!socio.activo) continue;
    const sus = idx.suscripcionActivaPorSocio.get(socio.id);
    if (!sus) continue;
    const plan = idx.planPorId.get(sus.planId);
    if (!plan) continue;
    if (plan.tipo === 'MENSUAL') {
      const freq = frecuenciaHabitual(socio.id, idx);
      if (freq !== null && freq > 0) precios.push(plan.precio / (freq * 4.33));
    } else if (plan.tipo === 'BONO' && plan.sesiones && plan.sesiones > 0) {
      precios.push(plan.precio / plan.sesiones);
    } else if (plan.tipo === 'PUNTUAL') {
      precios.push(plan.precio);
    }
  }
  if (precios.length === 0) return 0;
  return precios.reduce((a, b) => a + b, 0) / precios.length;
}
