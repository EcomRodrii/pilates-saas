import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { getValidAccessToken, suscribirPerfiles, type PerfilSincronizar } from '@/lib/klaviyo';
import { dbGetKlaviyoCredenciales } from '@/lib/db/supabase-data-admin';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { tieneConsentimientoMarketingVigente } from '@/lib/marketing/consentimiento';
import { fetchAllRows } from '@/lib/supabase-data';

// Sincronización manual ("Sincronizar ahora" en Configuración →
// Integraciones) — SÍNCRONA dentro de la propia request, mismo patrón que
// app/api/integrations/google-calendar/sync (no un job de Inngest: esta
// integración ya sincroniza así, seguirlo evita un mecanismo nuevo para lo
// mismo). Solo sube socias con consentimiento de marketing VIGENTE — igual
// guard que campañas/automatizaciones (lib/marketing/consentimiento.ts):
// Klaviyo no debe recibir a nadie que no lo haya aceptado.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const accessToken = await getValidAccessToken(sesion.studioId);
  if (!accessToken) {
    return NextResponse.json({ error: 'Este estudio no tiene Klaviyo conectado' }, { status: 400 });
  }
  const creds = await dbGetKlaviyoCredenciales(sesion.studioId);
  if (!creds?.listId) {
    return NextResponse.json({ error: 'No se pudo determinar la lista de Klaviyo. Desconecta y vuelve a conectar la cuenta.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Supabase admin no configurado' }, { status: 503 });

  // Auditoría 22-ago: mismo corte silencioso a 1000 filas que su gemelo de
  // Mailchimp (ver el comentario de `fetchAllRows`). Los dos se arreglan en el
  // mismo sitio a propósito: el fallo recurrente de este repo es corregir un
  // fichero y dejar su copia literal al lado.
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
    // Límite de la API de Klaviyo: 1000 perfiles por lote.
    const LOTE = 1000;
    for (let i = 0; i < perfiles.length; i += LOTE) {
      await suscribirPerfiles(accessToken, creds.listId, perfiles.slice(i, i + LOTE));
    }
    return NextResponse.json({ ok: true, sincronizadas: perfiles.length, total: filas.length });
  } catch (err) {
    console.error('[integrations/klaviyo/sync]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se ha podido sincronizar con Klaviyo. Vuelve a conectar la cuenta desde Configuración → Integraciones.' }, { status: 502 });
  }
}
