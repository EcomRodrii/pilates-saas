import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Centro de notificaciones (in-app) de CUALQUIER usuario autenticado —
// propietaria, instructora o socia (mismo endpoint; identidad del JWT). Se valida
// el token y se acota SIEMPRE por recipient_user_id: nadie ve ni toca lo de otro.

export const dynamic = 'force-dynamic';

const COLS = 'id, title, body, deep_link, category, priority, event_type, resource_type, resource_id, read_at, created_at';

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id, title: r.title, body: r.body, deepLink: r.deep_link ?? null,
    category: r.category, priority: r.priority, eventType: r.event_type,
    resourceType: r.resource_type ?? null, resourceId: r.resource_id ?? null,
    readAt: r.read_at ?? null, createdAt: r.created_at,
  };
}

export async function GET(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [], unread: 0 });

  const { data } = await admin.from('notification').select(COLS)
    .eq('recipient_user_id', user.userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(60);
  const items = (data ?? []).map(mapRow);
  const unread = items.filter(i => i.readAt == null).length;
  return NextResponse.json({ items, unread });
}

export async function PATCH(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  const body = (await req.json().catch(() => null)) as { action?: string; id?: string } | null;
  const action = body?.action;
  const id = body?.id;
  const now = new Date().toISOString();

  // Toda escritura acotada por recipient_user_id: defensa en profundidad.
  if (action === 'read' && id) {
    await admin.from('notification').update({ read_at: now }).eq('id', id).eq('recipient_user_id', user.userId).is('read_at', null);
  } else if (action === 'unread' && id) {
    await admin.from('notification').update({ read_at: null }).eq('id', id).eq('recipient_user_id', user.userId);
  } else if (action === 'read-all') {
    await admin.from('notification').update({ read_at: now }).eq('recipient_user_id', user.userId).is('read_at', null);
  } else if (action === 'archive' && id) {
    await admin.from('notification').update({ archived_at: now }).eq('id', id).eq('recipient_user_id', user.userId);
  } else {
    return NextResponse.json({ error: 'acción no válida' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
