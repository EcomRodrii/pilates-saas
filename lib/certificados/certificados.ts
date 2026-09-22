import 'server-only';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { appUrl } from '@/lib/app-url';
import type { RowCertificadosEstudio } from '@/lib/db-types';

// Certificación «Tentare Verified Studio»: un certificado oficial por estudio
// (id TNT-VS-<año>-<NNNN>), generado y revocado SIEMPRE con service-role desde
// las RPC `crear_certificado_estudio`/`revocar_certificado_estudio`
// (supabase/migrations/20260922150657_certificados_verificacion.sql) — nunca
// con un INSERT/UPDATE directo del cliente. El rol se comprueba en el
// endpoint (puedeGestionarSede), nunca en la RPC: corre con auth.uid() NULL.

export const CODIGO_CERTIFICADO_RE = /^TNT-VS-\d{4}-\d{4,}$/;

export interface Certificado {
  codigo: string;
  studioId: string;
  estado: 'ACTIVE' | 'REVOKED';
  emitidoEn: string;
  revocadoEn: string | null;
}

function aCertificado(fila: RowCertificadosEstudio): Certificado {
  return {
    codigo: fila.id,
    studioId: fila.studio_id,
    estado: fila.estado === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
    emitidoEn: fila.emitido_en,
    revocadoEn: fila.revocado_en,
  };
}

/** El certificado del estudio (activo o revocado, el que sea), o null si nunca se generó uno. */
export async function obtenerCertificadoDeEstudio(studioId: string): Promise<Certificado | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('certificados_estudio')
    .select('*')
    .eq('studio_id', studioId)
    .order('emitido_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? aCertificado(data as RowCertificadosEstudio) : null;
}

/** Genera el certificado del estudio, o devuelve el ya activo (idempotente: la RPC decide). */
export async function generarCertificado(studioId: string): Promise<Certificado | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Servidor no configurado' };
  const { data, error } = await admin.rpc('crear_certificado_estudio', { p_studio_id: studioId });
  if (error || !data) return { error: 'No se ha podido generar el certificado' };
  return aCertificado(data as RowCertificadosEstudio);
}

/** Revoca el certificado activo del estudio. Devuelve `null` si no había ninguno activo (idempotente). */
export async function revocarCertificado(studioId: string): Promise<Certificado | null | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Servidor no configurado' };
  const { data, error } = await admin.rpc('revocar_certificado_estudio', { p_studio_id: studioId });
  if (error) return { error: 'No se ha podido revocar el certificado' };
  return data ? aCertificado(data as RowCertificadosEstudio) : null;
}

/**
 * Busca un certificado por su código, sin acotar por estudio — es el lookup
 * de la página pública `/verify/<codigo>` y del endpoint de la imagen: ambos
 * son de acceso público y el código YA es el identificador único.
 */
export async function buscarCertificadoPorCodigo(codigo: string): Promise<Certificado | null> {
  if (!CODIGO_CERTIFICADO_RE.test(codigo)) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('certificados_estudio').select('*').eq('id', codigo).maybeSingle();
  return data ? aCertificado(data as RowCertificadosEstudio) : null;
}

export function urlVerificacion(codigo: string): string {
  return `${appUrl()}/verify/${encodeURIComponent(codigo)}`;
}

/** El nombre del estudio a mostrar en el certificado/la página de verificación. */
export async function nombreDeEstudio(studioId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from('studios').select('nombre').eq('id', studioId).maybeSingle();
  return data?.nombre ?? null;
}
