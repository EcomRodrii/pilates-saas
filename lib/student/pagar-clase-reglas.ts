// Pagar y reservar UNA clase desde la app (P06 · Fase A, 6-oct-2026).
//
// Parte PURA: traduce las tres respuestas del servidor que gobiernan la hoja
//   1. POST /api/public/opciones-clase  — ¿hay plaza para ella y con qué puede venir?
//   2. POST /api/public/checkout-embebido con `sesionId` — el cobro (o por qué no).
//   3. GET  /api/public/estado-pago?pi=  — en qué acabó el pago: plaza o compensación.
// Sin `@/` ni imports de servidor: la comparten la hoja y sus tests.
//
// ⚠️ La regla de siempre: que Stripe diga «cobrado» NO es que tenga plaza. La plaza
// la da el webhook (o el barrido del conciliador), y solo cuando el servidor dice
// «confirmada» se pinta «Reservada ✓». Un pago que no acabó en plaza se dice con
// lo que tiene a su favor, nunca con un ✓.

import { RETARDOS_POLL_MS, type RespuestaEstadoPago } from '../billing/estado-pago-publico.ts';
import { IMPORTE_MINIMO_EUR, type OpcionDeClase } from '../reservar/opciones-de-clase.ts';

// ── 1. Las opciones ─────────────────────────────────────────────────────────

export type LecturaOpcionesClase =
  | { tipo: 'opciones'; opciones: OpcionDeClase[] }
  /** El servidor dice que no se puede pagar esta clase aquí (llena, ya cubierta, impago…), con su texto. */
  | { tipo: 'rechazo'; codigo: string; mensaje: string; posicionEspera: number | null }
  /** Ya la ha pagado y se está confirmando: nada de volver a pagar, se sondea ese pago. */
  | { tipo: 'pago-en-curso'; pi: string }
  /** El estudio no puede cobrar online ahora mismo, o no vende esta clase suelta aquí. */
  | { tipo: 'sin-pago-online'; precioEspecial: boolean }
  | { tipo: 'faltan-preguntas' }
  | { tipo: 'sesion' }
  | { tipo: 'dos-pasos' }
  | { tipo: 'error'; mensaje: string };

const ERROR_GENERICO = 'No hemos podido comprobar la clase. Inténtalo en un momento: no se te ha cobrado nada.';

function deSesion(status: number, c: { codigo?: unknown }): { tipo: 'sesion' } | { tipo: 'dos-pasos' } | null {
  if (status !== 401) return null;
  return c.codigo === 'doble_factor_requerido' ? { tipo: 'dos-pasos' } : { tipo: 'sesion' };
}

export function leerOpcionesClase(status: number, cuerpo: unknown): LecturaOpcionesClase {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as {
    codigo?: unknown; error?: unknown; pagosOnline?: unknown; bloqueo?: unknown; pagoEnCurso?: { pi?: unknown };
    rechazo?: { codigo?: unknown; error?: unknown; posicionEspera?: unknown }; precioEspecial?: unknown; opciones?: unknown;
  };
  const s = deSesion(status, c);
  if (s) return s;
  if (status < 200 || status >= 300) {
    // Un 403 / 404 / 500 / 429: nunca se ofrece pagar sin la respuesta buena.
    return { tipo: 'error', mensaje: typeof c.error === 'string' && status !== 500 ? c.error : ERROR_GENERICO };
  }
  if (c.bloqueo === 'faltan-preguntas') return { tipo: 'faltan-preguntas' };
  if (c.pagoEnCurso && typeof c.pagoEnCurso.pi === 'string' && c.pagoEnCurso.pi) return { tipo: 'pago-en-curso', pi: c.pagoEnCurso.pi };
  if (c.rechazo && typeof c.rechazo.codigo === 'string') {
    return {
      tipo: 'rechazo', codigo: c.rechazo.codigo,
      mensaje: typeof c.rechazo.error === 'string' ? c.rechazo.error : 'Ahora mismo no puedes reservar esta clase. No te hemos cobrado nada.',
      posicionEspera: typeof c.rechazo.posicionEspera === 'number' ? c.rechazo.posicionEspera : null,
    };
  }
  if (c.precioEspecial === true) return { tipo: 'sin-pago-online', precioEspecial: true };
  const validas = (Array.isArray(c.opciones) ? c.opciones : [])
    .filter((o): o is OpcionDeClase => !!o && typeof o === 'object' && typeof (o as OpcionDeClase).planId === 'string'
      && typeof (o as OpcionDeClase).importe === 'number')
    // La prueba gratis no pasa por Stripe (P07): vale aunque el estudio no cobre online.
    .filter((o) => (o.tipo === 'prueba' && o.gratis === true) || c.pagosOnline === true)
    // Por debajo del mínimo de Stripe no se ofrece (el servidor lo rechazaría); la gratis no se paga.
    .filter((o) => (o.tipo === 'prueba' && o.gratis === true) || (!o.noPagable && o.importe >= IMPORTE_MINIMO_EUR));
  // La prueba (si la hay) primera, y después como mucho tres formas de venir.
  const opciones = [...validas.filter((o) => o.tipo === 'prueba').slice(0, 1), ...validas.filter((o) => o.tipo !== 'prueba').slice(0, 3)];
  if (opciones.length === 0) return { tipo: 'sin-pago-online', precioEspecial: false };
  return { tipo: 'opciones', opciones };
}

