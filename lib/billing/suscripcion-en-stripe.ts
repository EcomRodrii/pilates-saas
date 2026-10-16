import 'server-only';
import Stripe from 'stripe';
// Rutas relativas: lo importan módulos que también se cargan en `node --test`.
import { ESTADOS_VIVOS } from './checkout-saas-previo.ts';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Paga en Stripe aunque la base diga otra cosa? Un webhook perdido deja la fila
// atrasada mientras Stripe ya cobra (pasó el 18-21 de agosto). Lo preguntan
// quien pasa un estudio al plan gratis (convertir-a-gratis.ts) y el ciclo de
// baja antes de cada aviso o purga (avanzar-ciclo-estudios-vencidos.ts): en los
// dos, ante una suscripción viva o un Stripe que no contesta, no se toca nada.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lo que frena un aviso de baja o una purga: lo vivo y, además, un primer pago a
 * medio confirmar (3DS, SEPA). Pagar desde el plan gratis cerrado pasa justo por ahí.
 */
export const ESTADOS_QUE_FRENAN_LA_BAJA: readonly string[] = [...ESTADOS_VIVOS, 'incomplete'];

/** La cuenta de PLATAFORMA (las suscripciones SaaS). `null` sin una clave configurada. */
export function stripePlataforma(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return null;
  return new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
}

/**
 * De quién tiene que ser la suscripción para contar. Sin esto, cuenta cualquiera
 * del cliente. Con esto, solo la del estudio (`metadata.studioId`), la de su
 * cadena (`metadata.cadenaId`) o una sin esa metadata (no se sabe de quién es:
 * ante la duda, cuenta). Así, una sede que comparte cliente con otra que paga su
 * plan suelto (las cadenas migradas en la 0066) no se queda frenada por un pago
 * que no es suyo.
 */
export interface DeQuien { studioId: string; cadenaId: string | null }

function esDe(metadata: Stripe.Metadata | null | undefined, deQuien: DeQuien | undefined): boolean {
  if (!deQuien) return true;
  const estudio = metadata?.studioId || null;
  const cadena = metadata?.cadenaId || null;
  if (!estudio && !cadena) return true;
  return estudio === deQuien.studioId || (!!cadena && cadena === deQuien.cadenaId);
}

/**
 * La primera suscripción de estos clientes en uno de `estados` (y, con `deQuien`,
 * de ese estudio o su cadena), o `null` si no hay ninguna. Lanza si Stripe no
 * contesta: quien llama lo trata como «no sé», que nunca es «no paga».
 */
export async function suscripcionEnStripe(
  stripe: Pick<Stripe, 'subscriptions'>,
  clientes: readonly string[],
  estados: readonly string[],
  deQuien?: DeQuien,
): Promise<{ id: string; status: string } | null> {
  for (const cliente of clientes) {
    // Hasta 100: con pocas, unos cuantos 3DS abandonados podían esconder una viva más antigua.
    const { data } = await stripe.subscriptions.list({ customer: cliente, status: 'all', limit: 100 });
    const viva = data.find(s => estados.includes(s.status) && esDe(s.metadata, deQuien));
    if (viva) return { id: viva.id, status: viva.status };
  }
  return null;
}
