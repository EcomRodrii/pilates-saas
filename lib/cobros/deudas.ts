// ─────────────────────────────────────────────────────────────────────────────
// «Quién me debe», por clienta (decisión 2 de las maquetas aprobadas el
// 2-oct-2026): una fila por clienta con todo lo que debe, la deuda más antigua
// primero. La cifra sale SIEMPRE de `situacion-recibo.ts`: la suma de los grupos
// es la misma que «Te deben» de arriba (`resumirRecibos`: por cobrar + impagado),
// también con las ventas de mostrador sin clienta y las de clientas eliminadas,
// que van en su propio grupo para que nada se quede fuera de la cuenta.
//
// Lo que está en el banco (EN_CURSO) no es deuda todavía: va aparte.
//
// Puro (sin `@/`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { aCentimos, importeAdeudado, situacionRecibo, type ReciboParaCifras } from '../billing/situacion-recibo.ts';
import { diasEntre, fechaCorta } from '../clientas/textos.ts';

/** Cómo se le enseña cada recibo que se debe. */
export type EstadoVisible = 'DEVUELTO_BANCO' | 'NO_SE_PUDO' | 'SIN_COBRAR';

/** De peor a mejor: el estado de una clienta es el peor de sus recibos. */
export const ORDEN_ESTADOS: readonly EstadoVisible[] = ['DEVUELTO_BANCO', 'NO_SE_PUDO', 'SIN_COBRAR'];

export const TEXTO_ESTADO: Record<EstadoVisible, string> = {
  DEVUELTO_BANCO: 'Devuelto por el banco',
  NO_SE_PUDO: 'No se pudo cobrar',
  SIN_COBRAR: 'Sin cobrar',
};

export interface ReciboDeDeuda extends ReciboParaCifras {
  id: string;
  socioId: string | null;
  fechaVencimiento: string;
  intentosReintento?: number | null;
  fechaDevolucion?: string | null;
}

/**
 * El estado que se enseña de un recibo que se debe, o `null` si no es deuda.
 * Un PENDIENTE con intentos es uno que el cobro ya intentó y no entró: «No se
 * pudo cobrar», aunque siga pendiente de su siguiente intento.
 */
export function estadoVisible(r: ReciboDeDeuda): EstadoVisible | null {
  const s = situacionRecibo(r);
  if (s === 'IMPAGADO') return r.estado === 'DEVUELTO' ? 'DEVUELTO_BANCO' : 'NO_SE_PUDO';
  if (s === 'POR_COBRAR') return (r.intentosReintento ?? 0) > 0 ? 'NO_SE_PUDO' : 'SIN_COBRAR';
  return null;
}

export type TipoGrupo = 'CLIENTA' | 'VENTA_MOSTRADOR' | 'CLIENTA_ELIMINADA';

export interface GrupoDeDeuda<R extends ReciboDeDeuda> {
  /** Estable entre renders: el id de la clienta, o el del grupo especial. */
  clave: string;
  tipo: TipoGrupo;
  socioId: string | null;
  /** Del vencimiento más antiguo al más reciente. */
  recibos: R[];
  total: number;
  /** El vencimiento más antiguo ('YYYY-MM-DD'). */
  desde: string;
  /** El peor estado de sus recibos. */
  peor: EstadoVisible;
}

export const CLAVE_VENTAS_MOSTRADOR = 'venta-mostrador';
export const claveClientaEliminada = (socioId: string) => `eliminada:${socioId}`;

/**
 * Agrupa por clienta lo que se debe. `existeClienta` dice si la clienta del
 * recibo sigue en la lista del estudio: si no, va a «Clienta eliminada» (una por
 * clienta, para no mezclar deudas de personas distintas). Sin clienta, «Venta de
 * mostrador».
 */
