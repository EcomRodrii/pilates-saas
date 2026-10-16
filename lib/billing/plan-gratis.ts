// ─────────────────────────────────────────────────────────────────────────────
// Founding Studio gratis (decisión del fundador, 15-oct-2026).
//
// Y qué toca al pasarse (decisiones del fundador del 15-oct): el segundo límite
// son 250 RESERVAS al mes, no cobros (~02:15: los cobros se esquivan cobrando
// fuera de Tentare; las reservas no, como las «inscripciones» de Bonsai). Al
// pasar CUALQUIERA de los dos límites, Founding Studio DE PAGO: 29 €/mes, lo
// mismo y sin límites (08:30: «cuando pasa de esos limites cuesta 29€ y el
// estudio ya 59 y cadena 149»). Nadie va obligado a Estudio: lo que lo
// distingue es la app propia del estudio (`appPropia`, entitlements.ts).
//
// Un estudio que no paga usa Tentare ENTERO (todo salvo varias sedes) mientras
// no pase de LIMITE_ALUMNAS alumnas «Activa» ni de LIMITE_RESERVAS_MES reservas en un
// mes. Al pasarse tiene MARGEN_DIAS para elegir plan de pago; pasado el
// margen, el panel se cierra hasta que lo elija. La app de sus alumnas no se toca nunca.
//
// Los «truquitos», todos aquí y con su test:
//   · Cuenta lo que mueve el estudio de verdad, no fichas: alumnas con el chip
//     «Activa» (lib/clientas/estado.ts, el mismo número que el Resumen) y
//     reservas de clases que se dieron (sin canceladas, lista de espera ni
//     pendientes de aprobar; las de clase fija, sí). Importar fichas viejas no
//     suma, y cobrar fuera de Tentare no lo esquiva.
//   · Las reservas se cuentan en los ÚLTIMOS 30 DÍAS (por la fecha de la
//     clase), no por mes natural: no se reinicia todo el día 1 (pasarse el 28
//     y volver a cero el 1 sería una trampa), y si de verdad vuelve a bajar, se ve.
//   · Pasado el margen, el cierre se queda hasta que elija un plan, aunque
//     luego baje: si no, se reabriría solo en temporada baja.
//   · Se suma el uso de todos los estudios gratis de la misma dueña: trocear un
//     estudio en dos no lo hace gratis (lo hace quien mide, uso-gratis-servidor).
//   · Una cadena que deja de pagar: solo su sede principal pasa a gratis; las
//     demás se quedan cerradas hasta que vuelva a pagar Cadena (`pasaAGratis`).
//   · Se avisa antes (AVISO_PCT), no el día que se pasa; y si vuelve a bajar
//     dentro del margen, el aviso se va solo.
//   · Lo decide la DERIVACIÓN en cada petición (`estadoGratis`), no un reloj:
//     quien mide solo guarda cifras y desde cuándo se pasó.
//   · Con el panel cerrado 90 días, entra en la baja de un estudio de pago
//     (avisos de «descarga tus datos» y purga a los 30): lo decide la BD,
//     `plan_gratis_entra_en_baja` (migr 20261016100200), con la misma fecha de
//     exceso. Si paga antes, no pasa nada.
//
// Puro, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { masDias } from '../utils.ts';

export const LIMITE_ALUMNAS = 150;
export const LIMITE_RESERVAS_MES = 250;
/** Días para elegir un plan de pago desde que se pasa. */
export const MARGEN_DIAS = 30;
/** Desde qué parte del límite se avisa (120 alumnas, 200 reservas). */
export const AVISO_PCT = 0.8;

/** La frase del fundador, literal (con la tilde de «Tú»). */
export const FRASE_PLAN_GRATIS = 'Tú eres la prioridad. Si tu estudio crece, crecemos contigo.';

/** `subscription_status` de un estudio en el plan gratis. Lo escribe solo el servidor. */
export const ESTADO_GRATIS = 'gratis';
/**
 * Gratis con el margen agotado: SIN acceso (no está en `suscripcionActiva`), así
 * que todo el servidor —la IA, el Centro de Control, la API pública, las
 * sustituciones solas— lo ve cerrado, no solo la pantalla. Lo escribe el gate;
 * se sale pagando (el webhook escribe el estado de Stripe).
 */
export const ESTADO_GRATIS_CERRADO = 'gratis_cerrado';

/** ¿Está en el plan gratis (abierto o cerrado)? */
export function esPlanGratis(status: string | null | undefined): boolean {
  return status === ESTADO_GRATIS || status === ESTADO_GRATIS_CERRADO;
}

export interface UsoGratis {
  alumnasActivas: number;
  /** Reservas de las clases de los últimos 30 días (por la fecha de la clase, Madrid). */
  reservas30Dias: number;
}

export type MotivoLimite = 'alumnas' | 'reservas';

/** Lo que se ha pasado del límite (vacío si nada). */
export function limitesPasados(u: UsoGratis): MotivoLimite[] {
  const m: MotivoLimite[] = [];
  if (u.alumnasActivas > LIMITE_ALUMNAS) m.push('alumnas');
  if (u.reservas30Dias > LIMITE_RESERVAS_MES) m.push('reservas');
  return m;
}

