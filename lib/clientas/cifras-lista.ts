// ─────────────────────────────────────────────────────────────────────────────
// Las cifras de arriba de la lista de Clientas en el panel nuevo (14-oct-2026).
//
// No hay regla propia: cada cifra sale de la función que ya decide lo mismo en
// otro sitio, para que el número de la tarjeta, el de la fila y el de la
// pantalla a la que lleva no puedan discrepar.
//   · «Nuevas» es la marca `nueva` del estado (`lib/clientas/estado.ts`), la
//     misma que enseña su fila.
//   · «Pagos pendientes» es «Quién me debe» de Cobros (`lib/cobros/deudas.ts`):
//     por cobrar + impagado, con `situacion-recibo.ts` y nunca mirando el
//     `estado` a mano. Lo que está en el banco (EN_CURSO) todavía no es deuda.
//
// Puro (sin `@/`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { ResultadoEstado } from './estado.ts';
import { aCentimos, importeAdeudado, type ReciboParaCifras } from '../billing/situacion-recibo.ts';

/** Cuántas activas son nuevas: su primera compra de verdad fue hace 30 días o menos. */
export function contarActivasNuevas(estados: ReadonlyMap<string, ResultadoEstado>): number {
  let n = 0;
  for (const e of estados.values()) if (e.estado === 'ACTIVA' && e.nueva) n++;
  return n;
}

/**
 * Lo que te deben tus clientas: cuántas y cuánto. Solo las que siguen en tu
 * lista (`existe`): una venta de mostrador sin clienta, o la deuda de una ficha
 * eliminada, sí está en Cobros, pero no es de ninguna clienta de esta pantalla.
 */
export function deudaDeClientas(
  recibos: readonly ReciboParaCifras[],
  existe: (socioId: string) => boolean,
): { clientas: number; importe: number } {
  const deben = new Set<string>();
  let importe = 0;
  for (const r of recibos) {
    if (!r.socioId || !existe(r.socioId)) continue;
    const debe = importeAdeudado(r);
    if (debe <= 0) continue;
    deben.add(r.socioId);
    importe += debe;
  }
  return { clientas: deben.size, importe: aCentimos(importe) };
}
