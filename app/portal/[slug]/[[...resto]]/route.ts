import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

// ⚠️ Esto NO es el portal de la alumna. El portal se borró entero (etiqueta
// `portal-v1` si hiciera falta mirarlo). Esto es la red que impide que las
// URLs que YA están sueltas por ahí acaben en un 404.
//
// Hay 47 enlaces vivos a `/portal/<slug>/…` fuera del portal, y no son
// decorativos:
//   · `lib/billing/origen-pago.ts` — a dónde vuelve Stripe DESPUÉS de cobrar.
//   · `app/api/stripe/setup-tarjeta` y `setup-sepa` — el retorno al guardar
//     un método de pago.
//   · `lib/emails/enviar-recibo-webhook.ts` — el enlace del recibo.
//   · `lib/notifications/catalog.ts` — los deep links de cada aviso push.
// Sin esta redirección, una clienta que acaba de pagar cae en una página que
// no existe con el cargo ya hecho.
//
// Se manda a `/reservar/<slug>`, que sigue vivo y es donde puede reservar y
// comprar. Es una parada provisional, no un destino: cuando haya app nueva,
// esto se sustituye por sus rutas o se borra si los 47 enlaces se reescriben.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/reservar/${encodeURIComponent(slug)}`);
}
