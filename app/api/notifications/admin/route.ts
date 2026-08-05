import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVer, puedeVerCategoriaAvisos } from '@/lib/permisos-reglas';
import { CATEGORIAS_NOTIFICACION } from '@/lib/notifications/types';

// Notification Center (vista admin del estudio): TODAS las notificaciones del
// estudio con su estado de entrega por canal. Datos para la tabla: fecha,
// destinatario, tipo, prioridad, título, canales + resultado + errores.
//
// ⚠️ `verificarSesionStaff` acota al estudio pero acepta a CUALQUIER rol, y esta
// pantalla enseña el título y el cuerpo de cada aviso: una instructora leía así
// los de todas las socias y los de la propietaria. Es el patrón nº1 de las
// auditorías de este repo (RLS bien, hueco de API encima) y el mismo hallazgo
// que #561. Se comprueba el rol con la fuente de verdad que ya usa el menú, y
// además por CATEGORÍA — dejar pasar la ruta entera seguía enseñando a MANAGER
// el dinero que `/cobros` le tiene vedado.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVer(staff.rol, '/notificaciones')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  // El filtro va en la QUERY, no sobre el resultado: con `.limit(150)` aplicado
  // antes de filtrar, un rol sin finanzas recibiría menos de 150 filas útiles y
  // la tabla parecería vacía en un estudio con mucho movimiento de pagos.
  const permitidas = CATEGORIAS_NOTIFICACION.filter(c => puedeVerCategoriaAvisos(staff.rol, c));

  const { data: notis } = await admin.from('notification')
    .select('id, recipient_role, recipient_socio_id, recipient_instructor_id, event_type, category, priority, title, body, created_at, read_at')
    .eq('studio_id', staff.studioId)
    .in('category', permitidas)
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
