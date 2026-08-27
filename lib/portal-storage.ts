import { supabase } from '@/lib/db/supabase';
import { recortarTransparencia } from '@/lib/imagen/recortar-logo';
import { redimensionarImagen, LADO_AVATAR, LADO_FOTO_CLASE, LADO_BANNER } from '@/lib/imagen-cliente';
// La higienización de la clave vive en un módulo SIN imports para que
// `node --test` pueda probarla: no resuelve el alias `@/`, y este fichero lo usa.
import { claveDeImagenPortal } from '@/lib/storage-clave';

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
  const img = await redimensionarImagen(file, LADO_AVATAR);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(socioId, img, { upsert: true, contentType: img.type });

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

// ─── Imagen de un post del Feed de Comunidad ────────────────────────────────
//
// Bucket PROPIO (`comunidad-media`, migr 20260826015930), no `avatars`: la RLS
// de ese bucket exige que la primera carpeta del path sea `current_studio_id()`
// y `/api/comunidad/posts` solo acepta una `imagenUrl` que contenga
// `/comunidad-media/` — una subida a `avatars` se descartaría en silencio al
// crear el post.
//
// ⚠️ El bucket declara `allowed_mime_types` = png/jpeg/webp. Se valida ANTES de
// redimensionar porque `redimensionarImagen` devuelve el fichero original tal
// cual cuando no sabe recodificarlo (HEIC de iPhone, GIF…), y entonces el
// rechazo llegaría del servidor con un mensaje que no dice nada.
const POST_TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
export const POST_IMAGEN_MAX_BYTES = 5 * 1024 * 1024; // 5 MB, el límite del bucket

export async function subirImagenPostComunidad(
  studioId: string, postId: string, file: File,
): Promise<{ url: string } | { error: string }> {
  if (!POST_TIPOS.includes(file.type)) return { error: 'Formato no admitido. Usa PNG, JPG o WEBP.' };
  if (file.size > POST_IMAGEN_MAX_BYTES) return { error: 'La imagen no puede superar 5 MB.' };
  const limpia = claveDeImagenPortal(postId);
  if (!limpia) return { error: 'No se ha podido guardar la imagen. Vuelve a intentarlo.' };
  const img = await redimensionarImagen(file, LADO_BANNER);
  const path = `${studioId}/${limpia}`;
  const { error: uploadError } = await supabase.storage
    .from('comunidad-media')
    .upload(path, img, { upsert: true, contentType: img.type });
  if (uploadError) return { error: uploadError.message };
  const { data } = supabase.storage.from('comunidad-media').getPublicUrl(path);
  return { url: data.publicUrl };
}

