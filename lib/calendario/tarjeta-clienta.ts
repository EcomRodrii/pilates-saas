// ─────────────────────────────────────────────────────────────────────────────
// P3.11 — la tarjeta de cada alumna en la lista de una clase (diseño 22).
//
// La propietaria elige qué se ve debajo del nombre de cada alumna en el
// Calendario: con qué viene, si ha confirmado, si es su cumpleaños, su nota
// fijada, si es su primera vez y cuánto se enseña de su salud. Va apagada tras
// `TARJETA_CLASE`; apagada, o sin nada guardado, es lo de siempre (`DE_SERIE`):
// el punto de color de salud y nada más.
//
// ⚠️ Esto solo elige qué PINTAR de lo que el rol YA RECIBE. No amplía ninguna
// consulta. Las condiciones de salud solo le llegan a la propietaria (RLS
// `salud_condiciones_salud_lectura`); aun así, «adaptar» no sale de aquí sin
// el permiso clínico (`verFichaClinica`), lo diga lo guardado o no.
//
// Se guarda en `studios.tarjeta_clase` (jsonb, NULL = lo de serie), y SOLO la
// escribe el servidor (`PUT /api/estudio/tarjeta-clase`, solo la propietaria).
// Al leer, lo que no se entienda vuelve a lo de serie, clave a clave.
//
// Pura y con imports relativos `.ts`: la prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { lineaCoberturaMostrador } from './cobertura-mostrador.ts';
import { planCubreTipoClase } from '../bono-logic.ts';
import type { Cobertura } from '../reservar/cobertura.ts';
import type { PlanTarifa, Suscripcion } from '../types.ts';

export type SaludTarjeta = 'nada' | 'color' | 'adaptar';

export interface TarjetaClase {
  /** «Bono 10 clases · le quedan 3», «Con su Mensual». */
  conQueViene: boolean;
  /** «Ha confirmado» / «Sin contestar», solo si se le pidió confirmar. */
  confirmacion: boolean;
  /** «Es su cumpleaños», el día de la clase en Madrid. */
  cumpleanos: boolean;
  /** Su nota fijada (la RLS ya quita las privadas de otras). */
  notaFijada: boolean;
  /** «Primera vez», sin contar a quien trae historial importado. */
  primeraVez: boolean;
  /** nada: sin punto de color · color: el punto (lo de hoy) · adaptar: el punto y qué adaptar (solo la propietaria). */
  salud: SaludTarjeta;
}

export const DE_SERIE: Readonly<TarjetaClase> = Object.freeze({
  conQueViene: false,
  confirmacion: false,
  cumpleanos: false,
  notaFijada: false,
  primeraVez: false,
  salud: 'color',
});

const SALUDES: readonly SaludTarjeta[] = ['nada', 'color', 'adaptar'];
const INTERRUPTORES = ['conQueViene', 'confirmacion', 'cumpleanos', 'notaFijada', 'primeraVez'] as const;
const CLAVES = [...INTERRUPTORES, 'salud'] as const;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lo guardado, leído con tolerancia: cada clave que no se entienda, la de serie. */
export function tarjetaClaseDe(valor: unknown): TarjetaClase {
  const t: TarjetaClase = { ...DE_SERIE };
  if (!esObjeto(valor)) return t;
  for (const k of INTERRUPTORES) if (typeof valor[k] === 'boolean') t[k] = valor[k] as boolean;
  if (SALUDES.includes(valor.salud as SaludTarjeta)) t.salud = valor.salud as SaludTarjeta;
  return t;
}

/** Lo que manda la pantalla al guardar, sin tolerancia: las seis claves y nada más. */
export function validarTarjetaClase(valor: unknown): { ok: true; tarjeta: TarjetaClase } | { ok: false; error: string } {
  if (!esObjeto(valor)) return { ok: false, error: 'Formato no válido' };
  const sobran = Object.keys(valor).filter(k => !(CLAVES as readonly string[]).includes(k));
  if (sobran.length > 0) return { ok: false, error: 'Formato no válido' };
  for (const k of INTERRUPTORES) if (typeof valor[k] !== 'boolean') return { ok: false, error: 'Formato no válido' };
  if (!SALUDES.includes(valor.salud as SaludTarjeta)) return { ok: false, error: 'Formato no válido' };
  return { ok: true, tarjeta: tarjetaClaseDe(valor) };
}

