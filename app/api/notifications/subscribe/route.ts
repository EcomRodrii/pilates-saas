import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { endpointApns, endpointWebPushValido } from '@/lib/notifications/apns-endpoint';
import { BUNDLE_TENTARE } from '@/lib/app-nativa/app-estudio';
import { estudioDeLaApp } from '@/lib/app-nativa/app-de-cadena';

// Guarda / elimina la suscripción Web Push del usuario (propietaria/instructora/
// socia; identidad del JWT). Único por endpoint. La usa el canal PUSH del motor.
// Desde la app de iOS llega `nativo` en vez de `subscription`: el token de APNs
// se guarda en esta misma tabla como `apns://<bundleId>/<token>` (lib/notifications/apns.ts).

export const dynamic = 'force-dynamic';

const SUSCRIPCION_ABANDONADA_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });

  const b = (await req.json().catch(() => null)) as
    | {
      studioId?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; userAgent?: string;
      nativo?: { plataforma?: string; token?: string; bundleId?: string };
    }
    | null;
  // Del iPhone: un token, sin claves de cifrado (APNs no las usa). El bundle, siempre en minúsculas:
  // es como se guarda en `apps_estudio` y como se compara al enviar.
  const bundleNativo = typeof b?.nativo?.bundleId === 'string' ? b.nativo.bundleId.toLowerCase() : null;
  const endpointNativo = b?.nativo
    ? (b.nativo.plataforma === 'ios' && b.nativo.token && bundleNativo ? endpointApns(bundleNativo, b.nativo.token) : null)
    : undefined;
  if (endpointNativo === null) return NextResponse.json({ error: 'token de la app incompleto' }, { status: 400 });
  const sub = endpointNativo
    ? { endpoint: endpointNativo, keys: { p256dh: '', auth: '' } }
    : b?.subscription;
  if (!b?.studioId || !sub?.endpoint || (!endpointNativo && (!sub.keys?.p256dh || !sub.keys?.auth))) {
    return NextResponse.json({ error: 'suscripción incompleta' }, { status: 400 });
  }
  // Por la vía web solo una dirección de un servicio de push de verdad (nunca un `apns://`, que
  // se saltaría la comprobación del bundle de abajo).
  if (!endpointNativo && !endpointWebPushValido(sub.endpoint)) {
    return NextResponse.json({ error: 'suscripción no válida' }, { status: 400 });
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

  // Un token de la app de un ESTUDIO solo se guarda bajo ese estudio: el bundle id
  // tiene que ser el de una app activa de este `studio_id`. Es integridad del dato, no
  // el límite de seguridad (ese es la pertenencia de arriba): un bundle inventado solo
  // daría un token que Apple rechaza. La app «Tentare» sirve a cualquier estudio.
  // En una cadena la app es UNA (su fila va con la sede principal) y vale para todas sus sedes.
  if (endpointNativo && bundleNativo && bundleNativo !== BUNDLE_TENTARE) {
    let duenaId: string;
    try { duenaId = (await estudioDeLaApp(admin, b.studioId)).studioId; }
    catch (e) { return errorInterno('notifications/subscribe:cadena', e, 'No se ha podido guardar la suscripción. Inténtalo de nuevo.'); }
    const { data: app, error: errApp } = await admin.from('apps_estudio').select('studio_id')
      .eq('bundle_id', bundleNativo).eq('studio_id', duenaId).eq('activa', true).maybeSingle();
    if (errApp) return errorInterno('notifications/subscribe:app', errApp, 'No se ha podido guardar la suscripción. Inténtalo de nuevo.');
    if (!app) return NextResponse.json({ error: 'Esa app no es de este estudio' }, { status: 403 });
  }

  const { error } = await admin.from('push_subscription').upsert({
    id: `push-${randomUUID()}`,
    studio_id: b.studioId,
    user_id: user.userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys?.p256dh ?? '',
    auth: sub.keys?.auth ?? '',
    user_agent: b.userAgent ?? null,
    failure_count: 0,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) return errorInterno('notifications/subscribe:post', error, 'No se ha podido guardar la suscripción. Inténtalo de nuevo.');

  // Las suscripciones viejas del MISMO dispositivo (misma cuenta, estudio y
  // navegador) que nadie ha confirmado en una semana se retiran: el servicio
  // de push puede seguir aceptándolas sin entregar nada, y el motor diría
  // «enviado» a un móvil que no recibe (pasó en producción, 21-sep). La app
  // confirma la suya cada día al abrirse (`renovarSuscripcionPush`), así que
  // una que lleva 7 días sin confirmarse ya no es de una instalación viva.
  // Best-effort: si falla, la suscripción nueva ya está guardada.
  if (b.userAgent) {
    const haceUnaSemana = new Date(Date.now() - SUSCRIPCION_ABANDONADA_MS).toISOString();
    await admin.from('push_subscription').delete()
      .eq('user_id', user.userId).eq('studio_id', b.studioId).eq('user_agent', b.userAgent)
      .neq('endpoint', sub.endpoint).lt('last_used_at', haceUnaSemana);
  }
  return NextResponse.json({ ok: true, endpoint: sub.endpoint });
}

// ¿Sigue registrado en el servidor ESTE dispositivo? El navegador puede seguir
// suscrito (permiso concedido, PushSubscription viva) mientras el servidor ya no
// tiene la fila: se retiró por caducada, falló el POST de renovación, la borró
// otra sesión. La pantalla decía «activados» y no llegaba nada. Solo responde
// por la suscripción de QUIEN PREGUNTA (identidad del JWT).
export async function GET(req: NextRequest) {
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'sin service-role' }, { status: 500 });
  const endpoint = req.nextUrl.searchParams.get('endpoint');
  if (!endpoint) return NextResponse.json({ error: 'falta endpoint' }, { status: 400 });
  const { data, error } = await admin.from('push_subscription')
    .select('id, created_at').eq('user_id', user.userId).eq('endpoint', endpoint).maybeSingle();
  if (error) return errorInterno('notifications/subscribe:get', error, 'No se ha podido comprobar la suscripción.');
  return NextResponse.json({ registrada: !!data, desde: (data?.created_at as string | undefined) ?? null });
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
