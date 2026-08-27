import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { intercambiarCodigoWhatsApp, validarConexionEmbeddedSignup, suscribirWabaAWebhook } from '@/lib/whatsapp';
import { dbGuardarConexionWhatsappEmbeddedSignup } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';

// Callback de Meta WhatsApp Embedded Signup v4 (ver WHATSAPP_AUDIT.md,
// Fase B/D, y META_SETUP.md). El navegador solo manda lo que Meta le dio en
// el popup — `code` (de un solo uso, 30s) y los IDs informativos del
// postMessage `WA_EMBEDDED_SIGNUP` — pero NADA de eso se persiste sin
// validarlo aquí contra la Graph API real con el App Secret.
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
  if (!guardado.ok) return NextResponse.json({ ok: false, error: guardado.error }, { status: 409 });

  // Nada se guarda a medias: si llegamos aquí, la conexión ya está validada
  // contra Meta y persistida — aterriza directo en FUNCIONA (ver
  // lib/integraciones/salud.ts), no en SIN_PROBAR como el flujo manual.
  const admin = getSupabaseAdmin();
  if (admin) await registrarSaludIntegracion(admin, sesion.studioId, 'WHATSAPP', { ok: true });

  // Best-effort: sin esto el webhook (app/api/webhooks/whatsapp) nunca
  // recibiría eventos de ESTE WABA, pero el número ya funciona para enviar
  // recordatorios sin depender de que esta llamada tenga éxito — no bloquea
  // la respuesta ni deshace lo ya guardado.
  await suscribirWabaAWebhook(cambio.token, wabaId);

  return NextResponse.json({
    ok: true,
    connected: true,
    displayPhoneNumber: validacion.displayPhoneNumber,
    verifiedName: validacion.verifiedName,
  });
}
