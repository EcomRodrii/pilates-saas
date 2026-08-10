import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { filtroDeAmbito, ambitoDeCompatibilidad, parsearAmbito, type FiltroAmbito } from '@/lib/notifications/ambito';

// Centro de notificaciones (in-app) de CUALQUIER usuario autenticado —
// propietaria, instructora o socia (mismo endpoint; identidad del JWT). Se valida
// el token y se acota SIEMPRE por recipient_user_id: nadie ve ni toca lo de otro.
//
// Además del destinatario, se acota por ÁMBITO (`lib/notifications/ambito.ts`):
// una misma persona puede ser staff y socia con la MISMA cuenta, y sin esto el
// portal le enseñaba los avisos de su panel —incluido el mensaje del Umbral— y
// el "marcar todo leído" de la bandeja de socia se los borraba de la campana
// del panel.

export const dynamic = 'force-dynamic';

const COLS = 'id, title, body, deep_link, category, priority, event_type, resource_type, resource_id, read_at, created_at, studio_id';

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id, title: r.title, body: r.body, deepLink: r.deep_link ?? null,
    category: r.category, priority: r.priority, eventType: r.event_type,
    resourceType: r.resource_type ?? null, resourceId: r.resource_id ?? null,
    readAt: r.read_at ?? null, createdAt: r.created_at,
    // El ámbito `staff` deja `studio_id` sin acotar A PROPÓSITO (ver
    // lib/notifications/ambito.ts): una propietaria de varias sedes ve en la
    // misma campana los avisos de todas. Sin esto, la campana no da ninguna
    // pista de a qué sede pertenece cada aviso — el cliente lo usa para
    // etiquetarlo cuando `misEstudios.length > 1` (notification-bell.tsx).
    studioId: r.studio_id ?? null,
  };
}

// Una vez por proceso, no por petición: el reintento del contador dispara en
// cada `visibilitychange` y una PWA vieja llenaría el log ella sola.
let avisadoSinAmbito = false;

// Resuelve el ámbito de la petición. Si no viene (pestaña de la PWA resumida
// desde bfcache con el bundle anterior), se deriva de si hay sesión de staff —
// el porqué de no fallar cerrado está en `ambitoDeCompatibilidad`.
//
// Devuelve `'no-es-socia'` si se pide ámbito de socia de un estudio del que no
// se es socia: se VALIDA la pertenencia en vez de confiar en que el studioId
// solo puede estrechar. Ese razonamiento es correcto hoy, pero caduca solo —
// `notification_select` ya declara legítimo el `OR studio_id =
// current_studio_id()` y `recipient_user_id` es NULLABLE, así que el día que
// alguien añada "avisos del estudio" con un `.or(...)`, el studioId del cliente
// pasaría de estrechar a CONCEDER. El endpoint hermano de preferencias ya se
// escribe el `studio_id` del body crudo, o sea que la invariante ya se rompió
// una vez al lado. Una consulta indexada, y de paso obliga a mandar el estudio.
async function resolverFiltro(
  req: NextRequest, userId: string, ambitoCrudo: unknown, studioId: string | null,
): Promise<FiltroAmbito | 'falta-studio' | 'no-es-socia'> {
  const ambito = parsearAmbito(ambitoCrudo);

  if (ambito === 'socia') {
    if (!studioId) return 'falta-studio';
    if (!(await socioAutenticado(userId, studioId))) return 'no-es-socia';
    return filtroDeAmbito('socia', studioId);
  }
  if (ambito === 'staff') return filtroDeAmbito('staff', null);

  if (!avisadoSinAmbito) {
    avisadoSinAmbito = true;
    console.warn('[notifications] petición sin `ambito` (cliente anterior al scoping por rol/estudio)');
  }
  const staff = await verificarSesionStaff(req);
  // Sin ámbito no se exige studioId: es justo lo que un cliente viejo no manda.
  return filtroDeAmbito(ambitoDeCompatibilidad(!!staff), null);
}

export async function GET(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [], unread: 0 });

  const filtro = await resolverFiltro(
    req,
    user.userId,
    req.nextUrl.searchParams.get('ambito'),
    req.nextUrl.searchParams.get('studioId'),
  );
  // Bandeja vacía, no 400: el cliente convierte cualquier !res.ok en "0 sin
  // leer", así que un error aquí se leería como "estás al día". Vacío es lo
  // honesto — y es además lo correcto, porque quien no es socia de ese estudio
  // no tiene ahí ninguna notificación.
  if (typeof filtro === 'string') return NextResponse.json({ items: [], unread: 0 });

  let q = admin.from('notification').select(COLS)
    .eq('recipient_user_id', user.userId)
    .is('archived_at', null);
  if (filtro.studioId) q = q.eq('studio_id', filtro.studioId);
  if (filtro.rolIgual) q = q.eq('recipient_role', filtro.rolIgual);
  if (filtro.rolDistinto) q = q.neq('recipient_role', filtro.rolDistinto);

  const { data } = await q
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

  const body = (await req.json().catch(() => null)) as {
    action?: string; id?: string; ambito?: string; studioId?: string;
  } | null;
  const action = body?.action;
  const id = body?.id;
  const now = new Date().toISOString();

  const filtro = await resolverFiltro(req, user.userId, body?.ambito, body?.studioId ?? null);
  // Aquí sí 400: una escritura que no se puede acotar no debe hacerse a medias,
  // y a diferencia del GET no hay ninguna respuesta "vacía" que sea honesta.
  if (typeof filtro === 'string') {
    return NextResponse.json({ error: 'ámbito no válido para esta cuenta' }, { status: 400 });
  }

  // El ámbito se aplica también a las acciones con `id`, no solo a `read-all`:
  // ahí no es lo que arregla el bug, pero impide que una superficie toque una
  // fila de la otra por id (deep link viejo, item cacheado) apoyándose en que
  // "es suya". Toda escritura sigue acotada por recipient_user_id.
  const enAmbito = (cambio: Record<string, string | null>) => {
    let u = admin.from('notification').update(cambio).eq('recipient_user_id', user.userId);
    if (filtro.studioId) u = u.eq('studio_id', filtro.studioId);
    if (filtro.rolIgual) u = u.eq('recipient_role', filtro.rolIgual);
    if (filtro.rolDistinto) u = u.neq('recipient_role', filtro.rolDistinto);
    return u;
  };

  if (action === 'read' && id) {
    await enAmbito({ read_at: now }).eq('id', id).is('read_at', null);
  } else if (action === 'unread' && id) {
    await enAmbito({ read_at: null }).eq('id', id);
  } else if (action === 'read-all') {
    await enAmbito({ read_at: now }).is('read_at', null);
  } else if (action === 'archive' && id) {
    await enAmbito({ archived_at: now }).eq('id', id);
  } else {
    return NextResponse.json({ error: 'acción no válida' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
