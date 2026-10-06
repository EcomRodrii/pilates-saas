'use client';

// "Renovar en un toque" (B-1, auditoría 24ª pasada). El servidor ya sabía
// prepararlo (`/api/public/renovar-plan`, `prepararRenovacionPlan` en
// lib/api-client.ts) pero no tenía ningún botón que lo llamara — el hallazgo
// original lo daba por "decisión de producto" (dónde va, qué pasa con
// PUNTUAL, qué ocurre si abandona el checkout). Este fichero conecta ese
// servidor con el flujo YA EXISTENTE de pagar un recibo: el mismo
// `/api/stripe/checkout` que ya usa el panel para "Cobrar online" — sin ruta
// paralela. El importe y el destinatario los resuelve el servidor a partir
// del recibo (auditoría 21/22-ago, C-1), nunca de aquí.
//
// D-3 (mismo informe) cierra el otro lado: si se abandona este checkout sin
// pagar, el cron de renovaciones ya NO adopta el recibo para cobro
// off-session (`checkout_session_id` queda marcado en cuanto se llega aquí).

import { portalAuthHeader, prepararRenovacionPlan } from '@/lib/student/api-publica';

export type ResultadoRenovar =
  | { ok: true; url: string }
  | { ok: false; error: string; codigo?: string };

/** Lo que se le dice a quien tiene la cuota en pausa (decisión del fundador, 5-oct-2026). */
export const CUOTA_EN_PAUSA = 'Tu cuota está en pausa. Habla con tu estudio para reanudarla.';

/**
 * El servidor contesta 409 con `codigo: 'cuota-en-pausa'` cuando lo que se pide renovar o pagar es una cuota en pausa
 * (esa cerradura va en otra rama de dinero). Aquí solo se traduce, para que llegue con las mismas palabras que la
 * tarjeta de Bonos; sin ese código, el mensaje del servidor tal cual.
 */
function mensajeDe(codigo: string | undefined, error: string): string {
  return codigo === 'cuota-en-pausa' ? CUOTA_EN_PAUSA : error;
}

export async function renovarPlan(studioId: string): Promise<ResultadoRenovar> {
  const prep = await prepararRenovacionPlan(studioId);
  if ('error' in prep) return { ok: false, error: mensajeDe(prep.codigo, prep.error), codigo: prep.codigo };

  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      // Pagos España: igual que /reservar/[slug], el checkout hospedado
      // pinta su propio selector tarjeta/Bizum — basta con ofrecerlo.
      // ⚠️ Pero quien decide es el SERVIDOR: si el recibo es de una CUOTA
      // (mensual, trimestral, anual), `/api/stripe/checkout` ignora `bizum` y
      // ofrece solo tarjeta, que queda guardada para la renovación siguiente.
      // Antes aquí se aceptaba que una cuota pagada con Bizum dejara la
      // siguiente sin cobrarse sola (ver lib/billing/bizum-permitido.ts).
      body: JSON.stringify({ studioId, reciboId: prep.reciboId, origen: 'portal', bizum: true }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { url?: string; error?: string; codigo?: string } | null;
    if (!res.ok || !cuerpo?.url) {
      return { ok: false, error: mensajeDe(cuerpo?.codigo, cuerpo?.error ?? 'No se ha podido iniciar el cobro.'), codigo: cuerpo?.codigo };
    }
    return { ok: true, url: cuerpo.url };
  } catch {
    return { ok: false, error: 'No hemos podido conectar. Comprueba tu conexión y vuelve a intentarlo.' };
  }
}

/**
 * Pagar UNA renovación concreta que no se va a cobrar sola (sin tarjeta guardada,
 * `lib/billing/renovacion-sin-tarjeta.ts`). Va directa a su recibo y no pasa por
 * `renovarPlan`: aquel elige la suscripción activa más reciente, y con una cuota
 * y un bono a la vez podía preparar el recibo del otro plan.
 *
 * Con su sesión (`portalAuthHeader`) el checkout sabe que paga ella misma y guarda
 * la tarjeta (`pagadorVerificado`): las próximas renovaciones ya se cobran solas.
 */
export async function pagarRenovacion(studioId: string, reciboId: string): Promise<ResultadoRenovar> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId, reciboId, origen: 'portal' }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { url?: string; error?: string; codigo?: string } | null;
    if (!res.ok || !cuerpo?.url) {
      return { ok: false, error: mensajeDe(cuerpo?.codigo, cuerpo?.error ?? 'No se ha podido iniciar el pago.'), codigo: cuerpo?.codigo };
    }
    return { ok: true, url: cuerpo.url };
  } catch {
    return { ok: false, error: 'No hemos podido conectar. Comprueba tu conexión y vuelve a intentarlo.' };
  }
}
