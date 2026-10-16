import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { suscribirPerfiles, type PerfilSincronizar } from '@/lib/mailchimp';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { tieneConsentimientoMarketingVigente } from '@/lib/marketing/consentimiento';
import { fetchAllRows } from '@/lib/supabase-data';

// Sincronización manual ("Sincronizar ahora" en Configuración →
// Integraciones) — SÍNCRONA dentro de la propia request, mismo patrón que
// Klaviyo/Google Calendar. Solo sube socias con consentimiento de marketing
// VIGENTE — igual guard que campañas/automatizaciones
// (lib/marketing/consentimiento.ts): Mailchimp no debe recibir a nadie que no
// lo haya aceptado.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede sincronizar integraciones' }, { status: 403 });
  }

  const intg = await dbGetIntegracionConfig(sesion.studioId, 'MAILCHIMP');
  const apiKey = intg?.config.apiKey?.trim();
  const audienceId = intg?.config.audienceId?.trim();
  const serverPrefix = intg?.config.serverPrefix?.trim();
  if (!intg?.activo || !apiKey || !audienceId || !serverPrefix) {
    return NextResponse.json({ error: 'Este estudio no tiene Mailchimp conectado' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Supabase admin no configurado' }, { status: 503 });

  // Auditoría 22-ago: sin paginar, PostgREST corta en 1000 filas EN SILENCIO
  // (ver el comentario de `fetchAllRows`). Un estudio con más de 1000 socias
  // sincronizaba solo las 1000 primeras y la UI le respondía `total: 1000`
  // como si fuera todo.
  const [{ data: socios, error: errSocios }, { data: studio }] = await Promise.all([
    fetchAllRows<{ id: string; nombre: string; email: string; telefono: string | null; consentimiento_marketing_texto: string | null }>(
      sesion.studioId,
      'socios',
      (from, to) => admin.from('socios')
        .select('id, nombre, email, telefono, consentimiento_marketing_texto')
        .eq('studio_id', sesion.studioId).is('borrado_en', null)
        .order('id').range(from, to),
    ),
    admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle(),
  ]);

  const textoVigente = textoConsentimientoMarketing({ nombre: studio?.nombre });
  // `fetchAllRows` devuelve lo que SÍ pudo leer más el error de la página que
  // falló (y ya avisa a Sentry). Sincronizar media lista y responder «hecho»
  // sería peor que fallar: nadie volvería a darle.
  if (errSocios) {
    return NextResponse.json({ error: 'No hemos podido leer tus clientas completas. Inténtalo de nuevo en un momento.' }, { status: 502 });
  }
  const filas = socios ?? [];
  const perfiles: PerfilSincronizar[] = filas
    .filter(s => s.email && tieneConsentimientoMarketingVigente(s.consentimiento_marketing_texto ?? undefined, textoVigente))
    .map(s => ({ email: s.email, nombre: s.nombre, telefono: s.telefono }));

  try {
    const { sincronizadas, errores } = await suscribirPerfiles({ apiKey, audienceId, serverPrefix }, perfiles);
    return NextResponse.json({ ok: true, sincronizadas, errores, total: filas.length });
  } catch (err) {
    console.error('[integrations/mailchimp/sync]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se ha podido sincronizar con Mailchimp. Comprueba tu clave API desde Configuración → Integraciones.' }, { status: 502 });
  }
}
