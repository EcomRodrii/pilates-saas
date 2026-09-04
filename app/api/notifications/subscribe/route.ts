import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';

// Guarda / elimina la suscripción Web Push del usuario (propietaria/instructora/
// socia; identidad del JWT). Único por endpoint. La usa el canal PUSH del motor.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  const b = (await req.json().catch(() => null)) as
    | { studioId?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; userAgent?: string }
    | null;
  const sub = b?.subscription;
  if (!b?.studioId || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'suscripción incompleta' }, { status: 400 });
  }

  // El `studio_id` iba CRUDO del body con solo el JWT validado: cualquiera con
  // cuenta podía registrar su dispositivo bajo el estudio de otro. Misma
  // comprobación de pertenencia que el endpoint hermano
  // (app/api/notifications/route.ts): socia de ese estudio, o staff con ese
  // estudio activo.
  const esSocia = !!(await socioAutenticado(user.userId, b.studioId));
  if (!esSocia) {
    const staff = await verificarSesionStaff(req);
    if (staff?.studioId !== b.studioId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  const { error } = await admin.from('push_subscription').upsert({
    id: `push-${randomUUID()}`,
    studio_id: b.studioId,
    user_id: user.userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: b.userAgent ?? null,
    failure_count: 0,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) return errorInterno('notifications/subscribe:post', error, 'No se ha podido guardar la suscripción. Inténtalo de nuevo.');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  const b = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!b?.endpoint) return NextResponse.json({ error: 'falta endpoint' }, { status: 400 });
  await admin.from('push_subscription').delete().eq('endpoint', b.endpoint).eq('user_id', user.userId);
  return NextResponse.json({ ok: true });
}
