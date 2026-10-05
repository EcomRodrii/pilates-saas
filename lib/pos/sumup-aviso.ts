import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// La `return_url` del aviso de SumUp (`solo.transaction.updated`).
//
// SumUp no firma sus avisos. La URL que le damos al cobrar lleva qué estamos
// cobrando (venta o recibo) y una firma HMAC con un secreto nuestro: eso solo
// sirve para descartar ruido sin gastar llamadas a SumUp. La VERDAD del cobro sale
// siempre de su API (`buscarTransaccion` en sumup.ts), nunca del cuerpo del aviso.
// ─────────────────────────────────────────────────────────────────────────────

/** Qué se está cobrando: una venta de la Caja o un recibo. */
export type ObjetoCobro = { tipo: 'venta' | 'recibo'; id: string };

const objetoATexto = (o: ObjetoCobro) => `${o.tipo}:${o.id}`;

export function firmaAviso(secreto: string, studioId: string, o: ObjetoCobro): string {
  return createHmac('sha256', secreto).update(`${studioId}|${objetoATexto(o)}`).digest('base64url');
}

export function urlDeAviso(base: string, secreto: string, studioId: string, o: ObjetoCobro): string {
  const q = new URLSearchParams({ e: studioId, o: objetoATexto(o), k: firmaAviso(secreto, studioId, o) });
  return `${base.replace(/\/$/, '')}/api/webhooks/sumup?${q.toString()}`;
}

/** Lee y comprueba la `return_url` de un aviso. `null` = no es nuestra o la han tocado. */
export function leerAviso(secreto: string, params: URLSearchParams): { studioId: string; objeto: ObjetoCobro } | null {
  const studioId = params.get('e');
  const o = params.get('o');
  const k = params.get('k');
  if (!secreto || !studioId || !o || !k) return null;
  const m = /^(venta|recibo):([A-Za-z0-9_-]{1,120})$/.exec(o);
  if (!m) return null;
  const objeto: ObjetoCobro = { tipo: m[1] as ObjetoCobro['tipo'], id: m[2] };
  const esperada = Buffer.from(firmaAviso(secreto, studioId, objeto));
  const recibida = Buffer.from(k);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  return { studioId, objeto };
}
