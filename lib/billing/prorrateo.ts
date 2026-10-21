// ─────────────────────────────────────────────────────────────────────────────
// Importe proporcional de una cuota: el DUEÑO ÚNICO de «cuánto es la parte».
//
// Dos preguntas de estudio real (WhatsApp, 21-oct-2026):
//   A) «Si una clienta nueva se apunta a mitad de mes, ¿se le puede cobrar la
//       parte proporcional y que el mes siguiente pague completo?»
//   B) «Si cambia a mitad de ciclo a un plan más caro, ¿se puede cobrar la
//       diferencia proporcional?»
//
// Las dos se reducen a «tanto por ciento de un importe según los días que
// quedan», y las dos pasan por `repartoProporcional`. Quien necesite una parte
// de un importe lo pide AQUÍ: ni el panel, ni el servidor, ni un test lo
// reimplementan (un redondeo distinto en cada sitio es cómo un recibo, su
// vista previa y su factura acaban diciendo tres céntimos distintos).
//
// ── Reglas, todas deliberadas ───────────────────────────────────────────────
//
//  · EL DÍA DEL ALTA CUENTA COMO DÍA DE USO. Alta el 15 de octubre = del 15 al
//    31 = 17 de 31 días (la alumna puede venir a clase ese mismo día). Es lo que
//    ve la alumna («17 de 31 días») y lo que el estudio espera al contarlo a
//    mano.
//  · EL REDONDEO ES UNO: al céntimo, y la mitad hacia ARRIBA, en aritmética
//    entera (nunca `x * dias / total` en coma flotante: 2,675 € salía 2,67).
//    Nunca supera el importe completo.
//  · POR DEBAJO DE 0,50 € NO SE COBRA NADA. Es el mínimo que acepta Stripe en
//    un cargo; un recibo que no se puede cobrar con tarjeta es peor que unos
//    días gratis. Es raro (las últimas horas de un mes con una cuota baja) y
//    queda dicho en la pantalla.
//  · «HOY» ES EL DE MADRID, nunca el de UTC ni el del navegador: se recibe ya
//    como 'YYYY-MM-DD' (`hoyEnEstudio`). Todo lo demás es aritmética de
//    calendario sobre esa fecha (`Date.UTC`), así que el cambio de hora no
//    puede mover ni un día.
//  · SOLO CUOTAS MENSUALES DE UN MES. Bonos, clases sueltas y las cuotas de
//    3/6/12 meses no se prorratean: no hay un «mes en curso» que repartir.
//  · LA MATRÍCULA NO ENTRA AQUÍ. Es un recibo aparte (`Matrícula — …`) que se
//    cobra entera; esta función solo conoce la cuota.
//
// ── Cómo encaja con `cobro_dia_1_activo` ────────────────────────────────────
//  El primer ciclo prorrateado ACABA el último día del mes, que es justo lo que
//  el cobro «el día 1» necesita (`proximoFinAlineadoDia1` guarda el día antes de
//  un día 1): la renovación llega el día 1 por la cuota entera.
//   · Solo `cobro_proporcional_alta_activo`: las cuotas NUEVAS nacen alineadas y
//     se renuevan el día 1; las que ya existían en su aniversario no se tocan.
//   · Solo `cobro_dia_1_activo`: como siempre (sin prorratear).
//   · Los dos: las nuevas prorratean; las antiguas se realinean al día 1, sin
//     prorrateo, en su próxima renovación.
// ─────────────────────────────────────────────────────────────────────────────

import { masDias } from '../utils.ts';
import { cicloInicialDe, mesesDeCiclo } from '../bono-logic.ts';
import type { PlanTarifa } from '../types.ts';

/** Lo mínimo que acepta Stripe en un cargo (0,50 €): por debajo no se cobra. */
export const PRORRATEO_IMPORTE_MINIMO_CENTIMOS = 50;