/** Lo que está ya cerca del límite (desde el AVISO_PCT), pasado o no. */
export function limitesCerca(u: UsoGratis): MotivoLimite[] {
  const m: MotivoLimite[] = [];
  if (u.alumnasActivas >= Math.ceil(LIMITE_ALUMNAS * AVISO_PCT)) m.push('alumnas');
  if (u.reservas30Dias >= Math.ceil(LIMITE_RESERVAS_MES * AVISO_PCT)) m.push('reservas');
  return m;
}

/**
 * Desde cuándo cuenta el margen, tras una medición nueva: se pone el día que se
 * pasa por primera vez, se mantiene mientras siga pasado (no se reinicia con
 * cada medición) y se borra si vuelve a estar dentro ANTES de que acabe el
 * margen. Acabado el margen, se queda: el cierre no se deshace solo.
 */
export function siguienteExcedidoDesde(actual: string | null, uso: UsoGratis, hoy: string): string | null {
  if (actual && hoy >= finDelMargen(actual)) return actual;
  if (limitesPasados(uso).length === 0) return null;
  return actual ?? hoy;
}

/**
 *  · DENTRO  — lejos del límite.
 *  · CERCA   — desde el 80 %: se avisa, no pasa nada.
 *  · MARGEN  — se ha pasado: quedan `diasRestantes` para elegir un plan de pago.
 *  · CERRADO — se acabó el margen: el panel lleva a elegir plan.
 *  · SIN_MEDIR — todavía no hay cifras: nunca se cierra nada por no saber.
 */
export type FaseGratis = 'DENTRO' | 'CERCA' | 'MARGEN' | 'CERRADO' | 'SIN_MEDIR';

export interface EstadoGratis {
  fase: FaseGratis;
  uso: UsoGratis | null;
  /** Qué límite se ha pasado (MARGEN/CERRADO) o está cerca (CERCA). */
  motivos: MotivoLimite[];
  /** Días que quedan de margen (MARGEN), 0 en CERRADO. */
  diasRestantes: number;
  /** 'YYYY-MM-DD' en que se cierra (MARGEN/CERRADO). */
  cierraEl: string | null;
}

const MS_DIA = 86_400_000;
const aMs = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));

/** El día (calendario) en que acaba el margen que empezó `desde`. */
export function finDelMargen(desde: string): string {
  return masDias(desde, MARGEN_DIAS);
}

/**
 * El estado del plan gratis, derivado al preguntar. `hoy` es el día del
 * estudio ('YYYY-MM-DD', Madrid): el margen se cuenta en días de calendario y
 * se cierra al EMPEZAR el día de cierre, no a una hora UTC.
 */
export function estadoGratis(entrada: { uso: UsoGratis | null; excedidoDesde: string | null; hoy: string }): EstadoGratis {
  const { uso, excedidoDesde, hoy } = entrada;
  // Acabado el margen, cerrado, se mida lo que se mida (y aunque no haya cifras).
  if (excedidoDesde && hoy >= finDelMargen(excedidoDesde)) {
    return { fase: 'CERRADO', uso, motivos: uso ? limitesPasados(uso) : [], diasRestantes: 0, cierraEl: finDelMargen(excedidoDesde) };
  }
  if (!uso) return { fase: 'SIN_MEDIR', uso: null, motivos: [], diasRestantes: 0, cierraEl: null };
  const pasados = limitesPasados(uso);
  if (pasados.length > 0) {
    // Pasado pero sin fecha todavía (la medición que lo vio aún no la guardó):
    // el margen empieza hoy, nunca antes.
    const cierraEl = finDelMargen(excedidoDesde ?? hoy);
    const dias = Math.max(0, Math.round((aMs(cierraEl) - aMs(hoy)) / MS_DIA));
    return { fase: dias > 0 ? 'MARGEN' : 'CERRADO', uso, motivos: pasados, diasRestantes: dias, cierraEl };
  }
  const cerca = limitesCerca(uso);
  return { fase: cerca.length > 0 ? 'CERCA' : 'DENTRO', uso, motivos: cerca, diasRestantes: 0, cierraEl: null };
}

/** Lo que contesta /api/billing/status de un estudio gratis (ya derivado). */
export interface EstadoGratisApi extends EstadoGratis {
  limites: { alumnas: number; reservasMes: number };
  margenDias: number;
}

/**
 * ¿Paga este estudio un plan? Una suscripción viva de Stripe (o la de su
 * cadena, en una sede: las sedes llevan 'active' sin `subscription_id`). La
 * prueba LOCAL también se llama 'trialing', pero va sin `subscription_id`.
 */
export function pagaPlan(s: { subscriptionStatus: string | null | undefined; subscriptionId: string | null | undefined }): boolean {
  const st = s.subscriptionStatus ?? null;
  if (st === 'active' || st === 'past_due') return true;
  return st === 'trialing' && !!s.subscriptionId;
}

