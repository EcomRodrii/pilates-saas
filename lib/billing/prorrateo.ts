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
//  · DÍAS MÍNIMOS (`cobro_proporcional_dias_minimos`, por estudio, 3 de serie):
//    si al alta quedan ESE número de días o menos (contando el del alta), no se
//    cobra una cantidad simbólica: la primera cuota se cobra el día 1 del mes
//    siguiente. El primer ciclo sigue siendo «hoy → fin de mes» (días de
//    cortesía) y, como acaba el último día del mes, el cron de renovaciones
//    (`fecha_fin < hoy`) crea el día 1 el recibo de la cuota ENTERA: no hay
//    cuota gratis sin fecha de cobro ni sin recibo. 0 = prorratear siempre.
//    EN LA COMPRA ONLINE no se puede aplazar el cobro (Stripe no cobra 0 € y sin
//    primer pago no se guarda la tarjeta para renovar): ahí se cobra la cuota
//    ENTERA hoy y el ciclo llega hasta el último día del MES SIGUIENTE.
//  · POR DEBAJO DE 0,50 € TAMPOCO SE COBRA (suelo de seguridad, el mínimo que
//    acepta Stripe): se trata igual que «pocos días».
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

/** Cuántos días mínimos restantes para prorratear, de serie. */
export const DIAS_MINIMOS_POR_DEFECTO = 3;
/** Tope: un mínimo ≥ días del mes anularía el prorrateo entero. */
export const DIAS_MINIMOS_MAXIMO = 10;

/** El mínimo de días como entero 0..10; lo que no sea un número cae al de serie. */
export function normalizarDiasMinimos(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DIAS_MINIMOS_POR_DEFECTO;
  return Math.min(DIAS_MINIMOS_MAXIMO, Math.max(0, Math.trunc(n)));
}

/** Cómo se cobra el primer mes de una cuota nueva. */
export type ModoAlta =
  /** Alta el día 1: el mes entero. */
  | 'completo'
  /** Parte proporcional del mes en curso. */
  | 'proporcional'
  /** Quedan pocos días: no se cobra nada simbólico; la primera cuota es el día 1 del mes siguiente. */
  | 'siguiente_mes';

export interface ProrrateoAlta {
  modo: ModoAlta;
  canal: 'panel' | 'online';
  /** € que se cobran ahora por la cuota. 0 = nada (primera cuota el día 1 del mes siguiente). */
  importe: number;
  /** El precio de la cuota entera, que es lo que se cobra cada mes después. */
  importeCompleto: number;
  diasRestantes: number;
  diasDelMes: number;
  /** Alta el día 1: el mes entero, sin prorrateo. */
  mesCompleto: boolean;
  /** Pocos días (o menos de 0,50 €): no se cobra hoy. Equivale a `modo === 'siguiente_mes'`. */
  bajoElMinimo: boolean;
  /** Último día que vale este primer ciclo. */
  fechaFin: string;
  /** Mes en palabras: «octubre». */
  mes: string;
  /** El próximo cobro: el día después de `fechaFin`, por la cuota entera (online con pocos días, el del mes siguiente). */
  primerCobro: { fecha: string; importe: number };
  /** «parte proporcional de octubre: 17 de 31 días», «octubre completo» o «primera cuota el 1 de noviembre». */
  texto: string;
  /** La frase que ve la alumna ANTES de pagar: qué paga hoy, por qué y cuándo es lo siguiente. */
  frase: string;
}

type PlanProrrateable = Pick<PlanTarifa, 'tipo' | 'precio'> & Partial<Pick<PlanTarifa, 'periodicidadMeses'>>;

/** ¿Una cuota nueva de este plan se prorratea? Solo mensuales de UN mes con precio. */
export function planSeProrratea(plan: PlanProrrateable): boolean {
  return plan.tipo === 'MENSUAL' && mesesDeCiclo(plan) === 1 && plan.precio > 0;
}

const fechaLarga = (iso: string): string => {
  const [, m, d] = partes(iso);
  return `${d} de ${MESES[m - 1]}`;
};
const eurTxt = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;

/**
 * El cobro del primer mes de una cuota nueva, o `null` si el plan no se
 * prorratea. ÚNICA función para el panel, el servidor y lo que ve la alumna.
 * `hoyISO` es el día del ESTUDIO ('YYYY-MM-DD').
 */
