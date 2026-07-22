import { supabase } from '@/lib/db/supabase';

// Fotos de perfil de socias — bucket público "avatars" en Supabase Storage.
// Se sobrescribe siempre el mismo path (sin extensión) para no tener que
// llevar la cuenta de qué extensión se subió la última vez.
const BUCKET = 'avatars';

// Guardrail de subidas de marca (logo/favicon): límite de tamaño y formato.
// Validación en cliente antes de subir; devuelve un mensaje o null si es válida.
const IMG_TIPOS = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];
export function validarImagenMarca(file: File, maxBytes: number): string | null {
  if (!IMG_TIPOS.includes(file.type)) return 'Formato no admitido. Usa PNG, JPG, WEBP, SVG o ICO.';
  if (file.size > maxBytes) {
    const limite = maxBytes >= 1024 * 1024 ? `${Math.round(maxBytes / 1024 / 1024)} MB` : `${Math.round(maxBytes / 1024)} KB`;
    return `La imagen pesa demasiado (máximo ${limite}).`;
  }
  return null;
}

export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const FAVICON_MAX_BYTES = 512 * 1024; // 512 KB

// Guardrail de fotos de perfil (socia/propietaria/instructora): mismo criterio
// para las 3 — cualquier imagen, hasta 5 MB. Sin recorte: se sube tal cual y
// se recorta visualmente en círculo (object-fit: cover) al mostrarla.
export const FOTO_PERFIL_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export function validarFotoPerfil(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Elige un archivo de imagen.';
  if (file.size > FOTO_PERFIL_MAX_BYTES) return 'La imagen no puede superar 5 MB.';
  return null;
}

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

// Foto de perfil de la propietaria — mismo bucket público, prefijo propio
// para no colisionar con el path de socias (que no llevan prefijo).
export async function subirFotoAdmin(studioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const path = `admin-${studioId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFotoAdmin(studioId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`admin-${studioId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Foto de perfil de instructora — mismo bucket público, prefijo propio.
export async function subirFotoInstructor(instructorId: string, file: File): Promise<{ url: string } | { error: string }> {
  const path = `instructor-${instructorId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFotoInstructor(instructorId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`instructor-${instructorId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Logo del estudio (marca) — mismo bucket público, prefijo propio. Se muestra
// en el portal público de reservas cuando existe.
export async function subirLogoEstudio(studioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const invalido = validarImagenMarca(file, LOGO_MAX_BYTES);
  if (invalido) return { error: invalido };
  const path = `logo-${studioId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarLogoEstudio(studioId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`logo-${studioId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Favicon del estudio (marca) — mismo bucket público, prefijo propio. Se usa como
// icono de pestaña en las páginas públicas (white-label). Más restrictivo de
// tamaño que el logo.
export async function subirFaviconEstudio(studioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const invalido = validarImagenMarca(file, FAVICON_MAX_BYTES);
  if (invalido) return { error: invalido };
  const path = `favicon-${studioId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFaviconEstudio(studioId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`favicon-${studioId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}
