// ─────────────────────────────────────────────────────────────────────────────
// Reglas de la bandeja de cobros externos: qué se puede hacer con un movimiento
// en cada estado, cómo se pasa su fecha y su importe a `confirmarCobro()`, y qué
// significa encontrarse el recibo ya cobrado. Diseño, secciones C, D y F de
// docs/cobros-externos-diseno.md.
//
// Puro: lo prueba `node --test`. La E/S vive en `servidor.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { instanteEnEstudio, masDias } from '../utils.ts';
import type { EstadoMovimiento, MetodoMovimiento, MotivoDescarte, Fuente } from './tipos.ts';
import { MOTIVOS_DESCARTE } from './tipos.ts';
import { cobradoPorStripe, sePuedeEnlazar, type ReciboParaEmparejar } from './emparejar.ts';
import type { MovimientoNormalizado } from './tipos.ts';
import { normalizar } from './texto.ts';

/** Un cobro de hace más de esto no se confirma desde un fichero: es otro ejercicio, casi seguro. */
export const DIAS_MAXIMOS_ATRAS = 400;

/** Pasado este tiempo, un `CONFIRMANDO` se da por colgado (la función murió a medias) y se recupera. */
export const MINUTOS_CERROJO = 2;

/**
 * La fecha REAL del cobro que va a `recibos.fecha_cobro`: con formato, que exista,
 * no futura y no más de `DIAS_MAXIMOS_ATRAS` atrás. `hoy` en día del estudio.
 */
export function fechaCobroExternoValida(fecha: string, hoy: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return false;
  return fecha <= hoy && fecha >= masDias(hoy, -DIAS_MAXIMOS_ATRAS);
}

/**
 * Quien no es la propietaria confirma cobros de este mes y del anterior (el extracto
 * de fin de mes se sube a primeros del siguiente). Más atrás, el cobro cambia los
 * ingresos de meses ya cerrados: lo decide la propietaria. «Marcar cobrado» siempre
 * fecha hoy; esta es la única puerta que fecha en el pasado.
 */
export function puedeFecharCobroExterno(rol: string, fecha: string, hoy: string): boolean {
  if (rol === 'PROPIETARIO') return true;
  const [a, m] = hoy.split('-').map(Number);
  const inicioMesAnterior = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
  return fecha >= inicioMesAnterior;
}

/** 5900 → '59.00': el importe del compare-and-set, en texto para no redondear el `numeric`. */
export function importeEnTexto(centimos: number): string {
  return `${Math.trunc(centimos / 100)}.${String(Math.abs(centimos % 100)).padStart(2, '0')}`;
}

