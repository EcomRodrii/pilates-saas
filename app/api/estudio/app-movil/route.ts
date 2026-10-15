import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { pedirAppEncendido } from '@/lib/interruptor-por-estudio';
import { entitlementsDe } from '@/lib/billing/entitlements';
import { estudioDeLaApp } from '@/lib/app-nativa/app-de-cadena';
import { finDelMargen } from '@/lib/app-nativa/apps-sin-plan';
import { avisarEquipoApps } from '@/lib/app-nativa/avisar-equipo';
import {
  bloqueoParaPedir, bundlesCandidatos, esCupo, esEstadoApp, nombreSugerido, validarNombreApp,
  type AppDelEstudio, type BloqueoPedirApp,
} from '@/lib/app-nativa/pedir-app';

export const dynamic = 'force-dynamic';

// «Pedir mi app» (Apariencia de tu app): la app de la App Store con el nombre y el icono del
// estudio. GET dice en qué punto está; POST la pide.
//
// · Solo con `APP_PROPIA_PEDIR` encendido para el estudio (si no, 404: ni existe).
// · Pedirla es de la propietaria, y solo con Estudio o Cadena PAGADO: ni en la prueba ni con un
//   cobro pendiente (`bloqueoParaPedir`, EN EL SERVIDOR: la pantalla solo lo repite). Decisión del
//   fundador, 15-oct-2026: un hueco del lote es una app ya creada en App Store Connect.
// · En una cadena hay UNA app: va con el id de la sede principal (`estudioDeLaApp`), se pide desde
//   ella y las demás sedes ven la misma.
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

/** Lo que se le dice si no puede pedirla (la pantalla dice lo mismo con sus palabras). */
const MENSAJE_BLOQUEO: Record<BloqueoPedirApp, (principal: string | null) => string> = {
  plan: () => 'Tu plan no incluye la app propia. Está en Estudio y Cadena.',
  prueba: () => 'La app se pide con tu plan ya pagado, no durante la prueba.',
  cobro: () => 'Hay un cobro de tu plan pendiente. Cuando se resuelva, podrás pedir la app.',
  'sin-plan': () => 'Tu plan no está activo. Con Estudio o Cadena activo podrás pedir la app.',
  sede: (principal) => `La app de tu cadena se pide desde ${principal ? `«${principal}»` : 'su sede principal'}.`,
};

/**
 * El hueco del lote para este estudio (`asignar_cupo_app`: le da uno libre o el que ya tenía), o
 * `null` si no queda ninguno. TOLERANTE: si la función aún no existe en esta base (código desplegado
 * antes que la migración) o falla, también `null`, y se sigue con el identificador del slug, que es
 * lo de antes. Se avisa en el log para que no pase en silencio.
 */
async function cupoDelLote(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, studioId: string): Promise<string | null> {
  const { data, error } = await admin.rpc('asignar_cupo_app', { p_studio_id: studioId });
  // Que la función falle NO es «no queda lote»: caer al slug dejaría al estudio con una app que no
  // existe en App Store Connect. Se corta y se reintenta (la función guarda el hueco que ya tenga).
  if (error) throw new Error(`asignar_cupo_app: ${error.code ?? error.message}`);
  return typeof data === 'string' && esCupo(data) ? data : null;
}