// ── 2. El cobro ─────────────────────────────────────────────────────────────

export type InicioPagoClase =
  | {
    tipo: 'ok'; clientSecret: string; importe: number | null; descuento: number; matricula: number; total: number | null;
    /** P16: la sesión para enseñar sus tarjetas guardadas (solo la da el servidor a la app). */
    customerSessionClientSecret: string | null;
  }
  | { tipo: 'pago-en-curso'; pi: string | null; mensaje: string }
  /** Otro intento suyo está creando el cobro ahora mismo: se reintenta en un segundo. */
  | { tipo: 'preparandose' }
  /** El servidor no cobra (la plaza ya no está, condiciones sin aceptar…): su texto, que acaba en «no te hemos cobrado nada». */
  | { tipo: 'rechazo'; codigo: string | null; mensaje: string }
  | { tipo: 'faltan-preguntas' }
  | { tipo: 'sesion' }
  | { tipo: 'dos-pasos' }
  | { tipo: 'error'; mensaje: string };

const SIN_COBRO = 'No hemos podido iniciar el pago. No se te ha cobrado nada.';

export function leerInicioPagoClase(status: number, cuerpo: unknown): InicioPagoClase {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as {
    clientSecret?: unknown; error?: unknown; codigo?: unknown; pi?: unknown;
    importe?: unknown; descuento?: unknown; matricula?: unknown; total?: unknown; customerSessionClientSecret?: unknown;
  };
  const s = deSesion(status, c);
  if (s) return s;
  const codigo = typeof c.codigo === 'string' ? c.codigo : null;
  if (status >= 200 && status < 300) {
    if (typeof c.clientSecret !== 'string' || !c.clientSecret) return { tipo: 'error', mensaje: SIN_COBRO };
    const importe = typeof c.importe === 'number' && Number.isFinite(c.importe) ? c.importe : null;
    const matricula = typeof c.matricula === 'number' ? c.matricula : 0;
    return {
      tipo: 'ok', clientSecret: c.clientSecret, importe,
      descuento: typeof c.descuento === 'number' ? c.descuento : 0,
      matricula,
      // El cargo de verdad (cuota + matrícula): lo dice el servidor; uno viejo, importe + matrícula.
      total: typeof c.total === 'number' && Number.isFinite(c.total) ? c.total : importe == null ? null : importe + matricula,
      customerSessionClientSecret: typeof c.customerSessionClientSecret === 'string' && c.customerSessionClientSecret ? c.customerSessionClientSecret : null,
    };
  }
  if (codigo === 'pago-en-curso') {
    return {
      tipo: 'pago-en-curso', pi: typeof c.pi === 'string' && c.pi ? c.pi : null,
      mensaje: typeof c.error === 'string' && c.error ? c.error : 'Ya tienes un pago de esta clase en marcha. No vuelvas a pagar.',
    };
  }
  if (codigo === 'pago-preparandose') return { tipo: 'preparandose' };
  if (codigo === 'faltan-preguntas') return { tipo: 'faltan-preguntas' };
  // Un 4xx con texto del servidor es un rechazo de negocio (con su «no te hemos cobrado nada»);
  // un 5xx o un cuerpo raro, el genérico: el texto de un 500 no es para la alumna.
  if (status >= 400 && status < 500 && typeof c.error === 'string' && c.error) return { tipo: 'rechazo', codigo, mensaje: c.error };
  return { tipo: 'error', mensaje: SIN_COBRO };
}

