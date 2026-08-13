import { supabase } from '@/lib/db/supabase';

// Subida de documentos de identidad/certificación — bucket PRIVADO
// `red-documentos-identidad` (migración red_documentos_identidad_bucket),
// a diferencia de TODO el resto de subidas de este repo (lib/portal-
// storage.ts), que van al único bucket público que había hasta ahora.
//
// Subida DIRECTA desde el cliente (mismo patrón que avatars): la RLS de
// storage.objects exige que el primer segmento del path sea el propio
// auth.uid(), así que no hace falta un endpoint proxy para el INSERT. Lo
// que SÍ pasa siempre por un endpoint de servidor es registrar la fila que
// referencia ese path (POST /api/network/perfil/verificacion-identidad o
// /api/network/certificaciones) y, más adelante, LEER el documento — el
// bucket no tiene ninguna policy de SELECT para authenticated/anon, solo
// service_role puede generar una URL firmada (Fase 3, Tentare Interno).
const BUCKET = 'red-documentos-identidad';
const TIPOS_ACEPTADOS = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const TAMANO_MAXIMO = 10 * 1024 * 1024;

export function validarDocumentoIdentidad(file: File): string | null {
  if (!TIPOS_ACEPTADOS.includes(file.type)) return 'Formato no admitido. Sube un PDF, PNG, JPG o WEBP.';
  if (file.size > TAMANO_MAXIMO) return 'El archivo pesa demasiado (máximo 10 MB).';
  return null;
}

/**
 * Sube un documento a la carpeta propia del usuario (`{auth_user_id}/...`).
 * `prefijo` distingue el tipo de documento dentro de esa carpeta (p.ej.
 * `identidad`, `certificacion-<id-temporal>`) — varios documentos por
 * persona, nunca se sobrescriben entre sí (a diferencia de las fotos de
 * perfil en el bucket público, que sí reutilizan el mismo path a propósito).
 */
export async function subirDocumentoIdentidad(
  authUserId: string, prefijo: string, file: File,
): Promise<{ path: string } | { error: string }> {
  const invalido = validarDocumentoIdentidad(file);
  if (invalido) return { error: invalido };

  const extension = file.name.includes('.') ? file.name.split('.').pop() : null;
  const path = `${authUserId}/${prefijo}-${Date.now()}${extension ? `.${extension}` : ''}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) return { error: error.message };

  return { path };
}