/** El plan y el estado de pago que deciden si se puede pedir: los del dueño de la app. */
async function bloqueoDe(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, duenaId: string, esSedeSecundaria: boolean) {
  const { data, error } = await admin.from('studios').select('nombre, slug, plan, subscription_status').eq('id', duenaId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const planIncluye = entitlementsDe({ plan: data.plan as string | null }).features.appPropia;
  const bloqueo: BloqueoPedirApp | null = bloqueoParaPedir({ planIncluye, estado: data.subscription_status as string | null, esSedeSecundaria });
  return { estudio: data as { nombre: string | null; slug: string | null }, bloqueo };
}

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
    const duena = await estudioDeLaApp(admin, sesion.studioId);
    const [plan, app] = await Promise.all([
      bloqueoDe(admin, duena.studioId, duena.esSedeSecundaria),
      admin.from('apps_estudio').select('bundle_id, nombre_app, estado, url_tienda, pedida_en, sin_plan_desde').eq('studio_id', duena.studioId).maybeSingle(),
    ]);
    if (app.error) throw app.error;
    // Corre el margen de 30 días por no pagar Estudio/Cadena: hasta cuándo (apps-sin-plan.ts).
    const sinPlanDesde = (app.data as { sin_plan_desde?: string | null } | null)?.sin_plan_desde ?? null;
    const retiradaEl = sinPlanDesde && (app.data as { estado?: string } | null)?.estado !== 'PAUSADA'
      ? finDelMargen(new Date(sinPlanDesde)).toISOString() : null;
    if (!plan) return NextResponse.json({ error: 'No encontramos tu estudio' }, { status: 404 });
    return NextResponse.json({
      bloqueo: plan.bloqueo,
      sedePrincipal: duena.esSedeSecundaria ? duena.nombrePrincipal : null,
      esPropietaria: sesion.rol === 'PROPIETARIO',
      nombreSugerido: nombreSugerido(plan.estudio.nombre ?? plan.estudio.slug ?? ''),
      app: aApp(app.data as FilaApp | null),
      retiradaEl,
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
    const duena = await estudioDeLaApp(admin, sesion.studioId);
    const plan = await bloqueoDe(admin, duena.studioId, duena.esSedeSecundaria);
    if (!plan) return NextResponse.json({ error: 'No encontramos tu estudio' }, { status: 404 });
    // La puerta de plan va aquí, en el servidor: la pantalla solo lo repite.
    if (plan.bloqueo) {
      return NextResponse.json({ error: MENSAJE_BLOQUEO[plan.bloqueo](duena.nombrePrincipal), bloqueo: plan.bloqueo }, { status: 403 });
    }
    const studioIdApp = duena.studioId;

    const { data: existente, error: errExiste } = await admin.from('apps_estudio')
      .select('bundle_id, nombre_app, estado, url_tienda, pedida_en').eq('studio_id', studioIdApp).maybeSingle();
    if (errExiste) throw errExiste;
    if (existente) return NextResponse.json({ error: 'Ya has pedido tu app.', app: aApp(existente as FilaApp) }, { status: 409 });

    // Primero un hueco del lote (la app ya existe en App Store Connect); si no queda ninguno, el
    // identificador sale del slug y, si ya estaba cogido por otro estudio, con un sufijo.
    const candidatos = bundlesCandidatos(await cupoDelLote(admin, studioIdApp), plan.estudio.slug ?? studioIdApp);
    if (candidatos.length === 0) return NextResponse.json({ error: 'Tu estudio no tiene una dirección válida para la app. Escríbenos.' }, { status: 422 });
    for (const bundle of candidatos) {
      const { data: creada, error } = await admin.from('apps_estudio').insert({
        studio_id: studioIdApp, bundle_id: bundle, nombre_app: nombre.nombre,
        activa: false, estado: 'PEDIDA', pedida_en: new Date().toISOString(),
      }).select('bundle_id, nombre_app, estado, url_tienda, pedida_en').single();
      if (!error) {
        // Al equipo: con hueco, la automatización la prepara sola; sin hueco, hay que crearla a mano.
        // Y cuántos huecos quedan: crear un lote nuevo es trabajo a mano en la web de Apple.
        const { count: libres } = await admin.from('apps_estudio_cupos').select('bundle_id', { count: 'exact', head: true }).is('studio_id', null);
        const quedan = typeof libres === 'number' ? ` Quedan ${libres} hueco${libres === 1 ? '' : 's'} libre${libres === 1 ? '' : 's'}${libres <= 2 ? ': toca preparar otro lote.' : '.'}` : '';
        await avisarEquipoApps(
          `${plan.estudio.nombre ?? plan.estudio.slug ?? studioIdApp} pide su app «${nombre.nombre}»`,
          (esCupo(bundle)
            ? `Se le ha dado el hueco ${bundle}. La automatización le pone el nombre, la compila y la sube a TestFlight sola; enviarla a revisión es decisión vuestra.`
            : `No quedaba ningún hueco: hay que crear la app ${bundle} a mano en App Store Connect y preparar otro lote.`) + quedan,
        );
        return NextResponse.json({ app: aApp(creada as FilaApp) }, { status: 201 });
      }
      // 23505: o ya la había pedido otra pestaña (clave del estudio) o el bundle estaba cogido.
      if (error.code !== '23505') throw error;
      const { data: ya } = await admin.from('apps_estudio').select('bundle_id, nombre_app, estado, url_tienda, pedida_en').eq('studio_id', studioIdApp).maybeSingle();
      if (ya) return NextResponse.json({ error: 'Ya has pedido tu app.', app: aApp(ya as FilaApp) }, { status: 409 });
    }
    return NextResponse.json({ error: 'No hemos podido reservar un identificador para tu app. Escríbenos.' }, { status: 409 });
  } catch (err) {
    return errorInterno('[estudio/app-movil] pedir', err);
  }
}
