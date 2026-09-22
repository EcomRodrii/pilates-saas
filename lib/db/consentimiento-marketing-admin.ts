import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import type { EvidenciaPeticion } from '@/lib/db/aceptacion-contrato-admin';

// Consentimiento de marketing dado o retirado por LA PROPIA SOCIA (sus altas
// públicas y su app) o por el enlace de baja de un correo. Única puerta de
// servidor: la RPC `consentimiento_marketing_propio` (migr 20260922004313),
// solo service_role, y el historial lo escribe un trigger sobre `socios`.
//
// Del navegador solo llega «sí» o «no». El texto lo compone el servidor con el
// nombre del estudio (es la clave de vigencia que compara el envío de
// campañas), la fecha es now() de la base, y el origen lo fija quien llama.

export type OrigenConsentimientoPropio = 'SOCIA' | 'BAJA_EMAIL';
export type ResultadoConsentimiento = 'OK' | 'YA_CONSTABA' | 'SOCIA_NO_ENCONTRADA';

export async function textoConsentimientoVigente(admin: SupabaseClient, studioId: string): Promise<string> {
  const { data, error } = await admin.from('studios').select('nombre').eq('id', studioId).maybeSingle();
  if (error) throw error;
  return textoConsentimientoMarketing({ nombre: (data?.nombre as string | null) ?? undefined });
}

export async function registrarConsentimientoMarketingPropio(admin: SupabaseClient, p: {
  studioId: string;
  socioId: string;
  dar: boolean;
  origen: OrigenConsentimientoPropio;
  evidencia?: EvidenciaPeticion;
}): Promise<ResultadoConsentimiento> {
  const texto = p.dar ? await textoConsentimientoVigente(admin, p.studioId) : null;
  const { data, error } = await admin.rpc('consentimiento_marketing_propio', {
    p_studio_id: p.studioId,
    p_socio_id: p.socioId,
    p_dar: p.dar,
    p_texto: texto,
    p_origen: p.origen,
    p_ip_hmac: p.evidencia?.ipHmac ?? null,
    p_user_agent: p.evidencia?.userAgent ?? null,
  });
  if (error) throw error;
  return data as ResultadoConsentimiento;
}

/** ¿Tiene la socia el consentimiento VIGENTE (el texto actual, no uno antiguo)? */
export async function consentimientoMarketingVigente(admin: SupabaseClient, studioId: string, socioId: string): Promise<boolean> {
  const [texto, socia] = await Promise.all([
    textoConsentimientoVigente(admin, studioId),
    admin.from('socios').select('consentimiento_marketing_texto').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
  ]);
  if (socia.error) throw socia.error;
  return (socia.data?.consentimiento_marketing_texto as string | null) === texto;
}