export function esDeSerie(t: TarjetaClase): boolean {
  return CLAVES.every(k => t[k] === DE_SERIE[k]);
}

/** Lo que se guarda: NULL si es lo de serie (así «lo de siempre» no deja rastro). */
export function paraGuardar(t: TarjetaClase): TarjetaClase | null {
  return esDeSerie(t) ? null : { ...t };
}

/**
 * Qué se enseña de la salud según lo elegido Y el rol. El rol manda siempre:
 * sin `verSemaforo` no hay color, y sin `verFichaClinica` no hay «adaptar»,
 * aunque lo guardado lo pida.
 */
export function saludVisible(t: TarjetaClase, rol: { verSemaforo: boolean; verFichaClinica: boolean }): { color: boolean; adaptar: boolean } {
  if (t.salud === 'nada') return { color: false, adaptar: false };
  return { color: rol.verSemaforo, adaptar: t.salud === 'adaptar' && rol.verFichaClinica };
}

// ── Con qué viene ────────────────────────────────────────────────────────────

type Texto = { texto: string; aviso: boolean };

/** El bono que pagó ESTA reserva (`reservas.bono_suscripcion_id`), tal como está hoy. */
export interface PagoConocido { planNombre: string; sesionesRestantes: number | null; vigente: boolean }

/**
 * Con qué viene quien ya está en la lista. Parte de la regla del mostrador al
 * apuntarla (`coberturaDeClase`), pero una reserva ya pagada NUNCA sale como
 * aviso: decirle a recepción «no tiene bono» de quien pagó esta clase con el
 * último que le quedaba es justo lo que no puede pasar.
 *
 * En orden: recuperación (ya la nombra la fila: nada que añadir) → clase
 * suelta → lo que tiene hoy y cubre la clase (cuota o bonos con saldo) → el
 * bono que pagó esta reserva («le quedan 0» si sigue vigente y vacío; si
 * caducó o se pausó, «Pagada con…») → un bono suyo vigente y agotado que cubre
 * la clase («le quedan 0»: es verdad la haya pagado con él o no) → lo que diría
 * el mostrador, como aviso (puede que haya que cobrarle).
 */
export function conQueVieneFila(d: {
  marca: 'fija' | 'recuperacion' | null;
  claseSuelta: boolean;
  cobertura: Cobertura;
  pagoCon: PagoConocido | null;
  bonoAgotado: { planNombre: string } | null;
}): Texto | null {
  if (d.marca === 'recuperacion') return null;
  if (d.claseSuelta) return { texto: 'Clase suelta', aviso: false };
  if (d.cobertura.estado === 'MENSUAL' || d.cobertura.estado === 'BONO') {
    return { texto: lineaCoberturaMostrador(d.cobertura).texto, aviso: false };
  }
  if (d.pagoCon) {
    return d.pagoCon.vigente && d.pagoCon.sesionesRestantes === 0
      ? { texto: `${d.pagoCon.planNombre} · le quedan 0`, aviso: false }
      : { texto: `Pagada con ${d.pagoCon.planNombre}`, aviso: false };
  }
  if (d.bonoAgotado) return { texto: `${d.bonoAgotado.planNombre} · le quedan 0`, aviso: false };
  const l = lineaCoberturaMostrador(d.cobertura);
  return { texto: l.texto, aviso: l.sinCobertura };
}

const vigenteHoy = (s: Pick<Suscripcion, 'estado' | 'fechaFin'>, hoyISO: string) =>
  s.estado === 'ACTIVA' && (!s.fechaFin || s.fechaFin >= hoyISO);

/** El bono que pagó esta reserva, si se sabe y existe. */
export function pagoConocido(
  bonoSuscripcionId: string | null | undefined,
  suscripciones: readonly Suscripcion[],
  planesTarifa: readonly PlanTarifa[],
  hoyISO: string,
): PagoConocido | null {
  if (!bonoSuscripcionId) return null;
  const s = suscripciones.find(x => x.id === bonoSuscripcionId);
  if (!s) return null;
  const plan = planesTarifa.find(p => p.id === s.planId);
  return { planNombre: plan?.nombre ?? 'su bono', sesionesRestantes: s.sesionesRestantes, vigente: vigenteHoy(s, hoyISO) };
}