/** Prefijo del id de un recibo de alta prorrateada: el motivo viaja en el id. */
export const PREFIJO_RECIBO_PRORRATEO = 'rec-prorrateo-';
/** Prefijo del id de un recibo de diferencia por cambio de plan. */
export const PREFIJO_RECIBO_CAMBIO_PLAN = 'rec-camb-';

/** ¿Es un recibo de importe parcial (no representa el precio de la cuota)? */
export function esReciboParcialDeCuota(reciboId: string): boolean {
  return reciboId.startsWith(PREFIJO_RECIBO_PRORRATEO) || reciboId.startsWith(PREFIJO_RECIBO_CAMBIO_PLAN);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function aCentimos(euros: number): number {
  return Math.round(euros * 100);
}

/**
 * `dias / total` de `importeCentimos`, al céntimo (mitad hacia arriba), en
 * enteros. Acotado a [0, importeCentimos]. Un `total` imposible da 0: cobrar de
 * menos por un dato corrupto es mejor que cobrar de más.
 */
export function repartoProporcional(importeCentimos: number, dias: number, total: number): number {
  if (!Number.isFinite(importeCentimos) || !Number.isFinite(dias) || !Number.isFinite(total)) return 0;
  if (importeCentimos <= 0 || dias <= 0 || total <= 0) return 0;
  if (dias >= total) return Math.round(importeCentimos);
  const c = Math.round(importeCentimos);
  return Math.min(c, Math.floor((2 * c * dias + total) / (2 * total)));
}

function partes(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

/** Días naturales de `desde` a `hasta` (hasta − desde), con ambas 'YYYY-MM-DD'. */
function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = partes(desde);
  const [y2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function diasDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Suma (o resta) meses a una fecha SIN desbordar: 31 mar − 1 mes = 28/29 feb. */
function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = partes(iso);
  const total = (y * 12 + (m - 1)) + meses;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, diasDelMes(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * ¿Esta `fecha_fin` es el ÚLTIMO día de un mes (el día antes de un día 1)?
 * Así acaba el primer ciclo de una cuota prorrateada, y así la reconoce la
 * renovación para realinearla al día 1 sin tocar las cuotas de aniversario.
 */
export function terminaEnFinDeMes(fechaFinISO: string): boolean {
  return partes(masDias(fechaFinISO.slice(0, 10), 1))[2] === 1;
}

// ── A) Alta a mitad de mes ──────────────────────────────────────────────────

export interface ProrrateoAlta {
  /** € que se cobran ahora por la cuota. 0 = nada (por debajo del mínimo). */
  importe: number;
  /** El precio de la cuota entera, que es lo que se cobra cada mes después. */
  importeCompleto: number;
  diasRestantes: number;
  diasDelMes: number;
  /** Alta el día 1: el mes entero, sin prorrateo. */
  mesCompleto: boolean;
  /** El importe salió por debajo del mínimo y no se cobra. */
  bajoElMinimo: boolean;
  /** Último día del mes: hasta cuándo vale este primer ciclo. */
  fechaFin: string;
  /** Mes en palabras: «octubre». */
  mes: string;
  /** «parte proporcional de octubre: 17 de 31 días» (o «octubre completo»). */
  texto: string;
}

type PlanProrrateable = Pick<PlanTarifa, 'tipo' | 'precio'> & Partial<Pick<PlanTarifa, 'periodicidadMeses'>>;

/** ¿Una cuota nueva de este plan se prorratea? Solo mensuales de UN mes con precio. */
export function planSeProrratea(plan: PlanProrrateable): boolean {
  return plan.tipo === 'MENSUAL' && mesesDeCiclo(plan) === 1 && plan.precio > 0;
}

/**
 * La parte del mes en curso que se cobra al dar de alta una cuota, o `null` si
 * el plan no se prorratea. `hoyISO` es el día del ESTUDIO ('YYYY-MM-DD').
 */
export function prorrateoDeAlta(plan: PlanProrrateable, hoyISO: string): ProrrateoAlta | null {
  if (!planSeProrratea(plan)) return null;
  const [y, m, d] = partes(hoyISO);
  if (!y || !m || !d) return null;
  const total = diasDelMes(y, m);
  const restantes = Math.max(1, total - d + 1);
  const completoC = aCentimos(plan.precio);
  const mesCompleto = restantes >= total;
  let c = mesCompleto ? completoC : repartoProporcional(completoC, restantes, total);
  const bajoElMinimo = !mesCompleto && c < PRORRATEO_IMPORTE_MINIMO_CENTIMOS;
  if (bajoElMinimo) c = 0;
  const mes = MESES[m - 1];
  return {
    importe: c / 100,
    importeCompleto: plan.precio,
    diasRestantes: restantes,
    diasDelMes: total,
    mesCompleto,
    bajoElMinimo,
    fechaFin: `${y}-${dosDigitos(m)}-${dosDigitos(total)}`,
    mes,
    texto: mesCompleto ? `${mes} completo` : `parte proporcional de ${mes}: ${restantes} de ${total} días`,
  };
}

export interface CicloYCobroDeAlta {
  fechaFin: string | null;
  sesionesRestantes: number | null;
  /** Lo que se cobra por la cuota al darla de alta (`plan.precio` si no se prorratea). */
  importe: number;
  /** Prorrateo aplicado, o `null` si el alta es como siempre. */
  prorrateo: ProrrateoAlta | null;
  /** Prefijo del id del recibo: el motivo viaja en el id. */
  prefijoRecibo: string;
}

/**
 * El primer ciclo de un plan recién contratado POR EL PANEL, con su cobro.
 *
 * Es `cicloInicialDe` (la misma función que el resto de vías) más, SOLO con el
 * ajuste del estudio activo y un plan que se prorratea, el ciclo hasta fin de mes
 * y su parte del importe. Con el ajuste apagado devuelve EXACTAMENTE lo de
 * siempre: ningún estudio cambia sin activarlo.
 */
export function cicloYCobroDeAlta(
  plan: Pick<PlanTarifa, 'tipo' | 'sesiones' | 'validezDias' | 'precio'> & Partial<Pick<PlanTarifa, 'periodicidadMeses'>>,
  ahoraISO: string,
  hoyISO: string,
  proporcionalActivo: boolean,
): CicloYCobroDeAlta {
  const base = cicloInicialDe(plan, ahoraISO);
  const pr = proporcionalActivo ? prorrateoDeAlta(plan, hoyISO) : null;
  if (!pr) return { ...base, importe: plan.precio, prorrateo: null, prefijoRecibo: 'rec-' };
  return {
    fechaFin: pr.fechaFin,
    sesionesRestantes: base.sesionesRestantes,
    importe: pr.importe,
    prorrateo: pr,
    // Solo el recibo PARCIAL lleva el motivo en el id (lo reconoce el aviso de
    // «sube tu cuota» para no tomarlo por el precio de la cuota).
    prefijoRecibo: pr.importe < pr.importeCompleto ? PREFIJO_RECIBO_PRORRATEO : 'rec-',
  };
}

/** Concepto del recibo de alta: «Alta — Plan · parte proporcional de octubre: 17 de 31 días». */
export function conceptoAltaProrrateada(prefijo: string, nombrePlan: string, pr: ProrrateoAlta | null): string {
  return pr && !pr.mesCompleto ? `${prefijo} — ${nombrePlan} · ${pr.texto}` : `${prefijo} — ${nombrePlan}`;
}

// ── B) Diferencia al subir de plan a mitad de ciclo ─────────────────────────

export interface DiferenciaCambioPlan {
  /** ¿Se puede ofrecer cobrar la diferencia? (más caro, mismo ciclo, en ciclo). */
  aplica: boolean;
  /** Por qué no, en lenguaje de pantalla. */
  motivoNo: string | null;
  /** € de la diferencia proporcional (0 si no aplica). */
  importe: number;
  /** Diferencia de precio de un ciclo entero (nuevo − actual). */
  diferenciaCiclo: number;
  diasRestantes: number;
  diasCiclo: number;
  /** «(69 € − 49 €) × 12 de 30 días». */
  texto: string;
}

export interface EntradaDiferencia {
  precioActual: number;
  precioNuevo: number;
  /** `fecha_fin` de la cuota actual: el último día que vale este ciclo. */
  fechaFin: string | null;
  /** Meses de ciclo de AMBOS planes (tienen que coincidir). */
  mesesCicloActual: number;
  mesesCicloNuevo: number;
  hoyISO: string;
}

const sinDiferencia = (motivoNo: string, extra: Partial<DiferenciaCambioPlan> = {}): DiferenciaCambioPlan => ({
  aplica: false, motivoNo, importe: 0, diferenciaCiclo: 0, diasRestantes: 0, diasCiclo: 0, texto: '', ...extra,
});

const eur = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;

/**
 * La diferencia a cobrar al pasar a un plan MÁS CARO con la cuota en ciclo:
 * (precio nuevo − precio actual) × días que quedan ÷ días del ciclo.
 *
 * El ciclo es `[fechaFin + 1 día − N meses, fechaFin]`, con los meses sumados SIN
 * desbordar. Los días que quedan cuentan HOY (misma regla que el alta). Más
 * barato o igual: no se cobra ni se devuelve nada (el cambio es como siempre).
 */
export function diferenciaCambioPlan(e: EntradaDiferencia): DiferenciaCambioPlan {
  if (e.mesesCicloActual !== e.mesesCicloNuevo) {
    return sinDiferencia('Los dos planes no tienen el mismo periodo de cobro: la diferencia no se calcula sola.');
  }
  const diferenciaC = aCentimos(e.precioNuevo) - aCentimos(e.precioActual);
  if (diferenciaC <= 0) return sinDiferencia('El plan nuevo no es más caro: no hay diferencia que cobrar.');
  if (!e.fechaFin) return sinDiferencia('Esta cuota no tiene fecha de renovación: no se puede calcular la parte del ciclo.');
  const siguiente = masDias(e.fechaFin.slice(0, 10), 1);
  const inicio = sumarMeses(siguiente, -e.mesesCicloActual);
  const diasCiclo = diasEntre(inicio, siguiente);
  const restantes = diasEntre(e.hoyISO, siguiente);
  if (restantes <= 0 || diasCiclo <= 0) return sinDiferencia('El ciclo de esta cuota ya ha terminado: se renueva con el plan nuevo.');
  const dias = Math.min(restantes, diasCiclo);
  const c = repartoProporcional(diferenciaC, dias, diasCiclo);
  const texto = `(${eur(e.precioNuevo)} − ${eur(e.precioActual)}) × ${dias} de ${diasCiclo} días`;
  if (c < PRORRATEO_IMPORTE_MINIMO_CENTIMOS) {
    return sinDiferencia('La diferencia sale por debajo de 0,50 €: no se cobra.', {
      diferenciaCiclo: diferenciaC / 100, diasRestantes: dias, diasCiclo, texto,
    });
  }
  return { aplica: true, motivoNo: null, importe: c / 100, diferenciaCiclo: diferenciaC / 100, diasRestantes: dias, diasCiclo, texto };
}

/** Id del recibo de la diferencia: una cuota se cambia UNA vez (después deja de estar activa). */
export function idReciboCambioPlan(suscripcionActualId: string): string {
  return `${PREFIJO_RECIBO_CAMBIO_PLAN}${suscripcionActualId}`;
}
/** Id de la cuota nueva del cambio: determinista, para que un reintento choque y no duplique. */
export function idSuscripcionCambioPlan(suscripcionActualId: string): string {
  return `sus-camb-${suscripcionActualId}`;
}