// Fotos de tipos de clase (ej. la sala de Reformer) — mismo bucket público,
// path con prefijo distinto para no colisionar con IDs de socias.
export async function subirFotoClase(tipoClaseId: string, file: File): Promise<{ url: string } | { error: string }> {
  const path = `clase-${tipoClaseId}`;
  const img = await redimensionarImagen(file, LADO_FOTO_CLASE);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, img, { upsert: true, contentType: img.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFotoClase(tipoClaseId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`clase-${tipoClaseId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Imagen de un banner del contenido editable del portal — mismo bucket
// público, prefijo propio. El banner (fila en contenido_portal_banners) tiene
// que existir YA con este `bannerId` antes de subir: la RLS de storage
// (avatars_path_autorizado) valida el path consultando esa tabla, así que
// subir antes de crear la fila lo rechaza.
export async function subirBannerEstudio(bannerId: string, file: File): Promise<{ url: string } | { error: string }> {
  const invalido = validarImagenMarca(file, LOGO_MAX_BYTES);
  if (invalido) return { error: invalido };
  const path = `banner-${bannerId}`;
  // La validación de arriba mira el fichero ORIGINAL a propósito: el límite es
  // un contrato con quien sube, no algo que debamos esquivar encogiendo después.
  const img = await redimensionarImagen(file, LADO_BANNER);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, img, { upsert: true, contentType: img.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarBannerEstudio(bannerId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`banner-${bannerId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Foto de perfil de la propietaria — mismo bucket público, prefijo propio
// para no colisionar con el path de socias (que no llevan prefijo).
export async function subirFotoAdmin(studioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const path = `admin-${studioId}`;
  const img = await redimensionarImagen(file, LADO_AVATAR);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, img, { upsert: true, contentType: img.type });

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
  const img = await redimensionarImagen(file, LADO_AVATAR);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, img, { upsert: true, contentType: img.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFotoInstructor(instructorId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`instructor-${instructorId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Imagen de bienvenida/portada del portal — mismo bucket público, prefijo
// propio. Distinta de `subirFotoAdmin` (foto de perfil de la propietaria,
// solo panel): esta es la que ven las alumnas al entrar al portal
// (BienvenidaPortal, PortadaAcceso, hero de inicio...). Mismo redimensionado
// que un banner: es una imagen grande a pantalla completa, no un avatar.
export async function subirImagenBienvenida(studioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const path = `bienvenida-${studioId}`;
  const img = await redimensionarImagen(file, LADO_BANNER);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, img, { upsert: true, contentType: img.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarImagenBienvenida(studioId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`bienvenida-${studioId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

// Foto de perfil de Tentare Network — mismo bucket público, prefijo propio.
// A diferencia de `subirFotoInstructor`, la autorización del path es por
// dueño (`red_perfiles.auth_user_id = auth.uid()`), no por estudio: un
// perfil de Network puede no pertenecer a ningún estudio Tentare
// (avatars_path_autorizado, rama `network-%`).
export async function subirFotoPerfilNetwork(perfilId: string, file: File): Promise<{ url: string } | { error: string }> {
  const path = `network-${perfilId}`;
  const img = await redimensionarImagen(file, LADO_AVATAR);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, img, { upsert: true, contentType: img.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFotoPerfilNetwork(perfilId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`network-${perfilId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Cualquier imagen que se sube DESDE el editor de apariencia: la foto de un
 * banner, la de una tarjeta, la de una galería…
 *
 * Las nueve funciones de arriba son de una pieza concreta cada una (el logo,
 * el favicon, la foto de ESA instructora). Ésta es la genérica, y hacía falta
 * porque hasta ahora un campo de imagen del editor era **una casilla para
 * pegar una URL**: para poner una foto en un banner había que subirla a otro
 * sitio y copiar el enlace. Nadie que lleve un estudio de Pilates hace eso.
 *
 * ⚠️ La `clave` la compone quien llama y entra en el path, así que se
 * higieniza aquí y no en el llamador: un id de bloque con `/` o `..` escribiría
 * fuera de su carpeta. Se limita a lo que puede salir de un id o un nombre de
 * campo, y el `studioId` va SIEMPRE por delante — dos estudios no pueden
 * pisarse aunque coincidan las claves.
 */
export async function subirImagenPortal(
  studioId: string, clave: string, file: File,
): Promise<{ url: string } | { error: string }> {
  const invalido = validarImagenMarca(file, LOGO_MAX_BYTES);
  if (invalido) return { error: invalido };
  const limpia = claveDeImagenPortal(clave);
  if (!limpia) return { error: 'No se ha podido guardar la imagen. Vuelve a intentarlo.' };
  const path = `portal-${studioId}-${limpia}`;
  const img = await redimensionarImagen(file, LADO_BANNER);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, img, { upsert: true, contentType: img.type });
  if (uploadError) return { error: uploadError.message };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // `?v=` para que el navegador no siga enseñando la anterior: el path se
  // reutiliza (`upsert`) y sin esto cambiar la foto no se notaba hasta vaciar
  // la caché.
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

// Logo del estudio (marca) — mismo bucket público, prefijo propio. Se muestra
// en el portal público de reservas cuando existe.
//
// Se recorta el aire transparente ANTES de guardar, y aquí y no en el editor de
// tema para que valga venga de donde venga la subida. Motivo: los correos
// pintan este logo con una altura fija (`<Img height="32">`), así que el margen
// del fichero se come la altura del dibujo. Un logo real en producción tenía
// 1508×1043 de lienzo con 1451×297 de tinta — a 32 px, solo 9 eran logo. Al
// subirlo no se nota (el editor lo enseña a lo grande); se nota en la bandeja
// de la clienta, que es donde ya no puedes arreglarlo.
//
// ⚠️ SIN redimensionar, a diferencia de las cinco funciones de foto de arriba.
// No es un olvido: `validarImagenMarca` admite SVG e ICO, y pasar un SVG por
// canvas lo rasteriza — se perdería el vector justo en el activo que más
// necesita escalar bien. Un logo tampoco tiene el problema de tamaño de las
// fotos de móvil: ya está acotado a 2 MB (y el favicon a 512 KB).
export async function subirLogoEstudio(studioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const invalido = validarImagenMarca(file, LOGO_MAX_BYTES);
  if (invalido) return { error: invalido };
  // Se valida ANTES de recortar: el límite es sobre lo que sube la persona, no
  // sobre lo que quede después, o un PNG enorme pasaría por haber adelgazado.
  file = await recortarTransparencia(file);
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
//
// A diferencia del logo (que no tiene borrador — se persiste directo en
// studios.logoUrl), el favicon SÍ es un campo del tema (theme-schema.ts) que
// vive en config_draft/config_published. El editor sube/borra SIEMPRE contra
// `favicon-borrador-<studioId>`, nunca `favicon-<studioId>` directamente — si
// subiera al path publicado, cambiar el favicon mientras se edita ya lo
// cambiaría en producción, saltándose "Publicar" (I-6). El paso borrador ->
// publicado (copia de storage + URL final) lo hace publicarTheme()
// (lib/theme-data.ts), server-side, con el cliente admin.
export async function subirFaviconEstudio(studioId: string, file: File): Promise<{ url: string } | { error: string }> {
  const invalido = validarImagenMarca(file, FAVICON_MAX_BYTES);
  if (invalido) return { error: invalido };
  const path = `favicon-borrador-${studioId}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function eliminarFaviconEstudio(studioId: string): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.storage.from(BUCKET).remove([`favicon-borrador-${studioId}`]);
  if (error) return { error: error.message };
  return { ok: true };
}