/**
 * Un bono suyo vigente, que cubre este tipo de clase y está a 0. Sirve cuando
 * no se sabe qué bono pagó la reserva (las hechas desde el panel en esta misma
 * sesión llegan sin `bonoSuscripcionId` hasta recargar).
 */
export function bonoAgotadoQueCubre(d: {
  socioId: string;
  suscripciones: readonly Suscripcion[];
  planesTarifa: readonly PlanTarifa[];
  hoyISO: string;
  tipoClaseId: string | null;
}): { planNombre: string } | null {
  const planPorId = new Map(d.planesTarifa.map(p => [p.id, p]));
  for (const s of d.suscripciones) {
    if (s.socioId !== d.socioId || !vigenteHoy(s, d.hoyISO) || s.sesionesRestantes !== 0) continue;
    const plan = planPorId.get(s.planId);
    if (!plan || plan.tipo !== 'BONO' || !planCubreTipoClase(plan, d.tipoClaseId)) continue;
    return { planNombre: plan.nombre };
  }
  return null;
}

// ── Cumpleaños ───────────────────────────────────────────────────────────────

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/**
 * ¿Cumple años el día de la clase? `diaClase` es el día del ESTUDIO
 * ('YYYY-MM-DD', hora de Madrid) y `cumpleMmDd` el 'MM-DD' de su ficha. Quien
 * nació un 29 de febrero lo celebra el 28 los años que no son bisiestos.
 */
export function esSuCumpleanos(cumpleMmDd: string | null | undefined, diaClase: string): boolean {
  if (!cumpleMmDd || !/^\d{2}-\d{2}$/.test(cumpleMmDd) || !/^\d{4}-\d{2}-\d{2}$/.test(diaClase)) return false;
  const mmdd = diaClase.slice(5);
  if (cumpleMmDd === mmdd) return true;
  return cumpleMmDd === '02-29' && mmdd === '02-28' && !esBisiesto(Number(diaClase.slice(0, 4)));
}

/** «Hoy es su cumpleaños» si la clase es hoy; «Cumple años ese día» si es otro día. */
export function textoCumpleanos(cumpleMmDd: string | null | undefined, diaClase: string, hoy: string): string | null {
  if (!esSuCumpleanos(cumpleMmDd, diaClase)) return null;
  return diaClase === hoy ? 'Hoy es su cumpleaños' : 'Cumple años ese día';
}

// ── Primera vez ──────────────────────────────────────────────────────────────

/**
 * ¿Es su primera clase? Solo con el histórico entero cargado (si no, todas
 * parecerían nuevas) y nunca para quien trae historial de otra plataforma ni
 * para quien no tiene ficha: mejor callarse que decir «primera vez» a una
 * alumna de hace años (el mismo criterio que el `amor` de Tenti).
 */
export function esPrimeraVez(d: {
  historialCargado: boolean;
  /** true/false si se sabe; null si no hay ficha. */
  historialPrevio: boolean | null;
  /** Su primera reserva que contó, en todo el histórico (ISO), o null. */
  primeraReserva: string | null;
  inicioClase: string;
}): boolean {
  if (!d.historialCargado || d.historialPrevio !== false) return false;
  return d.primeraReserva == null || d.primeraReserva >= d.inicioClase;
}

// ── Las piezas de la fila ────────────────────────────────────────────────────

export type ClavePieza = 'primera-vez' | 'cumpleanos' | 'con-que-viene' | 'confirmacion' | 'nota' | 'adaptar';

export interface Pieza {
  clave: ClavePieza;
  texto: string;
  /** Algo que mirar antes de la clase (sin bono, sin contestar, qué adaptar). */
  aviso: boolean;
}

