import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { descargarObjetoR2 } from '@/lib/r2';
import { contentTypeDe } from '@/lib/theme-import/content-type';
import { reescribirHtml, reescribirCss } from '@/lib/theme-import/reescribir-rutas';
import { enlazarPropsDeclarados, enlazarFotosDeSlots } from '@/lib/theme-import/enlazar-datos';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
import { verificarTokenPreviewHome } from '@/lib/theme/home-preview-token';
import type { ImportedThemeManifest } from '@/lib/theme-import/manifest';

export const runtime = 'nodejs';

// GET /api/theme/importado/[id]/[...ruta]?t=<token> — sirve un tema
// importado TAL CUAL, byte a byte, dentro del iframe en sandbox del editor.
//
// ⚠️ Lee el CONTENIDO REAL desde R2 en cada petición — no hay ninguna copia
// "reconstruida" en ningún sitio. Lo único que se toca es la URL de los
// assets relativos dentro del HTML/CSS (ver `reescribirHtml`/`reescribirCss`,
// y su comentario de por qué eso NO cuenta como reconstruir el tema).
//
// ⚠️ SEGURIDAD — por qué esto NO usa la sesión de staff normal (cookies):
// este endpoint sirve código que subió la PROPIETARIA de un ZIP externo, y el
// iframe que lo carga va SIN `allow-same-origin` (ver
// `components/theme/tema-importado-iframe.tsx`) precisamente para que un
// script del ZIP no pueda leer las cookies de sesión de este dominio ni hacer
// fetch autenticado contra el resto de la API. Este endpoint, en su lado
// servidor, se protege con el MISMO token firmado y de corta duración que ya
// usa `/portal-preview/[slug]` (`lib/theme/home-preview-token.ts`) — no
// depende de cookies, así que sirve igual con o sin `allow-same-origin`.
//
// Límite conocido, documentado a propósito y no resuelto en esta versión:
// esto sirve desde el MISMO origen (tentare.app) que el panel. Lo correcto a
// escala es un subdominio dedicado sin cookies (p. ej. `imports.tentare.app`)
// para que ni siquiera con un fallo de sandboxing pueda haber colisión de
// origen — eso es un cambio de infra/DNS que queda fuera de esta primera
// versión.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ruta?: string[] }> },
) {
  const { id, ruta } = await params;
  const token = req.nextUrl.searchParams.get('t');
  const verificado = verificarTokenPreviewHome(token);
  if (!verificado) {
    return new NextResponse('Vuelve a abrir la vista previa desde el editor.', { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return new NextResponse('Servicio no disponible', { status: 503 });

  const { data: fila } = await admin
    .from('theme_imports')
    .select('studio_id, storage_prefix, entry_html, estado, manifest')
    .eq('id', id)
    .maybeSingle();
  if (!fila || fila.studio_id !== verificado.studioId) {
    return new NextResponse('No encontrado', { status: 404 });
  }
  if (fila.estado !== 'listo') {
    return new NextResponse('Este tema no se pudo importar en modo estático.', { status: 409 });
  }

  const rutaPedida = ruta && ruta.length > 0 ? ruta.join('/') : fila.entry_html;
  if (!rutaPedida) return new NextResponse('No encontrado', { status: 404 });

  const manifest = fila.manifest as ImportedThemeManifest;
  const existe = manifest.ficheros.some((f) => f.ruta === rutaPedida);
  if (!existe) return new NextResponse('No encontrado', { status: 404 });

  const bytes = await descargarObjetoR2(`${fila.storage_prefix}${rutaPedida}`);
  if (!bytes) return new NextResponse('No encontrado', { status: 404 });

  const tipo = contentTypeDe(rutaPedida);
  const esRelativoDeRuta = (rutaResuelta: string): string | undefined =>
    manifest.ficheros.some((f) => f.ruta === rutaResuelta)
      ? `/api/theme/importado/${id}/${rutaResuelta}?t=${encodeURIComponent(token!)}`
      : undefined;

  if (tipo.startsWith('text/html')) {
    let html = reescribirHtml(new TextDecoder().decode(bytes), rutaPedida, esRelativoDeRuta);
    html = await enlazarDatosReales(admin, fila.studio_id, html);
    return new NextResponse(html, { headers: { 'Content-Type': tipo } });
  }
  if (tipo.startsWith('text/css')) {
    const css = reescribirCss(new TextDecoder().decode(bytes), rutaPedida, esRelativoDeRuta);
    return new NextResponse(css, { headers: { 'Content-Type': tipo } });
  }
  // Assets (imágenes, fuentes, vídeo): bytes tal cual, sin tocar ni un byte —
  // el punto 8 del encargo ("no reemplazar assets, no cambiar dimensiones").
  return new NextResponse(new Blob([bytes as Uint8Array<ArrayBuffer>]), {
    headers: { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=1200' },
  });
}

// «TEMA ORIGINAL + TENTARE DATA → THEME RENDERER» (punto 12 del encargo): el
// nombre/color/fotos del estudio real, enlazados en cada petición sobre el
// HTML tal cual vino del ZIP — ver `lib/theme-import/enlazar-datos.ts` para
// el porqué exacto de qué se enlaza y qué NO (la lista de clases del tema,
// bloqueada por el sandbox del iframe sin `allow-same-origin`, decisión
// explícita de seguridad, no un olvido).
async function enlazarDatosReales(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  studioId: string,
  html: string,
): Promise<string> {
  const { data: estudio } = await admin
    .from('studios')
    .select('nombre, color_primario, foto_url, imagen_bienvenida_url')
    .eq('id', studioId)
    .maybeSingle();
  if (!estudio) return html;

  const propias = [estudio.imagen_bienvenida_url, estudio.foto_url] as (string | null | undefined)[];
  const conDatos = enlazarPropsDeclarados(html, {
    studioName: estudio.nombre ?? undefined,
    brand: estudio.color_primario ?? undefined,
  });
  return enlazarFotosDeSlots(conDatos, {
    // Huecos distintos por slot: da variedad al fallback de stock cuando el
    // estudio no ha subido foto propia, sin fingir que son fotos distintas
    // cuando sí la ha subido (`imagenDeEstudio` prioriza siempre la propia).
    welcomeHero: imagenDeEstudio('portada', propias, studioId),
    homeHero: imagenDeEstudio('banner', propias, studioId),
    centroFachada: imagenDeEstudio('banda', propias, studioId),
    // `avatarPerfil` se deja SIN enlazar a propósito: este render no tiene
    // sesión de socia (es la vista previa del editor, no el portal real), así
    // que no hay ninguna foto de perfil real que poner.
  });
}
