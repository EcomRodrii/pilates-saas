import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeVerCentroNotificaciones } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { retry } from '@/lib/notifications/process';

// Notification Center (vista admin del estudio): TODAS las notificaciones del
// estudio con su estado de entrega por canal. Datos para la tabla: fecha,
// destinatario, tipo, prioridad, título, canales + resultado + errores.
//
// Antes bastaba con `verificarSesionStaff` y NO se comprobaba el rol: cualquier
// staff con token válido —la instructora incluida— se llevaba las 150 últimas
// filas con `title` y `body` completos, o sea los avisos de la propietaria y de
// todas las socias del estudio. Es el patrón "rol no comprobado en servidor",
// el bug más repetido de las auditorías de este repo. Estar fuera del menú no
// protegía nada: la ruta se llama con curl.
//
// La consulta va con service-role, así que la RLS de `notification` no opina
// aquí — este `if` es la única cerradura de este camino, no una barrera de UI.
// El criterio de quién entra (y por qué solo la propietaria) vive en
// `puedeVerCentroNotificaciones`.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerCentroNotificaciones(staff.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede ver el centro de notificaciones' }, { status: 403 });
  }
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

// Reintentar los deliveries FAILED de una notificación (botón "Reintentar" del
// Notification Center). Antes `retry()` existía pero sin un solo llamador —
// ninguna entrega fallida se reintentaba nunca (auditoría 23ª pasada).
export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerCentroNotificaciones(staff.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede reintentar notificaciones' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const notificationId = typeof body?.notificationId === 'string' ? body.notificationId : null;
  if (!notificationId) return NextResponse.json({ error: 'Falta notificationId' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Acota SIEMPRE al estudio de la sesión: notificationId lo manda el
  // cliente, y sin este filtro cualquier PROPIETARIO podría disparar un
  // reintento (y su email/push real) sobre la notificación de OTRO estudio.
  const { data: noti } = await admin.from('notification').select('id').eq('id', notificationId).eq('studio_id', staff.studioId).maybeSingle();
  if (!noti) return NextResponse.json({ error: 'Notificación no encontrada' }, { status: 404 });

  const resultado = await retry(admin, notificationId);
  return NextResponse.json(resultado);
}
