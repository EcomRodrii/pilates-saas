// ─────────────────────────────────────────────────────────────────────────────
// Qué contar cuando se aprueba un cobro con la tarjeta guardada.
//
// Existe porque esto llegó a estar exactamente del revés. El servidor
// (`app/api/stripe/charge-off-session`, `app/api/penalizaciones/aprobar`)
// distingue dos desenlaces cuando Stripe dice que sí:
//
//   200 → el recibo quedó COBRADO, se aplicó la renovación y se selló la
//         factura. Cerrado.
//   202 + `aviso: 'COBRADO_SIN_PERSISTIR'` → el dinero entró en Stripe pero el
//         UPDATE del recibo falló. `cobrarReciboOffSession` sale ANTES de
//         renovar y de facturar, así que no hay ni bono recargado ni factura:
//         hace falta que alguien lo mire.
//
// La UI deducía cuál era cuál llamando a `marcarCobrado` y mirando si había
// tocado alguna fila — y eso da la respuesta invertida, porque en el camino
// bueno el recibo YA está COBRADO (0 filas → parece error) y en el malo sigue
// PENDIENTE (1 fila → parece éxito). Encima el 202 ni siquiera llegaba: entra
// en `res.ok`, así que el cliente lo devolvía como un `{ok:true}` pelado.
//
// Aquí no se toca la base de datos ni se decide nada de negocio: solo se lee lo
// que el servidor ya ha dictaminado. Si algún día hay un tercer desenlace, se
// añade aquí y los dos llamadores lo heredan.
// ─────────────────────────────────────────────────────────────────────────────

export type AvisoCobro = 'COBRADO_SIN_PERSISTIR';

export interface CobroAprobado {
  ok: true;
  /** Presente solo en el 202: cobrado en Stripe, sin quedar escrito. */
  aviso?: AvisoCobro;
  /** Detalle que manda el servidor junto al aviso. */
  detalle?: string;
}

const TEXTO_SIN_PERSISTIR =
  'Cobro ejecutado en Stripe, pero el recibo NO se ha podido marcar como cobrado — compruébalo antes de volver a cobrarlo.';

/**
 * Lee el aviso de una respuesta 2xx del servidor. `null` = cobro cerrado.
 *
 * Tolerante a propósito con la forma del cuerpo: si el servidor cambiara el
 * texto o dejara de mandar `error`, lo que NO puede pasar es que un cobro sin
 * persistir se lea como uno normal.
 */
export function leerAvisoCobro(data: unknown): { aviso: AvisoCobro; detalle: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as { aviso?: unknown; error?: unknown };
  if (d.aviso !== 'COBRADO_SIN_PERSISTIR') return null;
  return {
    aviso: 'COBRADO_SIN_PERSISTIR',
    detalle: typeof d.error === 'string' && d.error ? d.error : TEXTO_SIN_PERSISTIR,
  };
}

/**
 * Qué dejar escrito en el log de la automatización y qué enseñar.
 *
 * `FALLIDO` en el caso sin persistir no es una opinión: es lo que el propio
 * servidor acaba de escribir en `automation_logs` antes de responder 202. Que
 * la pantalla dijera otra cosa era, además de mentira, una divergencia con el
 * registro.
 */
export function resultadoDeCobro(r: CobroAprobado): { resultado: 'EJECUTADO' | 'FALLIDO'; detalle: string } {
  if (r.aviso === 'COBRADO_SIN_PERSISTIR') {
    return { resultado: 'FALLIDO', detalle: r.detalle ?? TEXTO_SIN_PERSISTIR };
  }
  return { resultado: 'EJECUTADO', detalle: 'Cobro aprobado y ejecutado con la tarjeta guardada.' };
}