/** Cuántas veces se reintenta un `pago-preparandose` (a 1 s) antes de decirlo. */
export const REINTENTOS_PREPARANDOSE = 2;

// ── 3. Después de pagar ─────────────────────────────────────────────────────

export type LecturaReservaPagada =
  | { tipo: 'confirmada'; clase: { nombre: string; inicio: string } | null }
  | { tipo: 'compensada'; compensacion: NonNullable<RespuestaEstadoPago['compensacion']> }
  /** Pagos sin fila (de antes de P06): los estados de siempre. */
  | { tipo: 'lista_espera' }
  | { tipo: 'pendiente_aprobacion' }
  | { tipo: 'ya_tenia_plaza' }
  | { tipo: 'fallida' }
  | { tipo: 'reembolsada' }
  | { tipo: 'en_proceso'; esperaMinMs?: number }
  | { tipo: 'sesion' }
  | { tipo: 'dos-pasos' };

export function leerReservaPagada(status: number, retryAfter: string | null, cuerpo: unknown): LecturaReservaPagada {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Partial<RespuestaEstadoPago> & { codigo?: unknown };
  const s = deSesion(status, c);
  if (s) return s;
  if (status === 429) {
    const seg = Number(retryAfter);
    return Number.isFinite(seg) && seg > 0 ? { tipo: 'en_proceso', esperaMinMs: Math.min(seg, 60) * 1000 } : { tipo: 'en_proceso' };
  }
  if (status < 200 || status >= 300) return { tipo: 'en_proceso' };
  switch (c.estado) {
    case 'confirmada':
      return { tipo: 'confirmada', clase: c.clase && typeof c.clase.nombre === 'string' ? c.clase : null };
    case 'compensada':
      return c.compensacion && typeof c.compensacion.motivo === 'string'
        ? { tipo: 'compensada', compensacion: c.compensacion }
        : { tipo: 'compensada', compensacion: { motivo: 'ERROR', enEspera: false } };
    case 'lista_espera': case 'pendiente_aprobacion': case 'ya_tenia_plaza': case 'fallida': case 'reembolsada':
      return { tipo: c.estado };
    default:
      return { tipo: 'en_proceso' };
  }
}

/** Cuánto esperar antes de la consulta `intento` (la misma cadencia que /reservar), o `null` al agotarse. */
export function esperaAntesDeConsultar(intento: number, esperaMinMs?: number): number | null {
  if (intento < 0 || intento >= RETARDOS_POLL_MS.length) return null;
  const base = RETARDOS_POLL_MS[intento];
  return esperaMinMs && esperaMinMs > base ? esperaMinMs : base;
}

/**
 * Lo que se le dice cuando el pago está y la plaza no (o no la pagó este pago). Siempre
 * con lo que tiene a su favor; «el estudio ya lo sabe» SOLO si el servidor selló el aviso.
 */
