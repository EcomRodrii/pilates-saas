// ─────────────────────────────────────────────────────────────────────────────
// ¿Hay plaza para ella ANTES de cobrarle la clase? (P06 · Fase A, 6-oct-2026)
//
// Hasta hoy el cobro de una clase concreta solo miraba que la clase siguiera
// viva, el plan y la ventana. NO miraba el aforo, ni el impago, ni los topes, ni
// si ya tenía la clase cubierta con su bono o su cuota: se cobraba y la reserva
// tras el pago (`reservarPlazaTrasPagoPublico`) se encontraba la clase llena, o
// que ya tenía plaza, con el dinero ya dentro. Ahora, antes de crear nada en
// Stripe, se pregunta lo MISMO que preguntará la reserva (`evaluar_reserva`, la
// misma decisión que `reservar_plaza`), en dos pasadas:
//
//   1. «¿Ya la tiene cubierta?» — `exigir_entitlement: true`, sin saltarse el
//      impago. Si puede reservar con lo que ya tiene (bono, cuota, recuperación,
//      o la cola con su bono), no se le cobra: «ya-cubierta». Si no puede por
//      algo que no es «no tiene plan» (impago, ya tiene reserva, choque de
//      horario, topes…), ese es el motivo, y tampoco se cobra.
//   2. «¿Y con lo que va a comprar?» — los parámetros EXACTOS de la reserva tras
//      pagar (lista de espera y sitio resueltos, sin exigir plan), salvo el
//      impago, que aquí SÍ se mira (decisión del fundador: no se vende a quien
//      el estudio bloquea por impago; tras pagar, la reserva se lo sigue
//      saltando para que un recibo que falle entre medias no la deje sin plaza).
//      CONFIRMADA → adelante. LISTA_ESPERA → «llena-con-espera» (Fase A: no se
//      cobra para ir a la cola, pregunta 1 del diseño, opción a).
//
// Puro: las evaluaciones llegan hechas (`-servidor.ts` las pide). Sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que devuelve `evaluar_reserva` (jsonb). */
export interface EvaluacionReserva {
  puede: boolean;
  codigo: string | null;
  detalle?: string | null;
  estado?: string | null;
  posicion_espera?: number | null;
  pagador?: { origen?: string | null } | null;
}

/**
 * Por qué no se cobra. Además de los códigos de reserva de siempre
 * (`CodigoReserva`), los propios de cobrar ANTES de reservar:
 *   · `llena-con-espera`  — se ha llenado: no se cobra para ir a la cola;
 *   · `ya-cubierta`       — ya la tiene cubierta con lo que tiene: que reserve;
 *   · `requiere-aprobacion` — el estudio aprueba cada reserva: Fase A no las vende;
 *   · `necesita-entrar`   — la invitada ya tiene ficha y algo de su ficha lo impide.
 */
export type CodigoPlazaAntesDeCobrar =
  | 'llena-con-espera' | 'ya-cubierta' | 'requiere-aprobacion' | 'necesita-entrar'
  | 'impago' | 'ya-reservada' | 'conflicto-horario' | 'limite-semanal' | 'limite-semanal-actividad'
  | 'max-simultaneas' | 'max-por-dia' | 'aforo-lleno' | 'spot-ocupado' | 'spot-no-disponible'
  | 'necesita-autorizacion' | 'estudio-cerrado' | 'sesion-no-encontrada' | 'no-autorizado' | 'error';

export type PlazaAntesDeCobrar =
  | { ok: true }
  | { ok: false; codigo: CodigoPlazaAntesDeCobrar; error: string; posicionEspera?: number | null };

/** Lo que se le dice. Siempre con lo que NO ha pasado: no se le ha cobrado nada. */
export const MENSAJES_PLAZA: Record<CodigoPlazaAntesDeCobrar, string> = {
  'llena-con-espera': 'Esta clase se acaba de llenar. No te hemos cobrado nada.',
  'ya-cubierta': 'Ya tienes con qué venir a esta clase: resérvala con tu bono o tu cuota. No te hemos cobrado nada.',
  'requiere-aprobacion': 'En esta clase el estudio aprueba cada reserva: pídesela al estudio. No te hemos cobrado nada.',
  'necesita-entrar': 'Ya tienes cuenta en este estudio: entra con tu email para reservar. No te hemos cobrado nada.',
  impago: 'Tienes un pago pendiente con el estudio: págalo antes de reservar. No te hemos cobrado nada.',
  'ya-reservada': 'Ya tienes esta clase reservada (o estás en su lista de espera). No te hemos cobrado nada.',
  'conflicto-horario': 'Ya tienes otra clase a esa hora. No te hemos cobrado nada.',
  'limite-semanal': 'Ya has llegado a las clases de esta semana de tu cuota. No te hemos cobrado nada.',
  'limite-semanal-actividad': 'Ya has llegado a las clases de esta semana de esta actividad. No te hemos cobrado nada.',
  'max-simultaneas': 'Has llegado al máximo de reservas a la vez de este estudio. No te hemos cobrado nada.',
  'max-por-dia': 'Has llegado al máximo de clases por día de este estudio. No te hemos cobrado nada.',
  'aforo-lleno': 'Esta clase está completa y no tiene lista de espera. No te hemos cobrado nada.',
  'spot-ocupado': 'Ese sitio se acaba de ocupar: elige otro. No te hemos cobrado nada.',
  'spot-no-disponible': 'Ese sitio no está disponible: elige otro. No te hemos cobrado nada.',
  'necesita-autorizacion': 'Para esta clase el estudio tiene que autorizarte antes. No te hemos cobrado nada.',
  'estudio-cerrado': 'El estudio está cerrado ese día. No te hemos cobrado nada.',
  'sesion-no-encontrada': 'No encontramos esta clase. No te hemos cobrado nada.',
  'no-autorizado': 'No hemos podido comprobar tu cuenta: vuelve a entrar. No te hemos cobrado nada.',
  error: 'No hemos podido comprobar la plaza. Inténtalo en un momento: no te hemos cobrado nada.',
};

