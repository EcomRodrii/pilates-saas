// ─────────────────────────────────────────────────────────────────────────────
// La situación de un estudio — gemela TypeScript de `public.situacion_estudio`
// (migración 20261016123000). SOLO LECTURA: nada de aquí cambia un estado; dice
// en qué estado está cada estudio según lo que ya hay en la base de datos.
//
// La regla vive en SQL (una función, la que leerá el barrido) y aquí está su
// espejo puro, para el panel y para los tests. Los dos se cruzan:
//   · `situacion-estudio.test.ts` (node --test): las constantes de este fichero
//     son las del SQL, y los invariantes de la máquina;
//   · `supabase/tests/situacion-estudio.test.ts` (Postgres real): misma entrada,
//     misma salida, caso a caso, y las señales de actividad con filas de verdad.
//
// Estados:
//   · ACTIVO_PAGO      — paga: suscripción viva (activa, en reintento o prueba de
//                        Stripe) suya o de su cadena, o el plan concedido a mano
//                        de su cadena. Quien paga NUNCA sale de aquí: va primero.
//   · PAGO_PENDIENTE   — `unpaid`: Stripe aún puede cobrarlo.
//   · GRATIS / GRATIS_EN_MARGEN — Founding Studio gratis, dentro de los límites o
//                        pasado y con margen (lib/billing/plan-gratis.ts).
//   · INACTIVO         — gratis sin actividad real DIAS_HASTA_INACTIVO días.
//   · SUSPENDIDO       — `funciona` (límite del gratis agotado, o sin plan) o
//                        `sin_senales` (gratis sin actividad DIAS_HASTA_SUSPENDIDO días).
//   · EN_BAJA          — contrato terminado o borrado pedido (el ciclo de hoy).
//   · ELIMINADO        — la purga ya se hizo.
//
// Las demos no entran nunca en INACTIVO ni en SUSPENDIDO por falta de uso. La
// suspensión manual de /interno (`suspendido_en`) va aparte: no cambia el estado.
//
// Cada estado dice además QUÉ limitaría (decisión del fundador, 16-oct): la
// gestión (el panel de la propietaria), el servicio a las alumnas, o solo los
// cobros automáticos. Pasarse del gratis limita la gestión, nunca a las alumnas.
// Hoy nada de esto se aplica: solo se informa (BAJAS_AUTOMATICAS=informe escribe
// el informe diario y las marcas de uso; apagado, nada).
//
// Puro, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { ESTADO_GRATIS, ESTADO_GRATIS_CERRADO, estadoGratis, pagaPlan, type FaseGratis, type UsoGratis } from '../billing/plan-gratis.ts';
import { hoyEnEstudio, masDias } from '../utils.ts';

/** Días sin actividad real hasta INACTIVO (decisión 2 del diseño de bajas). */
export const DIAS_HASTA_INACTIVO = 60;
/** Días sin actividad real hasta SUSPENDIDO «sin señales». */
export const DIAS_HASTA_SUSPENDIDO = 90;
/**
 * Un «Cierre del centro» no cuenta como inactividad, hasta este tope por cierre:
 * el mismo que el de la prórroga de bonos (`MAX_DIAS_PRORROGA`, aplicar-cierre.ts).
 * Un cierre más largo que un año no es un cierre.
 */
export const DIAS_MAX_POR_CIERRE = 365;

/**
 * `BAJAS_AUTOMATICAS`: `informe` escribe las marcas de uso y el informe diario
 * (`estudio_situacion_diaria`) y nada más. Cualquier otro valor, o ninguno, es
 * `apagado`. No hay modo que active nada: eso llegará en su propio PR.
 */
export type ModoBajas = 'apagado' | 'informe';
export function modoBajas(entorno: Record<string, string | undefined>): ModoBajas {
  return entorno.BAJAS_AUTOMATICAS?.trim() === 'informe' ? 'informe' : 'apagado';
}

export const ESTADOS_ESTUDIO = [
  'ACTIVO_PAGO', 'PAGO_PENDIENTE', 'GRATIS', 'GRATIS_EN_MARGEN', 'INACTIVO', 'SUSPENDIDO', 'EN_BAJA', 'ELIMINADO',
] as const;
export type EstadoEstudio = (typeof ESTADOS_ESTUDIO)[number];

export const MOTIVOS_SITUACION = ['limite_gratis', 'sin_plan', 'abandono', 'borrado_pedido'] as const;
export type MotivoSituacion = (typeof MOTIVOS_SITUACION)[number];

/** Solo en SUSPENDIDO: el estudio sigue dando clases, o no da señales de vida. */
export type VarianteSuspendido = 'funciona' | 'sin_senales';

