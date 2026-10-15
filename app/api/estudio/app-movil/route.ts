import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { pedirAppEncendido } from '@/lib/interruptor-por-estudio';
import { tieneFeature } from '@/lib/billing/entitlements';
import { bundleDeSlug, esEstadoApp, nombreSugerido, validarNombreApp, type AppDelEstudio } from '@/lib/app-nativa/pedir-app';

export const dynamic = 'force-dynamic';

// «Pedir mi app» (Apariencia de tu app): la app de la App Store con el nombre y el icono del
// estudio. GET dice en qué punto está; POST la pide.
//
// · Solo con `APP_PROPIA_PEDIR` encendido para el estudio (si no, 404: ni existe).
// · Pedirla es de la propietaria, y solo con un plan que la incluye
//   (`tieneFeature(studio, 'appPropia')`, EN EL SERVIDOR: la pantalla solo lo repite).
// · Corre con service-role: `apps_estudio` está cerrada al navegador. El estudio sale SIEMPRE de
//   la sesión, nunca del body; la pantalla manda el que tiene delante (`?estudio=`) y si la sesión
//   ya está en otra sede, 409 (mismo criterio que `interruptoresPara`).
// · Nace `PEDIDA` y SIN activar: lo que cambia qué abre la app y los enlaces universales
//   (`activa`) solo lo mueve quien tramita, desde /interno.
// · Al estudio nunca se le devuelve la nota interna.

type FilaApp = { bundle_id: string; nombre_app: string; estado: string; url_tienda: string | null; pedida_en: string | null };

const aApp = (f: FilaApp | null): AppDelEstudio | null => f && esEstadoApp(f.estado)
  ? { estado: f.estado, nombreApp: f.nombre_app, bundleId: f.bundle_id, urlTienda: f.url_tienda, pedidaEn: f.pedida_en }
  : null;

async function contexto(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (!pedirAppEncendido(sesion.studioId)) return { error: NextResponse.json({ error: 'No disponible' }, { status: 404 }) };
  if (req.nextUrl.searchParams.get('estudio') !== sesion.studioId) {
    return { error: NextResponse.json({ error: 'Has cambiado de sede en otra pestaña: recarga la página.' }, { status: 409 }) };
  }
  const limitado = await enforceRateLimit(req, 'estudio-app-movil', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limitado) return { error: limitado };
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) };
  return { sesion, admin };
}

export async function GET(req: NextRequest) {
  const c = await contexto(req);
  if ('error' in c) return c.error;
  const { sesion, admin } = c;
  try {
    const [estudio, app] = await Promise.all([
      admin.from('studios').select('nombre, slug, plan, subscription_status').eq('id', sesion.studioId).maybeSingle(),
      admin.from('apps_estudio').select('bundle_id, nombre_app, estado, url_tienda, pedida_en').eq('studio_id', sesion.studioId).maybeSingle(),
    ]);
    if (estudio.error || app.error) throw estudio.error ?? app.error;
    if (!estudio.data) return NextResponse.json({ error: 'No encontramos tu estudio' }, { status: 404 });
    const incluida = tieneFeature({ plan: estudio.data.plan as string | null, subscriptionStatus: estudio.data.subscription_status as string | null }, 'appPropia');
    return NextResponse.json({
      planIncluye: incluida,
      esPropietaria: sesion.rol === 'PROPIETARIO',
      nombreSugerido: nombreSugerido((estudio.data.nombre as string | null) ?? (estudio.data.slug as string | null) ?? ''),
      app: aApp(app.data as FilaApp | null),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('[estudio/app-movil] leer', err);
  }
}

export async function POST(req: NextRequest) {
  const c = await contexto(req);
  if ('error' in c) return c.error;
  const { sesion, admin } = c;
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'Solo la propietaria puede pedir la app.' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Formato no válido' }, { status: 400 }); }
  const nombre = validarNombreApp((body as { nombreApp?: unknown } | null)?.nombreApp);
  if (!nombre.ok) return NextResponse.json({ error: nombre.error }, { status: 400 });

  try {
    const { data: estudio, error: errEstudio } = await admin.from('studios')
      .select('slug, plan, subscription_status').eq('id', sesion.studioId).maybeSingle();
    if (errEstudio) throw errEstudio;
    if (!estudio) return NextResponse.json({ error: 'No encontramos tu estudio' }, { status: 404 });
    // La puerta de plan va aquí, en el servidor: la pantalla solo lo repite.
    if (!tieneFeature({ plan: estudio.plan as string | null, subscriptionStatus: estudio.subscription_status as string | null }, 'appPropia')) {
      return NextResponse.json({ error: 'Tu plan no incluye la app propia. Está en Estudio y Cadena.' }, { status: 403 });
    }

    const { data: existente, error: errExiste } = await admin.from('apps_estudio')
      .select('bundle_id, nombre_app, estado, url_tienda, pedida_en').eq('studio_id', sesion.studioId).maybeSingle();
    if (errExiste) throw errExiste;
    if (existente) return NextResponse.json({ error: 'Ya has pedido tu app.', app: aApp(existente as FilaApp) }, { status: 409 });

    // El bundle sale del slug; si ya estaba cogido por otro estudio, se prueba con un sufijo.
    for (let intento = 1; intento <= 5; intento++) {
      const bundle = bundleDeSlug((estudio.slug as string | null) ?? sesion.studioId, intento);
      if (!bundle) return NextResponse.json({ error: 'Tu estudio no tiene una dirección válida para la app. Escríbenos.' }, { status: 422 });
      const { data: creada, error } = await admin.from('apps_estudio').insert({
        studio_id: sesion.studioId, bundle_id: bundle, nombre_app: nombre.nombre,
        activa: false, estado: 'PEDIDA', pedida_en: new Date().toISOString(),
      }).select('bundle_id, nombre_app, estado, url_tienda, pedida_en').single();
      if (!error) return NextResponse.json({ app: aApp(creada as FilaApp) }, { status: 201 });
      // 23505: o ya la había pedido otra pestaña (clave del estudio) o el bundle estaba cogido.
      if (error.code !== '23505') throw error;
      const { data: ya } = await admin.from('apps_estudio').select('bundle_id, nombre_app, estado, url_tienda, pedida_en').eq('studio_id', sesion.studioId).maybeSingle();
      if (ya) return NextResponse.json({ error: 'Ya has pedido tu app.', app: aApp(ya as FilaApp) }, { status: 409 });
    }
    return NextResponse.json({ error: 'No hemos podido reservar un identificador para tu app. Escríbenos.' }, { status: 409 });
  } catch (err) {
    return errorInterno('[estudio/app-movil] pedir', err);
  }
}
