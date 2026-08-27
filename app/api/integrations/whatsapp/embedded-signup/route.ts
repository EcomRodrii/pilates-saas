import { NextRequest, NextResponse, after } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { intercambiarCodigoWhatsApp, validarConexionEmbeddedSignup, suscribirWabaAWebhook } from '@/lib/whatsapp';
import { dbGuardarConexionWhatsappEmbeddedSignup } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import * as Sentry from '@sentry/nextjs';

// Callback de Meta WhatsApp Embedded Signup v4 (ver WHATSAPP_AUDIT.md,
// Fase B/D, y META_SETUP.md). El navegador solo manda lo que Meta le dio en
// el popup — `code` (de un solo uso, 30s) y los IDs informativos del
// postMessage `WA_EMBEDDED_SIGNUP` — pero NADA de eso se persiste sin
// validarlo aquí contra la Graph API real con el App Secret, salvo
// `businessId`: es puramente informativo (no se lee en ningún otro sitio del
// repo, ni gatea ningún permiso — RLS sigue siendo la cerradura real), así
// que se guarda tal cual llega sin una llamada extra a Meta para verificarlo.
//
// `studioId` SIEMPRE de la sesión, igual que el resto de endpoints de
// integraciones (`/api/integrations/config`, `/probar`) — nunca del payload
// del cliente, y reforzado además por el mismo `WITH CHECK` de la RLS que ya
// protege el guardado manual.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Mismo límite que el resto de endpoints de integraciones: solo la
  // propietaria conecta/reconecta el WhatsApp del estudio.
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede conectar WhatsApp' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { code?: string; wabaId?: string; phoneNumberId?: string; businessId?: string }
    | null;
  const code = body?.code?.trim();
  const wabaId = body?.wabaId?.trim();
  const phoneNumberId = body?.phoneNumberId?.trim();
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ ok: false, error: 'Faltan datos de la conexión con Meta' }, { status: 400 });
  }

  const cambio = await intercambiarCodigoWhatsApp(code);
  if (!cambio.ok) {
    return NextResponse.json({ ok: false, error: 'No hemos podido conectar tu WhatsApp. Vuelve a intentarlo.' }, { status: 400 });
  }

  // La validación real: ¿el token que acabamos de obtener de verdad da
  // acceso a ESE número y ESA cuenta de WhatsApp Business? Los IDs del
  // navegador son solo una pista, nunca la fuente de verdad.
  const validacion = await validarConexionEmbeddedSignup(cambio.token, phoneNumberId, wabaId);
  if (!validacion.ok) {
    return NextResponse.json({ ok: false, error: 'No hemos podido verificar tu número de WhatsApp. Vuelve a intentarlo.' }, { status: 400 });
  }

  const guardado = await dbGuardarConexionWhatsappEmbeddedSignup(sesion.studioId, {
    token: cambio.token,
    phoneNumberId,
    wabaId,
    businessId: body?.businessId?.trim() || null,
    displayPhoneNumber: validacion.displayPhoneNumber,
    verifiedName: validacion.verifiedName,
  });
  if (!guardado.ok) {
    // 409 solo para el conflicto real (número ya conectado a otro estudio);
    // cualquier otro fallo (service role ausente, error de Postgres) es
    // nuestro, no de la propietaria — 500, para que se distinga en cualquier
    // monitorización que branchee por status code.
    return NextResponse.json({ ok: false, error: guardado.error }, { status: guardado.conflict ? 409 : 500 });
  }

  // Nada se guarda a medias: si llegamos aquí, la conexión ya está validada
  // contra Meta y persistida — aterriza directo en FUNCIONA (ver
  // lib/integraciones/salud.ts), no en SIN_PROBAR como el flujo manual.
  const admin = getSupabaseAdmin();
  if (admin) await registrarSaludIntegracion(admin, sesion.studioId, 'WHATSAPP', { ok: true });

  // Best-effort de verdad: dentro de `after()`, con la respuesta ya enviada
  // (un Graph API lento no puede alargar el "Conectando…" de la propietaria
  // por algo que no ve — mismo patrón que app/api/stripe/webhook/route.ts),
  // pero SÍ registrando el fallo — antes se descartaba en silencio y el
  // webhook se quedaba sordo para ese WABA sin que nadie se enterara. Un
  // `.then()` normal no basta aquí: en un entorno serverless la función
  // puede congelarse en cuanto se manda la respuesta, y `after()` es lo que
  // garantiza que esto se ejecuta de verdad.
  after(async () => {
    const r = await suscribirWabaAWebhook(cambio.token, wabaId);
    if (!r.ok) {
      Sentry.captureMessage('[whatsapp embedded-signup] no se pudo suscribir el WABA al webhook', {
        level: 'warning',
        extra: { studioId: sesion.studioId, wabaId, error: r.error },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    connected: true,
    displayPhoneNumber: validacion.displayPhoneNumber,
    verifiedName: validacion.verifiedName,
  });
}
