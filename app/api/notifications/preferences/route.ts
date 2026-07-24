import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Preferencias de notificación por usuario y categoría (qué quiere recibir y por
// qué canal). Ausencia de fila = valores por defecto (in-app + push ON). Cada
// usuario gestiona SOLO las suyas (acotado por user_id del JWT).

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ prefs: {} });

  const { data } = await admin.from('notification_preference')
    .select('category, inapp, push, email, whatsapp, sms').eq('user_id', user.userId);
  const prefs: Record<string, unknown> = {};
  for (const r of data ?? []) {
    prefs[r.category as string] = { inapp: r.inapp, push: r.push, email: r.email, whatsapp: r.whatsapp, sms: r.sms };
  }
  return NextResponse.json({ prefs });
}

export async function PUT(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  const b = (await req.json().catch(() => null)) as
    | { studioId?: string; category?: string; inapp?: boolean; push?: boolean; email?: boolean; whatsapp?: boolean; sms?: boolean }
    | null;
  if (!b?.studioId || !b?.category) return NextResponse.json({ error: 'faltan datos' }, { status: 400 });

  const { error } = await admin.from('notification_preference').upsert({
    id: `pref-${user.userId}-${b.category}`,
    studio_id: b.studioId,
    user_id: user.userId,
    category: b.category,
    inapp: b.inapp ?? true,
    push: b.push ?? true,
    email: b.email ?? false,
    whatsapp: b.whatsapp ?? false,
    sms: b.sms ?? false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,category' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