export interface DatosFila {
  estado: string;
  /** Ya empezó: «sin contestar» ya no sirve de nada. */
  claseEmpezada: boolean;
  /** Ya terminó: «con qué viene» y el cumpleaños son de antes y se callan. */
  claseTerminada: boolean;
  /** `conQueVieneFila`; null si no hay nada que decir o la fila no es de una alumna (una plataforma). */
  conQueViene: Texto | null;
  confirmacionPedidaEn?: string | null;
  confirmadoEn?: string | null;
  /** `textoCumpleanos`. */
  cumpleanos: string | null;
  notaFijada: string | null;
  primeraVez: boolean;
  /** Qué adaptar. Solo llega si quien mira tiene la ficha clínica. */
  adaptacion: string | null;
}

/** «Primera vez» en una fila «No vino» no dice nada: como el `amor` de Tenti, solo quien está o vino. */
const PRIMERA_VEZ_CUENTA = new Set(['CONFIRMADA', 'ASISTIDA']);

/** Lo que va debajo del nombre, en este orden. Nada si todo está apagado (lo de serie). */
export function piezasDeTarjeta(t: TarjetaClase, d: DatosFila, rol: { verSemaforo: boolean; verFichaClinica: boolean }): Pieza[] {
  const piezas: Pieza[] = [];
  if (t.primeraVez && d.primeraVez && PRIMERA_VEZ_CUENTA.has(d.estado)) piezas.push({ clave: 'primera-vez', texto: 'Primera vez', aviso: false });
  if (t.cumpleanos && d.cumpleanos && !d.claseTerminada) piezas.push({ clave: 'cumpleanos', texto: d.cumpleanos, aviso: false });
  if (t.conQueViene && d.conQueViene && !d.claseTerminada) piezas.push({ clave: 'con-que-viene', texto: d.conQueViene.texto, aviso: d.conQueViene.aviso });
  if (t.confirmacion && d.confirmacionPedidaEn && d.estado === 'CONFIRMADA' && !d.claseEmpezada) {
    piezas.push(d.confirmadoEn
      ? { clave: 'confirmacion', texto: 'Ha confirmado', aviso: false }
      : { clave: 'confirmacion', texto: 'Sin contestar', aviso: true });
  }
  const nota = d.notaFijada?.replace(/\s+/g, ' ').trim();
  if (t.notaFijada && nota) piezas.push({ clave: 'nota', texto: `Nota: ${nota}`, aviso: false });
  const adaptacion = d.adaptacion?.trim();
  if (saludVisible(t, rol).adaptar && adaptacion) piezas.push({ clave: 'adaptar', texto: adaptacion, aviso: true });
  return piezas;
}

/**
 * La nota fijada más reciente de cada alumna. Solo las de EQUIPO: la lista de
 * una clase se mira en el iPad del mostrador, y una nota PRIVADA (que la
 * propietaria sí puede leer, también las de otras) no se pinta ahí. Las de
 * sistema tampoco cuentan.
 */
export function notaFijadaPorSocia(notas: readonly { socioId: string; texto: string; tipo: string; fijada: boolean; creadoEn: string; visibilidad: string }[]): Map<string, string> {
  const elegida = new Map<string, { texto: string; creadoEn: string }>();
  for (const n of notas) {
    if (!n.fijada || n.tipo !== 'NOTA' || n.visibilidad !== 'EQUIPO' || !n.texto.trim()) continue;
    const ya = elegida.get(n.socioId);
    if (!ya || n.creadoEn > ya.creadoEn) elegida.set(n.socioId, { texto: n.texto, creadoEn: n.creadoEn });
  }
  return new Map([...elegida].map(([k, v]) => [k, v.texto]));
}

// ── La vista previa de Configuración ────────────────────────────────────────

/** Una alumna inventada, con todo lo que puede salir, para enseñar la fila sin datos de nadie. */
export const ALUMNA_DE_MUESTRA = {
  nombre: 'Lucía Martín',
  sitio: 'Reformer 3',
  datos: {
    estado: 'CONFIRMADA',
    claseEmpezada: false,
    claseTerminada: false,
    conQueViene: { texto: 'Bono 10 clases · le quedan 3', aviso: false },
    confirmacionPedidaEn: '2026-01-01T00:00:00.000Z',
    confirmadoEn: null,
    cumpleanos: 'Hoy es su cumpleaños',
    notaFijada: 'Viene recomendada por su fisio',
    primeraVez: true,
    adaptacion: 'Lesión de rodilla. Evitar flexión.',
  } satisfies DatosFila,
} as const;