/**
 * Los estados desde los que un estudio sin pagar pasa a gratis (con el
 * interruptor encendido). Lo que no está aquí no se toca: lo que paga, lo que
 * está a medio pagar en Stripe ('incomplete': el Checkout aún no ha acabado) y
 * lo que ya es gratis.
 */
// 'unpaid' NO: la suscripción sigue viva en Stripe (bloquea un Checkout nuevo,
// el webhook la reescribiría y, si paga la factura abierta, Stripe vuelve a
// cobrar). Pasa a gratis cuando Stripe la cancele.
const PASAN_A_GRATIS = new Set<string | null>([null, 'trialing', 'trial_expirado', 'canceled', 'incomplete_expired']);

// ─── Una cadena que deja de pagar (decisión del fundador, 15-oct-2026) ───────
// Su sede PRINCIPAL pasa a Founding Studio gratis con los límites de siempre
// (el uso ya se suma por dueña); las DEMÁS siguen con el panel cerrado hasta que
// vuelva a pagar Cadena, sin borrar nada, y la app de sus alumnas sigue. Si
// vuelve a pagar, la cadena manda otra vez en todas: el trigger
// `propagar_plan_cadena` pisa el 'gratis' de la principal en cuanto la cadena
// paga, y solo entonces (migr 20261015141653).
//
// La principal es la sede más ANTIGUA de la cadena: la cadena nace siempre del
// estudio desde el que se contrató (/api/billing/checkout lo vincula al crearla)
// y las demás sedes se crean después (/api/cadena/sedes). No hay columna que lo
// diga; la elige `leerCadenaParaGratis` (convertir-a-gratis.ts).

/** Lo que hace falta saber de la cadena de una sede para decidir. */
export interface CadenaParaGratis {
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  /** ¿Es esta sede la principal de su cadena (la más antigua)? */
  esPrincipal: boolean;
  /** ¿Hay OTRA sede de la cadena ya en el plan gratis (abierto o cerrado)? Nunca dos. */
  otraSedeGratis: boolean;
}

/**
 * Estados en que una cadena ya no paga (o nunca llegó a pagar: un Checkout de
 * Cadena abandonado deja la cadena sin estado). Lo que no está aquí lo sigue
 * gobernando la cadena: lo que paga, 'unpaid' (Stripe aún puede cobrarla) e
 * 'incomplete' (un pago de Cadena a medias).
 */
const CADENA_SIN_PLAN = new Set<string | null>([null, 'canceled', 'incomplete_expired', 'trial_expirado']);

/** ¿Ha dejado de pagar esta cadena? */
export function cadenaSinPlan(c: Pick<CadenaParaGratis, 'subscriptionStatus' | 'subscriptionId'>): boolean {
  return !pagaPlan(c) && CADENA_SIN_PLAN.has(c.subscriptionStatus ?? null);
}

/**
 * ¿Puede este estudio estar en el plan gratis, por lo que toca a su cadena? Uno
 * suelto, sí. Una sede, solo la principal, solo con la cadena sin pagar y solo
 * si ninguna otra sede de la cadena lo está ya (si la principal cambiara, no
 * habría dos); sin saber de la cadena (`cadena` null), no.
 */
export function sedeAdmiteGratis(s: { cadenaId: string | null | undefined; cadena?: CadenaParaGratis | null }): boolean {
  if (!s.cadenaId) return true;
  return !!s.cadena && s.cadena.esPrincipal && !s.cadena.otraSedeGratis && cadenaSinPlan(s.cadena);
}

export function pasaAGratis(s: {
  subscriptionStatus: string | null | undefined;
  subscriptionId: string | null | undefined;
  cadenaId: string | null | undefined;
  /** Solo para una sede (`cadenaId`): su cadena y si es la principal. */
  cadena?: CadenaParaGratis | null;
}): boolean {
  if (!sedeAdmiteGratis(s)) return false;
  if (pagaPlan(s)) return false;
  return PASAN_A_GRATIS.has(s.subscriptionStatus ?? null);
}

/**
 * Al pasar a gratis, ¿se empieza la medición de cero? Solo desde 'canceled': ha
 * habido un periodo PAGADO, y una fecha de exceso de antes no puede dejarlo
 * cerrado el primer día. Desde 'incomplete_expired' (un pago abandonado), una
 * prueba agotada o nada, se conserva: si no, un 'gratis_cerrado' que abandona un
 * pago con 3DS volvería abierto y con 30 días más de margen.
 */
export function empiezaDeCeroAlConvertir(estadoPrevio: string | null | undefined): boolean {
  return estadoPrevio === 'canceled';
}

/** La frase de lo que se ha pasado, para los avisos: «150 alumnas activas», «250 reservas al mes». */
export function textoLimite(m: MotivoLimite): string {
  return m === 'alumnas' ? `${LIMITE_ALUMNAS} alumnas activas` : `${LIMITE_RESERVAS_MES} reservas al mes`;
}

/** «150 alumnas activas y 250 reservas al mes»; sin motivos (cerrado y ya por debajo), «un límite del plan gratis». */
export function textoLimites(m: readonly MotivoLimite[]): string {
  return m.length === 0 ? 'un límite del plan gratis' : m.map(textoLimite).join(' y ');
}