export function prorrateoDeAlta(
  plan: PlanProrrateable,
  hoyISO: string,
  diasMinimos: number = DIAS_MINIMOS_POR_DEFECTO,
  canal: 'panel' | 'online' = 'panel',
): ProrrateoAlta | null {
  if (!planSeProrratea(plan)) return null;
  const [y, m, d] = partes(hoyISO);
  if (!y || !m || !d) return null;
  const minimo = normalizarDiasMinimos(diasMinimos);
  const total = diasDelMes(y, m);
  const restantes = Math.max(1, total - d + 1);
  const completoC = aCentimos(plan.precio);
  const mesCompleto = restantes >= total;
  const proporcionalC = mesCompleto ? completoC : repartoProporcional(completoC, restantes, total);
  const siguienteMes = !mesCompleto && (restantes <= minimo || proporcionalC < PRORRATEO_IMPORTE_MINIMO_CENTIMOS);
  const mes = MESES[m - 1];
  const finMes = `${y}-${dosDigitos(m)}-${dosDigitos(total)}`;
  const modo: ModoAlta = mesCompleto ? 'completo' : siguienteMes ? 'siguiente_mes' : 'proporcional';

  // Online con pocos días: la cuota entera hoy y el ciclo hasta fin del mes SIGUIENTE.
  const onlineEntera = siguienteMes && canal === 'online';
  const fechaFin = onlineEntera ? finDeMesSiguiente(y, m) : finMes;
  const importeC = mesCompleto ? completoC : siguienteMes ? (onlineEntera ? completoC : 0) : proporcionalC;
  const primerCobroFecha = masDias(fechaFin, 1);
  const primerCobro = { fecha: primerCobroFecha, importe: plan.precio };
  const restoTxt = `El ${fechaLarga(primerCobroFecha)}, ${eurTxt(plan.precio)} y cada mes.`;

  let texto: string;
  let frase: string;
  if (mesCompleto) {
    texto = `${mes} completo`;
    frase = `Hoy pagas ${eurTxt(plan.precio)} (${mes} completo). ${restoTxt}`;
  } else if (onlineEntera) {
    texto = `cuota entera: incluye los ${restantes} días que quedan de ${mes} y ${MESES[(m % 12)]} entero`;
    frase = `Hoy pagas ${eurTxt(plan.precio)}: incluye los ${restantes} días que quedan de ${mes} y todo ${MESES[m % 12]}. ${restoTxt}`;
  } else if (siguienteMes) {
    texto = `primera cuota el ${fechaLarga(primerCobroFecha)}`;
    frase = `Hoy no se cobra nada: quedan ${restantes} días de ${mes}. Tu primera cuota (${eurTxt(plan.precio)}) se cobra el ${fechaLarga(primerCobroFecha)}.`;
  } else {
    texto = `parte proporcional de ${mes}: ${restantes} de ${total} días`;
    frase = `Hoy pagas ${eurTxt(proporcionalC / 100)} (parte proporcional de ${mes}: ${restantes} de ${total} días). ${restoTxt}`;
  }
  return {
    modo, canal,
    importe: importeC / 100,
    importeCompleto: plan.precio,
    diasRestantes: restantes,
    diasDelMes: total,
    mesCompleto,
    bajoElMinimo: siguienteMes,
    fechaFin,
    mes,
    primerCobro,
    texto,
    frase,
  };
}

