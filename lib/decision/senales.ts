// Señales: hechos derivados del snapshot, compartidos por todos los
// especialistas (DECISION-OS-NUCLEO.md §1). Índices Map precomputados UNA vez
// (patrón P0-19 de lib/engines/automation-engine.ts) — nadie vuelve a iterar las
// colecciones completas por socia.
import type { Reserva, Suscripcion, PlanTarifa, AutomationLog, Recibo, Socio, Sesion, TipoClase } from '@/lib/types';
import type { SnapshotEstudio, IntentoFallidoSnapshot } from './tipos.ts';
import { riesgoNoShow, type RiesgoNoShow, type ReservaHistorica } from '../no-show.ts';
import { franjaLocalDe } from '../utils.ts';
import { tieneEntitlementActivo } from '../bono-logic.ts';

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
  // Todas las reservas de cada sesión, sin filtrar. La necesita el pronóstico
  // de llenado (A4), que no cuenta cabezas sino CUÁNDO se reservó cada plaza —
  // `ocupadasPorSesion` ya perdió esa información, y además incluye
  // LISTA_ESPERA/PENDIENTE_APROBACION, que no ocupan asiento (ver
  // reservasQueOcupanPlaza).
  reservasPorSesion: Map<string, Reserva[]>;
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

// Los índices de un snapshot dado, calculados UNA vez.
//
// Cada especialista llamaba a construirIndices() por su cuenta y motor.ts una
// novena vez, así que el mismo trabajo se repetía 9 veces por análisis: medido
// sobre un snapshot de tamaño realista (cadena de 2 sedes, 850 socias, 30.000
// reservas de 180 días) son ~690 ms tirados por estudio y por pasada.
//
// Se resuelve aquí y no cambiando la firma de Especialista.detectar() porque
// el snapshot es de solo lectura de punta a punta del pipeline (lo construye
// `construirSnapshot` y nadie lo muta), así que cachear por identidad de objeto
// es correcto por construcción y no obliga a tocar los 8 especialistas ni sus
// tests. WeakMap y no Map: cuando el análisis del estudio termina y el snapshot
// deja de estar referenciado, su entrada se recoge sola — sin fugas entre los
// estudios de un mismo fan-out.
//
// ⚠️ La condición que lo sostiene: NADIE muta un SnapshotEstudio después de
// construirlo. Si algún día hiciera falta, hay que clonar el snapshot, no
// modificarlo en sitio — si no, los índices quedarían viejos en silencio.
const INDICES_POR_SNAPSHOT = new WeakMap<SnapshotEstudio, IndicesSenal>();

export function construirIndices(s: SnapshotEstudio): IndicesSenal {
  const cacheado = INDICES_POR_SNAPSHOT.get(s);
  if (cacheado) return cacheado;
  const indices = calcularIndices(s);
  INDICES_POR_SNAPSHOT.set(s, indices);
  return indices;
}