const CONOCIDOS = new Set(Object.keys(MENSAJES_PLAZA));
function codigoDe(c: string | null | undefined): CodigoPlazaAntesDeCobrar {
  return c && CONOCIDOS.has(c) ? (c as CodigoPlazaAntesDeCobrar) : 'error';
}
const no = (codigo: CodigoPlazaAntesDeCobrar, posicionEspera?: number | null): PlazaAntesDeCobrar =>
  ({ ok: false, codigo, error: MENSAJES_PLAZA[codigo], ...(posicionEspera != null ? { posicionEspera } : {}) });

/**
 * La decisión para quien tiene ficha (socia con sesión, o invitada cuyo email ya
 * tiene ficha en el estudio: `invitadaConFicha`). Para la invitada con ficha,
 * cualquier motivo PERSONAL sale como «necesita-entrar», neutro: no se le dice a
 * quien solo conoce un email si esa persona debe dinero o ya tiene plaza. Lo que
 * es de la clase (llena, sin espera, sitio) sí se dice tal cual.
 */
export function decidirPlazaAntesDeCobrar(p: {
  requiereAprobacion: boolean;
  conDerecho: EvaluacionReserva;
  paraReservar: EvaluacionReserva;
  /** `topesDeReserva`: máximo a la vez y por día (lo que evalúa TypeScript, no la RPC). */
  topes: CodigoPlazaAntesDeCobrar | null;
  invitadaConFicha?: boolean;
}): PlazaAntesDeCobrar {
  const r = decidir(p);
  if (!p.invitadaConFicha || r.ok) return r;
  const deLaClase = new Set<CodigoPlazaAntesDeCobrar>(['llena-con-espera', 'aforo-lleno', 'spot-ocupado', 'spot-no-disponible', 'estudio-cerrado', 'sesion-no-encontrada', 'requiere-aprobacion', 'error']);
  return deLaClase.has(r.codigo) ? r : no('necesita-entrar');
}

function decidir(p: Parameters<typeof decidirPlazaAntesDeCobrar>[0]): PlazaAntesDeCobrar {
  if (p.requiereAprobacion) return no('requiere-aprobacion');
  const a = p.conDerecho;
  if (a.puede) {
    // Ya puede venir con lo que tiene (o a la cola con su bono): no se le vende otra cosa.
    if (a.estado === 'LISTA_ESPERA' || (a.pagador?.origen && a.pagador.origen !== 'ninguno')) return no('ya-cubierta');
  } else if (a.codigo !== 'sin-plan') {
    return no(codigoDe(a.codigo));
  }
  const b = p.paraReservar;
  if (!b.puede) return no(codigoDe(b.codigo));
  if (b.estado === 'LISTA_ESPERA') return no('llena-con-espera', b.posicion_espera ?? null);
  if (b.estado === 'PENDIENTE_APROBACION') return no('requiere-aprobacion');
  if (b.estado !== 'CONFIRMADA') return no('error');
  // Con un tope semanal superado, `reservar_plaza` gastaría una recuperación: eso ya la cubre.
  if (b.pagador?.origen === 'recuperacion') return no('ya-cubierta');
  if (p.topes) return no(p.topes);
  return { ok: true };
}

/**
 * La invitada SIN ficha: no hay socia que evaluar, solo la clase (aforo y sitio).
 * `ocupadas`/`aforo` como los cuenta `evaluar_reserva` (CONFIRMADA + ASISTIDA
 * frente a `aforo_efectivo`); `aforo` null = sin tope. `apartadas`: las plazas
 * apartadas para ClassPass (`plazas_apartadas`), que `evaluar_reserva` también
 * suma: sin ellas se le cobraría una plaza que no puede tener.
 */
export function decidirPlazaInvitadaSinFicha(p: {
  requiereAprobacion: boolean; aforo: number | null; ocupadas: number; permiteListaEspera: boolean;
  spot?: 'libre' | 'ocupado' | 'no-disponible' | null; enEspera?: number; apartadas?: number;
}): PlazaAntesDeCobrar {
  if (p.requiereAprobacion) return no('requiere-aprobacion');
  if (p.spot === 'no-disponible') return no('spot-no-disponible');
  if (p.spot === 'ocupado') return no('spot-ocupado');
  if (p.aforo != null && p.ocupadas + Math.max(0, p.apartadas ?? 0) >= p.aforo) {
    return p.permiteListaEspera ? no('llena-con-espera', (p.enEspera ?? 0) + 1) : no('aforo-lleno');
  }
  return { ok: true };
}
