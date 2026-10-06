// Los movimientos de un bono (P4-D, 5-oct-2026): de dónde sale cada sesión que entra y cada una que se gasta, leído del
// ledger de derechos (`movimientos_derecho`, migr 20261002133851). Compartido entre la ruta (que serializa) y la app (que
// pinta). Puro, sin `@/` y con imports relativos con `.ts`: lo prueba `node --test`.
//
// ⚠️ Lista blanca de columnas: ni `actor_id`, ni `actor_tipo`, ni `motivo`, ni `contexto`, ni `socio_id`. Quién del
// equipo tocó su saldo y por qué es información interna del estudio (la exportación RGPD excluye este libro por lo
// mismo, lib/socios/exportar-datos-socia.ts).

import { fechaCorta } from './formato.ts';

export const COLUMNAS_LEDGER = 'id, tipo, delta, saldo_despues, reserva_id, creado_en';

/**
 * Los tipos de movimiento de un BONO. `REVERSION_VENTA` no la escribe nadie hoy: si apareciera, se pinta como ajuste.
 * Lo de las recuperaciones y la cuota (`USO_CUOTA`, `SIN_COBERTURA`) no mueve el saldo de un bono y no entra.
 */
export const TIPOS_DE_BONO = ['APERTURA', 'COMPRA', 'RENOVACION', 'CONSUMO_BONO', 'DEVOLUCION_BONO', 'AJUSTE_SIN_CONTEXTO', 'REVERSION_VENTA'] as const;

export type ClaseMovimiento = 'apertura' | 'compra' | 'renovacion' | 'consumo' | 'devolucion' | 'ajuste';

/** Lo que viaja a la app por cada movimiento. Sin ids de otras personas ni de quién lo hizo. */
export interface MovimientoBonoVista {
  id: string;
  clase: ClaseMovimiento;
  delta: number;
  saldoDespues: number | null;
  /** Cuándo se apuntó (ISO). */
  fecha: string;
  /** La clase de la reserva, si la reserva es SUYA y la sesión existe. */
  claseInfo?: { nombre: string; inicio: string; fecha: string };
  /** Estado crudo de su reserva (CONFIRMADA, ASISTIDA, NO_ASISTIO, CANCELADA…). */
  estadoReserva?: string;
  /** `reservas.cancelada_tardia`: `null` = no se sabe. */
  canceladaTarde?: boolean | null;
  /** La sesión se canceló (el estudio, el mínimo de asistentes o la baja de la instructora). */
  claseCancelada?: boolean;
}

export interface FilaLedger { id: string; tipo: string; delta: number; saldo_despues: number | null; reserva_id: string | null; creado_en: string }
export interface ReservaSuya { id: string; estado: string; sesion_id: string; cancelada_tardia: boolean | null }
export interface SesionMin { id: string; inicio: string; tipo_clase_id: string | null; cancelada: boolean | null }

const CLASE: Record<string, ClaseMovimiento> = {
  APERTURA: 'apertura', COMPRA: 'compra', RENOVACION: 'renovacion', CONSUMO_BONO: 'consumo', DEVOLUCION_BONO: 'devolucion',
};

/**
 * Una fila del ledger, lista para la app. La reserva solo se describe si es SUYA (`reservas` ya llega filtrada por ella):
 * una reserva ajena o borrada deja el movimiento sin clase, nunca con la de otra persona.
 * `fechaEstudio` pasa un instante a «YYYY-MM-DD» en la zona del estudio.
 */
export function serializarMovimiento(
  f: FilaLedger,
  reservas: ReadonlyMap<string, ReservaSuya>,
  sesiones: ReadonlyMap<string, SesionMin>,
  nombresTipo: ReadonlyMap<string, string>,
  fechaEstudio: (iso: string) => string,
): MovimientoBonoVista {
  const m: MovimientoBonoVista = {
    id: f.id, clase: CLASE[f.tipo] ?? 'ajuste', delta: f.delta, saldoDespues: f.saldo_despues, fecha: f.creado_en,
  };
  const r = f.reserva_id ? reservas.get(f.reserva_id) : undefined;
  if (r) {
    m.estadoReserva = r.estado;
    m.canceladaTarde = r.cancelada_tardia;
    const s = sesiones.get(r.sesion_id);
    if (s) {
      m.claseCancelada = s.cancelada === true;
      const nombre = (s.tipo_clase_id && nombresTipo.get(s.tipo_clase_id)) || 'Clase';
      m.claseInfo = { nombre, inicio: s.inicio, fecha: fechaEstudio(s.inicio) };
    }
  }
  return m;
}

const conSigno = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** «12 oct», sin el día de la semana: para lo que no es una clase. */
function diaMes(iso: string): string {
  const c = fechaCorta(iso.slice(0, 10));
  return c.split(' ').slice(1).join(' ');
}

/**
 * Lo que dice cada movimiento. `cifra` («−1», «+8»), `titulo` y, si hay, `detalle`.
 *
 * ⚠️ Una COMPRA es «Bono activado», nunca «Compraste»: el trigger del ledger apunta COMPRA en cualquier alta del bono,
 * también si lo importó o se lo regaló el estudio. Y una devolución solo dice POR QUÉ cuando se sabe.
 */
export function textoMovimiento(m: MovimientoBonoVista, ahoraMs: number | null): { cifra: string; titulo: string; detalle: string | null } {
  const cifra = conSigno(m.delta);
  const clase = m.claseInfo ? `${m.claseInfo.nombre} · ${fechaCorta(m.claseInfo.fecha)}` : null;
  switch (m.clase) {
    case 'apertura':
      return { cifra: String(m.delta), titulo: `El ${diaMes(m.fecha)} tenías ${m.delta}`, detalle: null };
    case 'compra':
      return { cifra, titulo: 'Bono activado', detalle: diaMes(m.fecha) };
    case 'renovacion':
      return { cifra, titulo: 'Renovación', detalle: diaMes(m.fecha) };
    case 'consumo':
      return { cifra, titulo: clase ?? `Reserva del ${diaMes(m.fecha)}`, detalle: estadoDelConsumo(m, ahoraMs) };
    case 'devolucion': {
      const porque = m.claseCancelada
        ? 'Devuelta: se canceló la clase'
        : m.estadoReserva === 'CANCELADA' && m.canceladaTarde === false
          ? 'Devuelta: reserva cancelada a tiempo'
          : 'Sesión devuelta';
      return { cifra, titulo: porque, detalle: clase };
    }
    default:
      return { cifra, titulo: 'Ajuste del saldo', detalle: diaMes(m.fecha) };
  }
}

function estadoDelConsumo(m: MovimientoBonoVista, ahoraMs: number | null): string | null {
  switch (m.estadoReserva) {
    case 'ASISTIDA': return 'Fuiste';
    case 'NO_ASISTIO': return 'No viniste';
    case 'CANCELADA': return m.canceladaTarde === true ? 'Cancelada fuera de plazo' : 'Cancelada';
    case 'CONFIRMADA':
      if (!m.claseInfo || ahoraMs === null) return 'Reservada';
      return Date.parse(m.claseInfo.inicio) > ahoraMs ? 'Reservada' : 'Clase ya pasada';
    default: return null;
  }
}
