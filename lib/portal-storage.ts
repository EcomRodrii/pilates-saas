import { supabase } from '@/lib/supabase';

// Fotos de perfil de socias — bucket público "avatars" en Supabase Storage.
// Se sobrescribe siempre el mismo path (sin extensión) para no tener que
// llevar la cuenta de qué extensión se subió la última vez.
const BUCKET = 'avatars';

export async function subirFotoPerfil(socioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(socioId, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(socioId);
  // Cache-bust: el path es siempre el mismo, así que sin esto el navegador
  // seguiría mostrando la foto anterior tras sustituirla.
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFotoPerfil(socioId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([socioId]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Fotos de tipos de clase (ej. la sala de Reformer) — mismo bucket público,
// path con prefijo distinto para no colisionar con IDs de socias.
export async function subirFotoClase(tipoClaseId: string, file: File): Promise<{ url: string } | { error: string }> {
  const path = `clase-${tipoClaseId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFotoClase(tipoClaseId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`clase-${tipoClaseId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}