function calcularIndices(s: SnapshotEstudio): IndicesSenal {
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

  const reservasPorSesion = agrupar(s.reservas, r => r.sesionId);

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
    reservasPorSesion,
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
 * true si, dentro de la ventana, TODOS los intentos fallidos son SIN_PLAN
 * (nunca le asignaron un plan/bono) — nunca mezclado con fricción real
 * (aforo lleno, fuera de ventana...). El conteo de `intentosFallidosRecientes`
 * sigue tratando todos los motivos por igual a propósito (ver su comentario);
 * esto es solo para decidir qué REDACCIÓN usar, no si la alerta salta ni con
 * qué confianza — "no consigue reservar" suena a fallo del sistema cuando en
 * realidad es un pendiente comercial (falta asignarle el plan).
 */
export function esSoloFaltaDePlan(socioId: string, idx: IndicesSenal, now: Date, ventanaDias: number): boolean {
  const desde = now.getTime() - ventanaDias * MS_DIA;
  const intentos = (idx.intentosFallidosPorSocio.get(socioId) ?? [])
    .filter(i => new Date(i.creadoEn).getTime() >= desde);
  return intentos.length > 0 && intentos.every(i => i.motivo === 'SIN_PLAN');
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

// ── Historial de cobro de una socia (Fase 3 del Brain) ──────────────────────
//
// El dunning de hoy es 100 % reactivo: reintenta DESPUÉS de que un cobro haya
// fallado. Esto es lo que permite mirar hacia delante — quién tiene pinta de
// fallar la próxima vez, mirando lo que le ha pasado hasta ahora.

export interface HistorialCobro {
  /** Recibos suyos con desenlace conocido (cobrado, fallido o devuelto). */
  resueltos: number;
  /** De esos, los que acabaron entrando. */
  cobrados: number;
}

/**
 * Cuántos de sus recibos acabaron cobrándose. Solo cuenta los que YA tienen
 * desenlace: un PENDIENTE todavía no es ni un sí ni un no, y contarlo como
 * fallo penalizaría a quien sencillamente aún no ha llegado a su fecha —
 * mismo criterio que `dbCalcularSeguimientoPorTipo` con las PENDIENTE.
 *
 * ⚠️ DEVUELTO cuenta como NO cobrado aunque en su día entrara: para lo que se
 * quiere predecir —si el dinero se va a quedar en la cuenta del estudio— una
 * devolución es exactamente igual de mala que un impago.
 */
export function historialCobroDeSocio(socioId: string, s: SnapshotEstudio): HistorialCobro {
  let resueltos = 0, cobrados = 0;
  for (const r of s.recibos) {
    if (r.socioId !== socioId) continue;
    if (r.estado === 'COBRADO') { resueltos++; cobrados++; }
    else if (r.estado === 'FALLIDO' || r.estado === 'DEVUELTO') resueltos++;
  }
  return { resueltos, cobrados };
}

/** Lo mismo agregado a todo el estudio: la tasa base con la que se suaviza. */
export function historialCobroDelEstudio(s: SnapshotEstudio): HistorialCobro {
  let resueltos = 0, cobrados = 0;
  for (const r of s.recibos) {
    if (r.estado === 'COBRADO') { resueltos++; cobrados++; }
    else if (r.estado === 'FALLIDO' || r.estado === 'DEVUELTO') resueltos++;
  }
  return { resueltos, cobrados };
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

// ── Franja horaria LOCAL del estudio ────────────────────────────────────────
// Las sesiones son `timestamptz` absolutos. Agrupar "el martes a las 20:00" por
// UTC parece equivalente y no lo es: España cambia de offset dos veces al año,
// así que la MISMA clase semanal cae en 18:00 UTC en verano y 19:00 UTC en
// invierno — la franja recurrente se parte en dos al cruzar el cambio de hora,
// y una clase de 00:30 del martes se agrupa como lunes 22:30. Peor todavía, la
// etiqueta que lee la propietaria decía la hora UTC ("tu clase de las 18:00"
// para una clase de las 20:00). Mismo criterio que ya aplicó motor.ts al saludo
// del Director: la hora local del estudio, nunca UTC.
// `franjaLocalDe` vive en lib/utils.ts (junto a TZ_ESTUDIO) porque la comparten
// dos lados que no deberían importarse entre sí: este motor y el portal de la
// socia. Se reexporta aquí para no cambiar los imports de los especialistas.
export { franjaLocalDe, type FranjaLocal } from '../utils.ts';

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
    const clave = claveFranjaDe(se);
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

/**
 * Clave de franja recurrente de una sesión — la ÚNICA fuente del formato, que
 * usa también agruparFranjasRecurrentes. En hora local del estudio (ver
 * franjaLocalDe): con UTC, la misma clase semanal cambiaba de clave al cruzar
 * el cambio de hora y la franja no llegaba nunca a las ocurrencias mínimas.
 */
export function claveFranjaDe(se: Sesion): string {
  const { dow, hora, minuto } = franjaLocalDe(se.inicio);
  return `${dow}-${hora}:${String(minuto).padStart(2, '0')}-${se.tipoClaseId}`;
}

/** ¿La franja sigue viva? — hay al menos una sesión FUTURA no cancelada en ella. */
export function hayProximaSesionEnFranja(clave: string, s: SnapshotEstudio, now: Date): boolean {
  return s.sesiones.some(se =>
    !se.cancelada && new Date(se.inicio).getTime() > now.getTime() && claveFranjaDe(se) === clave
  );
}

// ── Pronóstico de llenado (A4) ──────────────────────────────────────────────
//
// Todo lo de arriba mira hacia atrás: "esta franja ha ido vacía". Esto mira
// hacia delante: "esta clase concreta del martes que viene va a ir vacía".
//
// La idea es que una reserva no aparece de golpe el día de la clase, sino que
// llega siguiendo una curva bastante estable por franja. Si el martes 18:00
// suele llevar 8 reservas a 5 días vista y este martes lleva 3, no hace falta
// esperar al martes para saber que algo va mal.

/** Estados que ocupan asiento de verdad. LISTA_ESPERA y PENDIENTE_APROBACION
 *  no lo ocupan (mismo criterio que la RPC reservar_plaza), y CANCELADA
 *  tampoco. NO_ASISTIO sí: la plaza estuvo cogida hasta el final. */
const ESTADOS_OCUPAN_PLAZA = new Set(['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);

export function reservasQueOcupanPlaza(sesionId: string, idx: IndicesSenal): Reserva[] {
  return (idx.reservasPorSesion.get(sesionId) ?? []).filter(r => ESTADOS_OCUPAN_PLAZA.has(r.estado));
}

/** Mediana, no media: una ocurrencia rara (un puente, una promoción) no debe
 *  arrastrar la referencia de toda la franja. */
function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[medio - 1] + orden[medio]) / 2 : orden[medio];
}

export interface PronosticoFranja {
  /** Plazas ya cogidas ahora mismo en la sesión futura. */
  reservasAhora: number;
  /** Lo que esta franja suele llevar a los mismos días vista (mediana). */
  referenciaHabitual: number;
  /** Reservas que suelen entrar en los días que quedan (mediana). */
  llegadasEsperadas: number;
  /** reservasAhora + llegadasEsperadas, topado al aforo. */
  ocupacionPrevista: number;
  aforo: number;
  diasVista: number;
  /** Ocurrencias pasadas sobre las que se calculó. */
  nOcurrencias: number;
  /** Cuántas de ellas acabaron prácticamente llenas. */
  nSeLlenaron: number;
}

/** A partir de qué ocupación se considera que una clase "se llenó". */
export const UMBRAL_LLENA = 0.9;

/** Cuántas ocurrencias pasadas se miran como mucho — más allá, el horario del
 *  estudio ya ha cambiado lo suficiente como para que no comparen bien. */
const MAX_OCURRENCIAS_CURVA = 8;

/**
 * Pronóstico de una sesión FUTURA a partir de la curva de reserva de su franja.
 *
 * `null` si no hay ocurrencias pasadas con las que comparar, si la sesión no
 * tiene aforo, o si ya empezó: sin referencia no se pronostica nada — mismo
 * principio que el resto del motor (antes ningún número que inventarlo).
 */
export function pronosticarFranja(
  futura: Sesion,
  franja: FranjaRecurrente,
  idx: IndicesSenal,
  now: Date,
): PronosticoFranja | null {
  const aforo = futura.aforoMaximo;
  if (!aforo || aforo <= 0) return null;
  const inicioFutura = new Date(futura.inicio).getTime();
  const diasVista = (inicioFutura - now.getTime()) / MS_DIA;
  if (diasVista <= 0) return null;

  const pasadas = franja.sesionesOrdenadas.slice(0, MAX_OCURRENCIAS_CURVA);
  if (pasadas.length === 0) return null;

  const enMismoPunto: number[] = [];
  const llegadasTardias: number[] = [];
  let nSeLlenaron = 0;

  for (const p of pasadas) {
    if (!p.aforoMaximo || p.aforoMaximo <= 0) continue;
    const reservas = reservasQueOcupanPlaza(p.id, idx);
    // Corte equivalente: el mismo número de días ANTES de que empezara aquella.
    const corte = new Date(p.inicio).getTime() - diasVista * MS_DIA;
    // ⚠️ En datos reales hay reservas creadas DESPUÉS del inicio de la clase
    // (altas de mostrador apuntadas a posteriori). No se descartan: cuentan
    // como llegada tardía, que es lo que fueron. Solo hace el pronóstico un
    // poco más optimista, nunca dispara una alarma de más.
    const yaTenia = reservas.filter(r => new Date(r.creadoEn).getTime() <= corte).length;
    enMismoPunto.push(yaTenia);
    llegadasTardias.push(reservas.length - yaTenia);
    if (reservas.length / p.aforoMaximo >= UMBRAL_LLENA) nSeLlenaron++;
  }
  if (enMismoPunto.length === 0) return null;

  const reservasAhora = reservasQueOcupanPlaza(futura.id, idx).length;
  const llegadasEsperadas = mediana(llegadasTardias);

  return {
    reservasAhora,
    referenciaHabitual: mediana(enMismoPunto),
    llegadasEsperadas,
    ocupacionPrevista: Math.min(aforo, reservasAhora + llegadasEsperadas),
    aforo,
    diasVista,
    nOcurrencias: enMismoPunto.length,
    nSeLlenaron,
  };
}

// ── Afinidad con una clase concreta (A4 · a quién avisar) ───────────────────
//
// `candidatasParaHueco` (lib/booking-logic.ts) ya responde a "¿quién PODRÍA
// venir?": activa, con bono que cubra ese tipo de clase, y que haya asistido
// antes a esa disciplina. Es binaria — 27 socias compatibles, todas igual de
// compatibles — y sirve para la tarjeta manual del dashboard.
//
// Aquí se responde a otra pregunta: "¿a quién MERECE LA PENA avisar?". Lo que
// más pesa es la costumbre horaria, porque es lo único que de verdad predice
// que a alguien le venga bien un martes a las 18:00: quien ya viene los martes
// por la tarde. Sin esto, avisar a 27 personas es spam; con esto son 9 avisos
// que tienen sentido.

export interface CandidataAfinidad {
  socioId: string;
  nombre: string;
  /** 0..1 — para ordenar, no para enseñar como porcentaje. */
  afinidad: number;
  /** Por qué está en la lista, en lenguaje humano. */
  motivo: string;
}

const MIN_AFINIDAD = 0.25;      // por debajo de esto no compensa molestar
const VENTANA_COSTUMBRE_DIAS = 90;

/**
 * Socias a las que tendría sentido ofrecer una plaza de esta sesión, ordenadas
 * por afinidad. Excluye a quien ya tiene sitio en ella (en cualquier estado
 * vivo) y a quien no tiene plan que cubra ese tipo de clase — avisar a quien no
 * puede reservar es la peor forma de gastar la confianza de una socia.
 */
export function candidatasPorAfinidad(
  sesion: Sesion,
  s: SnapshotEstudio,
  idx: IndicesSenal,
  now: Date,
  limite = 25,
): CandidataAfinidad[] {
  const yaTienenSitio = new Set(
    (idx.reservasPorSesion.get(sesion.id) ?? [])
      .filter(r => r.estado !== 'CANCELADA')
      .map(r => r.socioId),
  );
  const objetivo = franjaLocalDe(sesion.inicio);
  const hoyISO = now.toISOString().slice(0, 10);
  const desde = now.getTime() - VENTANA_COSTUMBRE_DIAS * MS_DIA;

  const resultado: CandidataAfinidad[] = [];
  for (const socio of s.socios) {
    if (!socio.activo || yaTienenSitio.has(socio.id)) continue;
    if (!tieneEntitlementActivo(socio.id, s.suscripciones, s.planesTarifa, hoyISO, sesion.tipoClaseId)) continue;

    const asistidas = (idx.asistidasPorSocio.get(socio.id) ?? []).filter(r => {
      const se = idx.sesionPorId.get(r.sesionId);
      return !!se && new Date(se.inicio).getTime() >= desde;
    });
    if (asistidas.length === 0) continue;

    let mismoDiaYFranja = 0, mismaDisciplina = 0;
    for (const r of asistidas) {
      const se = idx.sesionPorId.get(r.sesionId)!;
      if (se.tipoClaseId === sesion.tipoClaseId) mismaDisciplina++;
      const f = franjaLocalDe(se.inicio);
      // "Misma costumbre" = mismo día de la semana y ±2 h. Dos horas es el
      // margen entre clases consecutivas de un estudio: quien viene los martes
      // a las 18:00 también encaja en el de las 19:00, no en el de las 08:00.
      if (f.dow === objetivo.dow && Math.abs(f.hora - objetivo.hora) <= 2) mismoDiaYFranja++;
    }
    if (mismaDisciplina === 0) continue; // nunca ha hecho esta disciplina

    const costumbre = mismoDiaYFranja / asistidas.length;
    const disciplina = mismaDisciplina / asistidas.length;
    // La costumbre horaria pesa el doble que la disciplina: quien ya viene ese
    // día a esa hora es quien de verdad puede coger la plaza.
    const afinidad = Math.min(1, (2 * costumbre + disciplina) / 3);
    if (afinidad < MIN_AFINIDAD) continue;

    const motivo = mismoDiaYFranja > 0
      ? `suele venir ${DIAS_SEMANA[objetivo.dow]} a esta hora (${mismoDiaYFranja} de sus últimas ${asistidas.length} clases)`
      : `hace ${mismaDisciplina} clases de esta disciplina`;

    resultado.push({ socioId: socio.id, nombre: socio.nombre, afinidad, motivo });
  }

  return resultado.sort((a, b) => b.afinidad - a.afinidad).slice(0, limite);
}

const DIAS_SEMANA = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados'];

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

const ABANDONO_DIAS_RECIENTE = 14;
const ABANDONO_DIAS_BASE_HASTA = 60; // ventana base: 14-60d, previa e inmediatamente anterior a la reciente

export interface AbandonoCheckout {
  exitosReciente: number; // checkout_started con booking_completed de la misma sesión
  totalReciente: number;  // checkout_started en la ventana reciente
  exitosBase: number;
  totalBase: number;
}

/**
 * Abandono de checkout en el widget de reservas (Captación C3 — auditoría
 * vs Momence, "carrito abandonado" que ellos solo enseñan y aquí se convierte
 * en señal). Agrupa `checkout_started`/`booking_completed` por `session_id`:
 * una sesión "tiene éxito" si, tras un checkout_started, existe un
 * booking_completed posterior de la MISMA sesión — cruce por session_id, no
 * solo contar tipos, porque una sesión puede iniciar varios checkouts.
 * Ventana reciente (14d) vs base (14-60d) para poder comparar el estudio
 * contra SU PROPIO histórico — nunca contra un corte fijo ni contra otros
 * estudios (mismo criterio que F5/confianzaRiesgoDeCobro).
 */
export function tasaAbandonoCheckout(eventos: SnapshotEstudio['widgetEventosCheckout'], now: Date): AbandonoCheckout {
  const corteReciente = now.getTime() - ABANDONO_DIAS_RECIENTE * MS_DIA;
  const corteBase = now.getTime() - ABANDONO_DIAS_BASE_HASTA * MS_DIA;

  const porSesion = new Map<string, { inicios: number[]; completoEn: number | null }>();
  for (const ev of eventos) {
    const t = new Date(ev.creadoEn).getTime();
    let fila = porSesion.get(ev.sessionId);
    if (!fila) { fila = { inicios: [], completoEn: null }; porSesion.set(ev.sessionId, fila); }
    if (ev.tipo === 'checkout_started') fila.inicios.push(t);
    else if (fila.completoEn === null || t < fila.completoEn) fila.completoEn = t;
  }

  let exitosReciente = 0, totalReciente = 0, exitosBase = 0, totalBase = 0;
  for (const fila of porSesion.values()) {
    for (const inicio of fila.inicios) {
      const exito = fila.completoEn !== null && fila.completoEn >= inicio;
      if (inicio >= corteReciente) {
        totalReciente++;
        if (exito) exitosReciente++;
      } else if (inicio >= corteBase) {
        totalBase++;
        if (exito) exitosBase++;
      }
    }
  }
  return { exitosReciente, totalReciente, exitosBase, totalBase };
}
