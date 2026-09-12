// Los recibos de la alumna, agrupados por mes, y lo que debe.
//
// La pantalla de Pagos pintaba una lista plana. Con cuatro recibos se lee; una
// socia de un año lleva doce o más, todos con el mismo concepto («Mensual
// ilimitado») y el mismo importe, y lo único que los distingue es una fecha de
// 11,5 px. Lo que va a buscar ahí —«¿debo algo?» y «¿me cobraron en marzo?»—
// no se responde sin leer fila por fila.
//
// Dos cosas, las dos derivadas de lo que ya hay: nada pide datos nuevos.

import type { EstadoPago, Pago } from './tipos.ts';

/**
 * Estados en los que el dinero SIGUE debiéndose.
 *
 * ⚠️ `refunded` entra aquí, y es el que se equivoca solo. Sale de
 * `recibos.estado = 'DEVUELTO'`, que el panel llama «Devuelto por el banco»:
 * el cobro se intentó, el banco lo rechazó y el importe sigue pendiente —lo
 * contrario de un reembolso—. Ya se arregló una vez en el texto de la fila
 * (`ESTADO_PAGO` en `PaymentItem`), así que el total tiene que contarlo igual
 * o las dos partes de la misma pantalla dirían cosas distintas.
 *
 * `processing` NO entra: un adeudo saliendo del banco ya está en marcha y la
 * alumna no tiene nada que hacer con él. Sumarlo a «pendiente» le pediría
 * actuar sobre algo que ya actuó.
 */
const DEBE: ReadonlySet<EstadoPago> = new Set<EstadoPago>(['pending', 'failed', 'refunded']);

/**
 * Los recibos que la alumna sigue debiendo.
 *
 * El total y el recuento salen los dos de AQUÍ y no cada uno por su cuenta:
 * en cuanto se derivan por separado, un estado que entra en uno y no en el
 * otro deja la tarjeta diciendo «89 €» sobre «0 recibos sin cobrar».
 */
export function pagosPendientes(pagos: readonly Pago[]): Pago[] {
  return pagos.filter((p) => DEBE.has(p.estado));
}

/** Lo que queda por pagar, en euros. `0` = no debe nada y no se pinta aviso. */
export function totalPendiente(pagos: readonly Pago[]): number {
  return pagosPendientes(pagos).reduce((s, p) => s + p.importe, 0);
}

export interface GrupoPagos {
  /** `2026-08`. Es la clave, no lo que se enseña. */
  clave: string;
  /** «Agosto de 2026», con la inicial en mayúscula. */
  titulo: string;
  pagos: Pago[];
}

/**
 * Agrupa por mes conservando el orden en el que llegan.
 *
 * ⚠️ No reordena nada. `getPagos` ya decide el orden (el más reciente primero)
 * y reordenar aquí sería una segunda fuente de verdad sobre lo mismo: esta
 * función solo mete tabiques donde cambia el mes. Un recibo con fecha
 * ilegible cae en su propio grupo sin título de mes en vez de romper la
 * pantalla — no hay ninguno así en producción, pero `fecha` viene de
 * `fecha_cobro` o `fecha_vencimiento` y cualquiera de los dos puede ser NULL.
 */
export function agruparPorMes(pagos: readonly Pago[]): GrupoPagos[] {
  const grupos: GrupoPagos[] = [];
  for (const p of pagos) {
    const clave = typeof p.fecha === 'string' ? p.fecha.slice(0, 7) : '';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) { ultimo.pagos.push(p); continue; }
    grupos.push({ clave, titulo: tituloDeMes(clave), pagos: [p] });
  }
  return grupos;
}

/**
 * «Agosto de 2026».
 *
 * ⚠️ En castellano el «de» va en minúscula, así que se capitaliza solo la
 * primera letra en JS y no con `text-transform: capitalize` — que pondría
 * «Agosto De 2026». Mismo motivo y misma solución que el encabezado del
 * calendario (`components/student/domain/Calendar.tsx`).
 */
function tituloDeMes(clave: string): string {
  if (!/^\d{4}-\d{2}$/.test(clave)) return '';
  const [a, m] = clave.split('-').map(Number);
  const crudo = new Date(a, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return crudo.charAt(0).toUpperCase() + crudo.slice(1);
}