/** Último día del mes siguiente a (y, m). */
function finDeMesSiguiente(y: number, m: number): string {
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${dosDigitos(nm)}-${dosDigitos(diasDelMes(ny, nm))}`;
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
  /** Lo que hay que decirle a quien da el alta cuando hoy no se cobra nada (pocos días, o periodo ya cobrado); null si no hace falta. */
  aviso: string | null;
}

/**
 * ¿Esta clienta ya tuvo, en este MISMO periodo, una cuota mensual cobrada (o con su
 * cobro pendiente)? Una cuota CANCELADA cuyo ciclo llega a hoy y que tiene un recibo
 * COBRADO — o aún sin cobrar (PENDIENTE, EN_CURSO, FALLIDO) — ya cubre estos días:
 * volver a darla de alta NO cobra otra vez el mismo periodo (idempotencia por
 * clienta + periodo). Es la regla que distingue una REACTIVACIÓN (cancelar → volver
 * a apuntarla: no se cobra dos veces) de una alta nueva de verdad, y de la
 * recuperación de un pago fallido, que nunca es un alta: se cobra el recibo que ya
 * existe, no uno nuevo.
 *
 * Devuelve el último día cubierto y si está pagado o pendiente, o `null`. Sin
 * recibos cargados (la carga se corta a 1000 filas) no puede saberlo y devuelve `null`:
 * el servidor es quien decide con la lectura completa en la compra online.
 */
export function periodoDeCuotaAnterior(e: {
  socioId: string;
  suscripciones: ReadonlyArray<{ id: string; socioId: string | null; planId: string | null; estado: string; fechaFin?: string | null }>;
  recibos: ReadonlyArray<{ suscripcionId?: string | null; estado: string }>;
  planes: ReadonlyArray<{ id: string; tipo: string; periodicidadMeses?: number | null }>;
  hoyISO: string;
}): { fechaFin: string; estado: 'pagado' | 'pendiente' } | null {
  let mejor: { fechaFin: string; estado: 'pagado' | 'pendiente' } | null = null;
  for (const s of e.suscripciones) {
    if (s.socioId !== e.socioId || s.estado !== 'CANCELADA' || !s.fechaFin || s.fechaFin < e.hoyISO) continue;
    const plan = e.planes.find(p => p.id === s.planId);
    if (!plan || plan.tipo !== 'MENSUAL' || mesesDeCiclo({ periodicidadMeses: plan.periodicidadMeses as PlanTarifa['periodicidadMeses'] }) !== 1) continue;
    const suyos = e.recibos.filter(r => r.suscripcionId === s.id);
    const estado = suyos.some(r => r.estado === 'COBRADO') ? 'pagado'
      : suyos.some(r => r.estado === 'PENDIENTE' || r.estado === 'EN_CURSO' || r.estado === 'FALLIDO') ? 'pendiente' : null;
    if (!estado) continue;
    if (!mejor || s.fechaFin > mejor.fechaFin) mejor = { fechaFin: s.fechaFin, estado };
  }
  return mejor;
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
  diasMinimos: number = DIAS_MINIMOS_POR_DEFECTO,
  /** El periodo que ya cubre una cuota anterior de la clienta (`periodoDeCuotaAnterior`). */
  periodoAnterior: { fechaFin: string; estado: 'pagado' | 'pendiente' } | null = null,
): CicloYCobroDeAlta {
  const base = cicloInicialDe(plan, ahoraISO);
  const pr = proporcionalActivo ? prorrateoDeAlta(plan, hoyISO, diasMinimos, 'panel') : null;
  if (!pr) return { ...base, importe: plan.precio, prorrateo: null, prefijoRecibo: 'rec-', aviso: null };
  if (periodoAnterior) {
    // No se cobra otra vez el periodo que ya cubre su cuota anterior: hereda su fin y el siguiente
    // cobro llega con la renovación de siempre.
    return {
      fechaFin: periodoAnterior.fechaFin, sesionesRestantes: base.sesionesRestantes, importe: 0, prorrateo: null, prefijoRecibo: 'rec-',
      aviso: `Ya tenía este periodo ${periodoAnterior.estado === 'pagado' ? 'pagado' : 'pendiente de cobro (mira sus recibos)'} hasta el ${fechaLarga(periodoAnterior.fechaFin)}: no se le cobra otra vez.`,
    };
  }
  return {
    fechaFin: pr.fechaFin,
    sesionesRestantes: base.sesionesRestantes,
    importe: pr.importe,
    prorrateo: pr,
    // Solo el recibo PARCIAL lleva el motivo en el id (lo reconoce el aviso de
    // «sube tu cuota» para no tomarlo por el precio de la cuota).
    prefijoRecibo: pr.importe < pr.importeCompleto ? PREFIJO_RECIBO_PRORRATEO : 'rec-',
    aviso: pr.modo === 'siguiente_mes' ? pr.frase : null,
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

// ── Compra online: lo que se entrega es lo que se prometió al abrir el cobro ─

/** Marca de todo concepto de recibo que NO es el precio de la cuota: lo reconoce el aviso de «sube tu cuota». */
export const MARCA_CONCEPTO_PARCIAL = 'parte proporcional';

/**
 * `fecha_fin` de una cuota comprada online. El servidor la fija AL ABRIR el cobro
 * (`metadata.cicloFin`) y quien entrega (webhook, conciliador) NO recalcula con la
 * fecha de hoy: un cobro abierto el 31 y pagado el 1 entregaría otro periodo del
 * que se pagó. Si el pago llega cuando ese ciclo ya terminó, la cuota no puede
 * nacer caducada (la alumna acabaría de pagar sin poder reservar): se le da hasta
 * el fin del mes de hoy, alineada al día 1 para que el cron renueve el día 1.
 * Una fecha ausente, mal formada o absurda (más de 62 días) cae a la de siempre.
 */
export function fechaFinDeEntregaOnline(e: {
  cicloFinISO?: string | null;
  hoyISO: string;
  porDefecto: string | null;
}): { fechaFin: string | null; origen: 'metadata' | 'medianoche' | 'defecto' } {
  const c = e.cicloFinISO;
  if (typeof c !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c) || Number.isNaN(Date.parse(`${c}T00:00:00Z`))) {
    return { fechaFin: e.porDefecto, origen: 'defecto' };
  }
  if (c > masDias(e.hoyISO, 62)) return { fechaFin: e.porDefecto, origen: 'defecto' };
  if (c < e.hoyISO) {
    const [y, m] = partes(e.hoyISO);
    return { fechaFin: `${y}-${dosDigitos(m)}-${dosDigitos(diasDelMes(y, m))}`, origen: 'medianoche' };
  }
  return { fechaFin: c, origen: 'metadata' };
}