export interface PlanDeCadena {
  subscriptionStatus: string | null;
  subscriptionId: string | null;
}

/** Lo que hace falta saber de un estudio para derivar su situación (todo leído de la BD). */
export interface EntradaSituacion {
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  /** ¿Es una sede (`cadena_id`)? Aunque su cadena no aparezca. */
  tieneCadena: boolean;
  /** La fila de su cadena, si es sede y se encontró. */
  cadena: PlanDeCadena | null;
  esDemo: boolean;
  /** `studios.contrato_terminado_en` puesto (lo decide la BD). */
  contratoTerminado: boolean;
  /** `studios.supresion_pedida_en` puesto. */
  supresionPedida: boolean;
  /** La purga del ciclo de baja ya se ejecutó. */
  purgado: boolean;
  /** La fase del plan gratis del grupo de la dueña (`faseDelGratis`). Solo cuenta si es de la familia del gratis. */
  faseGratis: FaseGratis;
  /** `diasSinActividad`. */
  diasSinActividad: number;
}

export interface Situacion {
  estado: EstadoEstudio;
  motivo: MotivoSituacion | null;
  variante: VarianteSuspendido | null;
  paga: boolean;
  /** El panel de la propietaria se cierra o se limita (lo que verá cuando se active; hoy solo se informa). */
  gestionLimitada: boolean;
  /** Las alumnas solo pueden consultar. NUNCA por pasarse del gratis: ahí el estudio funciona. */
  servicioAlumnasSuspendido: boolean;
  /** Lo que se cobra solo (renovaciones, reintentos, cargos automáticos) se para. Nunca lo que pide la alumna. */
  cobrosAutomaticosPausados: boolean;
}

/** ¿Paga? Su plan, o el de su cadena (las sedes de una cadena con plan a mano llevan 'active' sin suscripción). */
export function pagaElEstudio(e: Pick<EntradaSituacion, 'subscriptionStatus' | 'subscriptionId' | 'tieneCadena' | 'cadena'>): boolean {
  if (pagaPlan(e)) return true;
  return e.tieneCadena && !!e.cadena && pagaPlan(e.cadena);
}

/**
 * ¿Se rige por el plan gratis? El gratis (abierto o cerrado), la prueba local
 * (con FOUNDING_GRATIS pasa a gratis en la siguiente visita o pasada del cron) y
 * un estudio suelto pagando desde el gratis (`incomplete`: el webhook escribe
 * encima de 'gratis' mientras dura el 3DS; el gate lo sigue tratando como gratis).
 */
export function esDeLaFamiliaGratis(e: Pick<EntradaSituacion, 'subscriptionStatus' | 'subscriptionId' | 'tieneCadena'>): boolean {
  const st = e.subscriptionStatus ?? null;
  if (st === ESTADO_GRATIS || st === ESTADO_GRATIS_CERRADO) return true;
  if (st === 'trialing' && !e.subscriptionId) return true;
  return st === 'incomplete' && !e.tieneCadena;
}

type Limites = Pick<Situacion, 'gestionLimitada' | 'servicioAlumnasSuspendido' | 'cobrosAutomaticosPausados'>;
const NADA: Limites = { gestionLimitada: false, servicioAlumnasSuspendido: false, cobrosAutomaticosPausados: false };
/** El estudio funciona: se limita el panel y se paran los cobros automáticos; las alumnas siguen como siempre. */
const GESTION_LIMITADA: Limites = { gestionLimitada: true, servicioAlumnasSuspendido: false, cobrosAutomaticosPausados: true };
const TODO_PARADO: Limites = { gestionLimitada: true, servicioAlumnasSuspendido: true, cobrosAutomaticosPausados: true };

const situacion = (
  estado: EstadoEstudio, limites: Limites, motivo: MotivoSituacion | null = null, variante: VarianteSuspendido | null = null, paga = false,
): Situacion => ({ estado, motivo, variante, paga, ...limites });

