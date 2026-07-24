import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Notification Center (vista admin del estudio): TODAS las notificaciones del
// estudio con su estado de entrega por canal. Solo staff (verificarSesionStaff
// acota al estudio de la sesión). Datos para la tabla: fecha, destinatario, tipo,
// prioridad, título, canales + resultado + errores.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  const { data: notis } = await admin.from('notification')
    .select('id, recipient_role, recipient_socio_id, recipient_instructor_id, event_type, category, priority, title, body, created_at, read_at')
    .eq('studio_id', staff.studioId)
    .order('created_at', { ascending: false })
    .limit(150);

  const ids = (notis ?? []).map(n => n.id as string);
  const porNoti = new Map<string, { channel: string; status: string; error: string | null }[]>();
  if (ids.length) {
    const { data: dels } = await admin.from('notification_delivery')
      .select('notification_id, channel, status, error').in('notification_id', ids);
    for (const d of dels ?? []) {
      const arr = porNoti.get(d.notification_id as string) ?? [];
      arr.push({ channel: d.channel as string, status: d.status as string, error: (d.error as string | null) ?? null });
      porNoti.set(d.notification_id as string, arr);
    }
  }

  const items = (notis ?? []).map(n => ({
    id: n.id, recipientRole: n.recipient_role, eventType: n.event_type, category: n.category,
    priority: n.priority, title: n.title, body: n.body, createdAt: n.created_at, readAt: n.read_at ?? null,
    deliveries: porNoti.get(n.id as string) ?? [],
  }));
  return NextResponse.json({ items });
}
