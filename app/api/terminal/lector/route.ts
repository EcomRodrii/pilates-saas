import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { dbSetTerminalReader } from '@/lib/supabase-data';

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Terminal (datáfono físico, integración SERVER-DRIVEN) — emparejar el
// lector con el estudio. Todo ocurre sobre la cuenta CONNECT del estudio.
//
// GET  → estado actual (¿hay lector emparejado? ¿online?).
// POST → registrar un lector:
//        · test  (sk_test…): crea un lector SIMULADO (no hace falta hardware).
//        · real  (sk_live…): registra el WisePOS E con su registrationCode
//          (el código de 3 palabras que muestra la pantalla del datáfono).
//
// ⚠️ En España la integración server-driven de Terminal está en BETA: hay que
// pedir a Stripe que la active en la cuenta antes de usarla en real.
// ─────────────────────────────────────────────────────────────────────────────

function getStripe(): { stripe: Stripe; test: boolean } | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith('sk_test_XXXX')) return null;
  return { stripe: new Stripe(key, { apiVersion: '2026-06-24.dahlia' }), test: key.startsWith('sk_test') };
}

async function studioConnect(studioId: string): Promise<{ account: string | null; readerId: string | null; locationId: string | null } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('studios')
    .select('stripe_account_id, stripe_terminal_reader_id, stripe_terminal_location_id')
    .eq('id', studioId).maybeSingle();
  if (!data) return null;
  return { account: data.stripe_account_id ?? null, readerId: data.stripe_terminal_reader_id ?? null, locationId: data.stripe_terminal_location_id ?? null };
}

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const s = getStripe();
  if (!s) return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });
  const cx = await studioConnect(sesion.studioId);
  if (!cx?.account) return NextResponse.json({ error: 'El estudio no tiene Stripe conectado' }, { status: 409 });
  if (!cx.readerId) return NextResponse.json({ ok: true, emparejado: false });
  try {
    const reader = await s.stripe.terminal.readers.retrieve(cx.readerId, {}, { stripeAccount: cx.account }) as Stripe.Terminal.Reader;
    return NextResponse.json({ ok: true, emparejado: true, estado: reader.status, etiqueta: reader.label, test: s.test });
  } catch {
    return NextResponse.json({ ok: true, emparejado: false, aviso: 'El lector guardado ya no existe en Stripe' });
  }
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const s = getStripe();
  if (!s) return NextResponse.json({ error: 'Stripe no configurado' }, { status: 503 });

  const cx = await studioConnect(sesion.studioId);
  if (!cx?.account) return NextResponse.json({ error: 'El estudio no tiene Stripe conectado' }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { registrationCode?: string; nombreLocal?: string };
  const stripeAccount = cx.account;

  try {
    // 1) Location (obligatoria para registrar lectores). Reutiliza la guardada.
    let locationId = cx.locationId;
    if (!locationId) {
      const loc = await s.stripe.terminal.locations.create({
        display_name: body.nombreLocal || 'Mostrador',
        address: { country: 'ES', line1: 'Mostrador', city: 'Madrid', postal_code: '28001' },
      }, { stripeAccount });
      locationId = loc.id;
    }

    // 2) Registrar el lector. En test, código mágico del lector simulado.
    const registrationCode = s.test ? 'simulated-wpe' : (body.registrationCode || '').trim();
    if (!registrationCode) {
      return NextResponse.json({ error: 'Falta el código de emparejamiento del datáfono' }, { status: 400 });
    }
    const reader = await s.stripe.terminal.readers.create({
      registration_code: registrationCode,
      location: locationId,
      label: s.test ? 'Datáfono simulado' : 'Datáfono mostrador',
    }, { stripeAccount });

    await dbSetTerminalReader(sesion.studioId, reader.id, locationId);
    return NextResponse.json({ ok: true, readerId: reader.id, estado: reader.status, test: s.test });
  } catch (err) {
    console.error('[terminal/lector]', err instanceof Stripe.errors.StripeError ? err.message : err);
    return NextResponse.json({ error: 'No se pudo registrar el datáfono' }, { status: 400 });
  }
}