/** La situación, derivada, y qué limita. Espejo de `public.situacion_derivada`. */
export function situacionDerivada(e: EntradaSituacion): Situacion {
  // Quien paga, primero y sin excepciones: ni una baja, ni una purga, ni la falta de uso lo sacan de aquí.
  if (pagaElEstudio(e)) return situacion('ACTIVO_PAGO', NADA, null, null, true);
  if (e.purgado) return situacion('ELIMINADO', TODO_PARADO);
  if (e.supresionPedida) return situacion('EN_BAJA', TODO_PARADO, 'borrado_pedido');
  if (e.contratoTerminado) return situacion('EN_BAJA', TODO_PARADO, 'sin_plan');
  // Contrato vivo en Stripe: no se suspende ni se pausa nada (el panel pide actualizar la tarjeta, como hoy).
  if (e.subscriptionStatus === 'unpaid' || (e.tieneCadena && e.cadena?.subscriptionStatus === 'unpaid')) {
    return situacion('PAGO_PENDIENTE', { ...NADA, gestionLimitada: true });
  }
  if (esDeLaFamiliaGratis(e)) {
    // El límite del gratis gana a la falta de uso: ese estudio funciona y sus alumnas siguen.
    if (e.subscriptionStatus === ESTADO_GRATIS_CERRADO || e.faseGratis === 'CERRADO') return situacion('SUSPENDIDO', GESTION_LIMITADA, 'limite_gratis', 'funciona');
    if (!e.esDemo && e.diasSinActividad >= DIAS_HASTA_SUSPENDIDO) return situacion('SUSPENDIDO', TODO_PARADO, 'abandono', 'sin_senales');
    if (!e.esDemo && e.diasSinActividad >= DIAS_HASTA_INACTIVO) return situacion('INACTIVO', { ...NADA, cobrosAutomaticosPausados: true }, 'abandono');
    return situacion(e.faseGratis === 'MARGEN' ? 'GRATIS_EN_MARGEN' : 'GRATIS', NADA);
  }
  // Sin plan y sin gratis: una prueba agotada, una cancelación sin FOUNDING_GRATIS,
  // una sede de una cadena que dejó de pagar que no es la principal…
  return situacion('SUSPENDIDO', GESTION_LIMITADA, 'sin_plan', 'funciona');
}

/** La fase del gratis, la misma que el gate (`estadoGratis`): espejo de `public.fase_plan_gratis`. */
export function faseDelGratis(uso: UsoGratis | null, excedidoDesde: string | null, hoy: string): FaseGratis {
  return estadoGratis({ uso, excedidoDesde, hoy }).fase;
}

// ─── Días sin actividad ──────────────────────────────────────────────────────

const MS_DIA = 86_400_000;
const aMs = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
/** Días de calendario de `desde` a `hasta` ('YYYY-MM-DD'). */
export const diasEntre = (desde: string, hasta: string) => Math.round((aMs(hasta) - aMs(desde)) / MS_DIA);

export interface Cierre { desde: string; hasta: string }

export interface EntradaActividad {
  /** `ultima_actividad_real`: la última señal de uso real (null si nunca hubo). */
  ultimaActividad: Date | string | null;
  /** El alta del estudio. */
  creadoEn: Date | string | null;
  /** Último evento de plan aplicado (`subscription_evento_en` del estudio y de su cadena). */
  eventosDePlan: ReadonlyArray<Date | string | null>;
  /** Los «Cierre del centro» del estudio. */
  cierres: readonly Cierre[];
  /** El día del estudio ('YYYY-MM-DD', Madrid). */
  hoy: string;
}

const diaDe = (v: Date | string | null): string | null => (v === null ? null : hoyEnEstudio(v instanceof Date ? v : new Date(v)));

/**
 * El ancla: el día (Madrid) más reciente entre la última actividad real, el alta
 * y el último cambio de plan. Sin un cambio de plan en el ancla, quien deja de
 * pagar tras meses sin usar el panel entraría inactivo el mismo día.
 */
export function anclaDeActividad(e: Pick<EntradaActividad, 'ultimaActividad' | 'creadoEn' | 'eventosDePlan' | 'hoy'>): string {
  const dias = [e.ultimaActividad, e.creadoEn, ...e.eventosDePlan].map(diaDe).filter((d): d is string => d !== null);
  return dias.length === 0 ? e.hoy : dias.reduce((a, b) => (b > a ? b : a));
}

/** Días de «Cierre del centro» entre el ancla (excluida) y hoy (incluido), cada día una vez y cada cierre con su tope. */
export function diasDeCierreDesde(ancla: string, hoy: string, cierres: readonly Cierre[]): number {
  const dias = new Set<string>();
  for (const c of cierres) {
    const ultimo = [c.hasta, masDias(c.desde, DIAS_MAX_POR_CIERRE - 1), hoy].reduce((a, b) => (b < a ? b : a));
    for (let d = c.desde > ancla ? c.desde : masDias(ancla, 1); d <= ultimo; d = masDias(d, 1)) dias.add(d);
  }
  return dias.size;
}

/** Días sin actividad real hasta hoy, sin contar los de cierre. Nunca negativo. */
export function diasSinActividad(e: EntradaActividad): { ancla: string; diasDeCierre: number; dias: number } {
  const ancla = anclaDeActividad(e);
  const diasDeCierre = diasDeCierreDesde(ancla, e.hoy, e.cierres);
  return { ancla, diasDeCierre, dias: Math.max(0, diasEntre(ancla, e.hoy)) - diasDeCierre };
}
