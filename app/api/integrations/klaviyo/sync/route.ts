import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { getValidAccessToken, suscribirPerfiles, type PerfilSincronizar } from '@/lib/klaviyo';
import { dbGetKlaviyoCredenciales } from '@/lib/db/supabase-data-admin';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { tieneConsentimientoMarketingVigente } from '@/lib/marketing/consentimiento';

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

  const [{ data: socios }, { data: studio }] = await Promise.all([
    admin.from('socios')
      .select('id, nombre, email, telefono, consentimiento_marketing_texto')
      .eq('studio_id', sesion.studioId).is('borrado_en', null),
    admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle(),
  ]);

  const textoVigente = textoConsentimientoMarketing({ nombre: studio?.nombre });
  const filas = (socios ?? []) as { id: string; nombre: string; email: string; telefono: string | null; consentimiento_marketing_texto: string | null }[];
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