export function textoCompensacion(
  c: NonNullable<RespuestaEstadoPago['compensacion']>,
  fechaLegible?: (iso: string) => string,
): { titulo: string; cuerpo: string } {
  const aFavor = c.bono
    ? ` Tienes ${c.bono.sesionesRestantes == null ? 'tu ' + c.bono.nombre : `${c.bono.sesionesRestantes === 1 ? '1 clase' : `${c.bono.sesionesRestantes} clases`} en ${c.bono.nombre}`}${c.bono.fechaFin && fechaLegible ? ` hasta el ${fechaLegible(c.bono.fechaFin)}` : ''}.`
    : ' Lo que has pagado queda a tu favor en el estudio.';
  const avisado = c.estudioAvisado ? ' El estudio ya lo sabe.' : '';
  switch (c.motivo) {
    case 'EN_ESPERA':
      return {
        titulo: c.posicion ? `Estás la ${c.posicion}.ª en la lista de espera` : 'Estás en la lista de espera',
        cuerpo: `La clase se llenó mientras pagabas. Te avisamos si se libera una plaza.${aFavor}${avisado}`,
      };
    case 'PENDIENTE_APROBACION':
      return { titulo: 'Tu reserva espera al estudio', cuerpo: `En esta clase el estudio aprueba cada reserva. Te avisamos en cuanto conteste.${aFavor}` };
    case 'YA_TENIA_RESERVA':
      return { titulo: 'Ya tenías esta clase', cuerpo: `No te hemos reservado otra plaza.${aFavor}${avisado}` };
    case 'PAGADO_SIN_USAR':
      return { titulo: 'Tienes tu plaza', cuerpo: `Tu plaza se pagó con otro bono tuyo, así que lo que acabas de comprar sigue intacto.${aFavor}` };
    case 'SIN_PLAZA':
      return { titulo: 'Pago hecho, pero sin plaza', cuerpo: `La clase se llenó mientras pagabas.${aFavor}${avisado}` };
    case 'CLASE_CERRADA':
      return { titulo: 'Pago hecho, pero la clase ya no admite reservas', cuerpo: `${aFavor.trim()}${avisado}` };
    default:
      return { titulo: 'Pago hecho, pero no hemos podido darte la plaza', cuerpo: `${aFavor.trim()}${avisado || ' Escribe al estudio y te lo resuelven.'}` };
  }
}

// ── P07: la clase de prueba GRATIS (no pasa por Stripe) ─────────────────────

export type LecturaReservaPrueba =
  | { tipo: 'confirmada' }
  /** Sin plaza: entra en la espera; su clase de prueba sigue disponible (la reserva en espera no la gasta). */
  | { tipo: 'lista_espera'; posicion: number | null }
  /** La prueba no vale aquí (no cubre la clase, ya no es su primera visita…): las demás opciones siguen. */
  | { tipo: 'rechazo-prueba'; codigo: string; mensaje: string }
  /** Rechazo de la reserva (llena sin espera, horario…): su texto. La prueba, si se concedió, sigue disponible. */
  | { tipo: 'rechazo'; mensaje: string }
  | { tipo: 'sesion' }
  | { tipo: 'dos-pasos' }
  | { tipo: 'error'; mensaje: string };

export function leerReservaPrueba(status: number, cuerpo: unknown): LecturaReservaPrueba {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as {
    ok?: unknown; estado?: unknown; posicionEspera?: unknown; error?: unknown; codigo?: unknown;
  };
  const s = deSesion(status, c);
  if (s) return s;
  if (status >= 200 && status < 300 && c.ok === true) {
    if (c.estado === 'CONFIRMADA') return { tipo: 'confirmada' };
    if (c.estado === 'LISTA_ESPERA') return { tipo: 'lista_espera', posicion: typeof c.posicionEspera === 'number' ? c.posicionEspera : null };
    return { tipo: 'error', mensaje: 'No hemos podido confirmar tu reserva. Mira «Mis reservas» antes de volver a intentarlo.' };
  }
  const mensaje = typeof c.error === 'string' && c.error ? c.error : null;
  if (status >= 400 && status < 500 && typeof c.codigo === 'string' && c.codigo.startsWith('prueba-')) {
    return { tipo: 'rechazo-prueba', codigo: c.codigo, mensaje: mensaje ?? 'Esta oferta no sirve para esta clase.' };
  }
  if (status >= 400 && status < 500 && mensaje) return { tipo: 'rechazo', mensaje };
  return { tipo: 'error', mensaje: 'No hemos podido reservar tu clase de prueba. Inténtalo en un momento.' };
}
