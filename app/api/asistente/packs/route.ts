import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { asistenteEncendido } from '@/lib/asistente/servidor';
import { packPorUnidades, puedeComprarPacks } from '@/lib/asistente/packs';
import { crearCheckoutPack, type DesdeCompra } from '@/lib/asistente/packs-servidor';

// POST /api/asistente/packs — abre el Checkout de Stripe de un pack de
// consultas (100 · 9 €, 300 · 24 €, 1.000 · 69 €; IVA incluido). Pago ÚNICO en
// la cuenta de PLATAFORMA, como la suscripción SaaS. Devuelve `{ url }`.
//
// Solo la PROPIETARIA: la gerente usa el asistente pero no mueve dinero, y se
// le dice que se lo pida a ella. El estudio sale SOLO de la sesión.
//
// Esto NO crea el pack: lo crea el webhook de la plataforma cuando Stripe
// confirma el pago (lib/asistente/packs-libro.ts). Cero escritura optimista.
export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'asistente-packs', { max: 10, windowSeconds: 60 });
  if (limitado) return limitado;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) {
    return NextResponse.json({ error: 'Los pagos no están disponibles ahora mismo.', codigo: 'SIN_STRIPE' }, { status: 503 });
  }
  // Una vía más por la que entra dinero: el mismo guardia que el resto
  // (lib/billing/modo-stripe.ts). Con el `.env.local` de producción copiado a
  // una máquina, esto abriría un cobro real.
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) return NextResponse.json({ error: modo.motivo, codigo: 'MODO_STRIPE' }, { status: 503 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeComprarPacks(sesion.rol)) {
    return NextResponse.json({
      error: puedeUsarAsistente(sesion.rol)
        ? 'Solo la propietaria puede comprar consultas. Pídeselo a ella.'
        : 'No tienes permiso para esto',
      codigo: 'SOLO_PROPIETARIA',
    }, { status: 403 });
  }
  if (!asistenteEncendido(sesion.studioId)) {
    return NextResponse.json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, { status: 404 });
  }
  // Sin plan que incluya el asistente (prueba agotada, suscripción cancelada), no se venden consultas.
  const bloqueo = await bloqueoPorFeature(sesion.studioId, 'asistente');
  if (bloqueo) return bloqueo;

  const body = await req.json().catch(() => null) as { unidades?: unknown; desde?: unknown } | null;
  const pack = packPorUnidades(body?.unidades);
  if (!pack) return NextResponse.json({ error: 'Ese pack no existe', codigo: 'PACK' }, { status: 400 });
  const desde: DesdeCompra = body?.desde === 'asistente' ? 'asistente' : 'suscripcion';

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  try {
    const r = await crearCheckoutPack({ admin, stripe, studioId: sesion.studioId, pack, desde, appUrl });
    if ('error' in r) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
    return NextResponse.json({ url: r.url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('asistente/packs:POST', err, 'No se pudo abrir el pago. Inténtalo de nuevo en un momento: no se ha cobrado nada.');
  }
}