export function agruparDeudas<R extends ReciboDeDeuda>(
  recibos: readonly R[],
  existeClienta: (socioId: string) => boolean,
): GrupoDeDeuda<R>[] {
  const porClave = new Map<string, { tipo: TipoGrupo; socioId: string | null; recibos: R[] }>();
  for (const r of recibos) {
    if (!estadoVisible(r)) continue;
    const clave = !r.socioId ? CLAVE_VENTAS_MOSTRADOR : existeClienta(r.socioId) ? r.socioId : claveClientaEliminada(r.socioId);
    const tipo: TipoGrupo = !r.socioId ? 'VENTA_MOSTRADOR' : existeClienta(r.socioId) ? 'CLIENTA' : 'CLIENTA_ELIMINADA';
    const g = porClave.get(clave) ?? { tipo, socioId: r.socioId, recibos: [] };
    g.recibos.push(r);
    porClave.set(clave, g);
  }
  const grupos: GrupoDeDeuda<R>[] = [];
  for (const [clave, g] of porClave) {
    const ordenados = [...g.recibos].sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.id.localeCompare(b.id));
    const estados = new Set(ordenados.map(r => estadoVisible(r)!));
    grupos.push({
      clave, tipo: g.tipo, socioId: g.socioId, recibos: ordenados,
      total: aCentimos(ordenados.reduce((t, r) => t + importeAdeudado(r), 0)),
      desde: ordenados[0].fechaVencimiento,
      peor: ORDEN_ESTADOS.find(e => estados.has(e))!,
    });
  }
  // La deuda más antigua primero; a igual fecha, la mayor.
  return grupos.sort((a, b) => a.desde.localeCompare(b.desde) || b.total - a.total || a.clave.localeCompare(b.clave));
}

/** Días que lleva debiendo (desde el vencimiento más antiguo). 0 si aún no ha vencido. */
export function diasDebiendo(grupo: { desde: string }, hoy: string): number {
  return Math.max(0, diasEntre(grupo.desde, hoy));
}

export type Chip = EstadoVisible | 'SE_REINTENTA_SOLO';

/**
 * Cuántas CLIENTAS (grupos) tienen algún recibo en cada estado. Una clienta con
 * un recibo devuelto y otro sin cobrar cuenta en los dos chips: por eso los
 * chips suman más que el total.
 */
export function contarChips<R extends ReciboDeDeuda>(
  grupos: readonly GrupoDeDeuda<R>[],
  seReintentaSolo: (r: R) => boolean,
): Record<Chip, number> {
  const n: Record<Chip, number> = { DEVUELTO_BANCO: 0, NO_SE_PUDO: 0, SIN_COBRAR: 0, SE_REINTENTA_SOLO: 0 };
  for (const g of grupos) {
    const estados = new Set(g.recibos.map(r => estadoVisible(r)));
    for (const e of ORDEN_ESTADOS) if (estados.has(e)) n[e]++;
    if (g.recibos.some(seReintentaSolo)) n.SE_REINTENTA_SOLO++;
  }
  return n;
}

/** ¿Este grupo sale con este chip activo? */
export function grupoEnChip<R extends ReciboDeDeuda>(g: GrupoDeDeuda<R>, chip: Chip | null, seReintentaSolo: (r: R) => boolean): boolean {
  if (!chip) return true;
  if (chip === 'SE_REINTENTA_SOLO') return g.recibos.some(seReintentaSolo);
  return g.recibos.some(r => estadoVisible(r) === chip);
}

/**
 * Lo que se sabe de un recibo que se debe, en una frase corta: los intentos que
 * no entraron, o cuándo lo devolvió el banco. No dice «con la tarjeta»: los
 * intentos también suben con «Reintentar por el banco».
 */
export function notaDeRecibo(r: ReciboDeDeuda, hoy: string): string | null {
  if (estadoVisible(r) === 'DEVUELTO_BANCO') {
    return r.fechaDevolucion ? `El banco lo devolvió el ${fechaCorta(r.fechaDevolucion.slice(0, 10), hoy)}` : 'Lo devolvió el banco';
  }
  const n = r.intentosReintento ?? 0;
  if (n > 0) return `${n} ${n === 1 ? 'intento' : 'intentos'} sin éxito`;
  return null;
}