/** Un `numeric` de la base (número o texto) en céntimos; `null` si no lo es. */
export function centimosDe(importe: unknown): number | null {
  const n = typeof importe === 'number' ? importe : typeof importe === 'string' && importe.trim() ? Number(importe) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Con qué se cobró, en los valores de `recibos.metodo_cobro`. `OTRO` es un abono
 * que no dice cómo llegó; si entró en la cuenta y no es tarjeta ni Bizum, es una
 * transferencia.
 */
export function metodoCobroDe(m: MetodoMovimiento): 'TARJETA' | 'TRANSFERENCIA' | 'BIZUM' {
  return m === 'OTRO' ? 'TRANSFERENCIA' : m;
}

/** El instante real del cobro si la fuente trae la hora (Norma 43 no la trae). */
export function cobradoEnDe(fecha: string, hora: string | null): string | undefined {
  if (!hora) return undefined;
  return instanteEnEstudio(fecha, hora) ?? undefined;
}

// ── Transiciones ─────────────────────────────────────────────────────────────

export const ACCIONES_BANDEJA = ['confirmar', 'enlazar', 'descartar', 'reabrir', 'doble_cobro'] as const;
export type AccionBandeja = (typeof ACCIONES_BANDEJA)[number];

/** Desde qué estados se puede hacer cada cosa. Lo final no se deshace desde aquí. */
export const DESDE: Readonly<Record<AccionBandeja, readonly EstadoMovimiento[]>> = {
  confirmar: ['POR_REVISAR'],
  // Un DOBLE_COBRO se enlaza cuando la persona comprueba que no era doble.
  enlazar: ['POR_REVISAR', 'DOBLE_COBRO'],
  // Un DOBLE_COBRO se descarta cuando se le devuelve el dinero a la alumna.
  descartar: ['POR_REVISAR', 'DOBLE_COBRO'],
  reabrir: ['DESCARTADO'],
  doble_cobro: ['POR_REVISAR'],
};

export function esMotivoDescarte(x: unknown): x is MotivoDescarte {
  return typeof x === 'string' && (MOTIVOS_DESCARTE as readonly string[]).includes(x);
}

// ── El recibo ya estaba cobrado ──────────────────────────────────────────────

/**
 * `confirmarCobro()` dice `ya_estaba`: el recibo ya estaba cobrado al llegar. Qué se
 * hace con el movimiento:
 *  · lo cobró un movimiento del banco que ya no lo tiene ligado, con ESTE importe y
 *    ESTA fecha → `PROPIO`: es la escritura de una confirmación anterior de este
 *    mismo pago que no llegó a cerrarse (un 504 después del commit). Se cierra y se
 *    terminan sus efectos;
 *  · lo cobró OTRO movimiento que sigue ligado → vuelve a revisión (puede ser un
 *    pago doble de la alumna; lo decide una persona con el aviso del motor);
 *  · se apuntó a mano, sin Stripe, y cuadran importe, método y fecha → `ENLAZADO`:
 *    es el apunte de este mismo pago;
 *  · pasó por Stripe → `DOBLE_COBRO`: hay dinero que devolver;
 *  · a mano, pero no cuadra (otro método, otra fecha) → vuelve a revisión.
 */
export type DesenlaceYaCobrado = 'PROPIO' | 'ENLAZADO' | 'DOBLE_COBRO' | 'POR_REVISAR';

export function desenlaceYaCobrado(
  r: ReciboParaEmparejar, m: MovimientoNormalizado, ligadoAOtroMovimiento: boolean,
): DesenlaceYaCobrado {
  if (ligadoAOtroMovimiento) return 'POR_REVISAR';
  if (r.conciliadoPor === 'externo') {
    return r.estado === 'COBRADO' && r.importeCentimos === m.importeCentimos && r.fechaCobro === m.fechaOperacion
      ? 'PROPIO' : 'POR_REVISAR';
  }
  if (sePuedeEnlazar({ ...r, ligadoAMovimiento: false }, m)) return 'ENLAZADO';
  if (cobradoPorStripe(r)) return 'DOBLE_COBRO';
  return 'POR_REVISAR';
}

// ── El mismo cobro por dos fuentes ───────────────────────────────────────────

export interface MovimientoParaDuplicado {
  id: string;
  fuente: Fuente;
  estado: EstadoMovimiento;
  importeCentimos: number;
  fechaOperacion: string;
  horaOperacion: string | null;
  tarjetaUltimos4: string | null;
  pagadorNombre: string | null;
}

const minutosDe = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** JSON con las claves ordenadas: `jsonb` las reordena, y comparar el texto tal cual daría siempre «distinto». */
export function jsonEstable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(jsonEstable).join(',')}]`;
  if (x && typeof x === 'object') {
    return `{${Object.keys(x as object).filter(k => (x as Record<string, unknown>)[k] !== undefined).sort()
      .map(k => `${JSON.stringify(k)}:${jsonEstable((x as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(x ?? null);
}

/**
 * ¿Es este movimiento el mismo cobro que otro ya importado de OTRA fuente? (el
 * extracto del banco y la exportación del datáfono, por ejemplo). Mismo importe y
 * mismo día, y o bien la misma tarjeta a ±3 minutos, o bien el mismo pagador.
 * Solo se SEÑALA (`posible_duplicado_de`): decide una persona. Si hay varios, el
 * ya confirmado primero, porque es el que obliga a descartar este.
 */
export function posibleDuplicadoDe(
  nuevo: Omit<MovimientoParaDuplicado, 'id' | 'estado'>, existentes: readonly MovimientoParaDuplicado[],
): string | null {
  const pagador = nuevo.pagadorNombre ? normalizar(nuevo.pagadorNombre) : null;
  const iguales = existentes.filter(e => {
    if (e.fuente === nuevo.fuente || e.importeCentimos !== nuevo.importeCentimos || e.fechaOperacion !== nuevo.fechaOperacion) return false;
    if (e.estado === 'DESCARTADO') return false;
    const porTarjeta = !!nuevo.tarjetaUltimos4 && e.tarjetaUltimos4 === nuevo.tarjetaUltimos4
      && !!nuevo.horaOperacion && !!e.horaOperacion
      && Math.abs(minutosDe(nuevo.horaOperacion) - minutosDe(e.horaOperacion)) <= 3;
    const porPagador = !!pagador && !!e.pagadorNombre && normalizar(e.pagadorNombre) === pagador;
    return porTarjeta || porPagador;
  });
  if (iguales.length === 0) return null;
  const confirmado = iguales.find(e => e.estado === 'CONFIRMADO' || e.estado === 'ENLAZADO');
  return (confirmado ?? [...iguales].sort((a, b) => (a.id < b.id ? -1 : 1))[0]).id;
}
