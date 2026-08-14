import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { descargarObjetoR2, borrarPrefijoR2 } from '@/lib/r2';
import { contentTypeDe } from '@/lib/theme-import/content-type';
import { reescribirHtml, reescribirCss } from '@/lib/theme-import/reescribir-rutas';
import { enlazarPropsDeclarados, enlazarFotosDeSlots } from '@/lib/theme-import/enlazar-datos';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
import { verificarTokenPreviewHome } from '@/lib/theme/home-preview-token';
import { verificarSesionStaff } from '@/lib/auth-server';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';
import { errorInterno } from '@/lib/errores-servidor';
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

// Gate de escritura compartido por PATCH/DELETE — mismo trío que ya usa
// `POST /api/theme/importar-zip`: sesión de staff, solo PROPIETARIO, y el
// plan tiene que incluir la app de marca. Es la MISMA feature, otra acción.
async function autorizarEscritura(req: NextRequest): Promise<
  { ok: true; studioId: string } | { ok: false; res: NextResponse }
> {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { ok: false, res: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  if (sesion.rol !== 'PROPIETARIO') {
    return {
      ok: false,
      res: NextResponse.json({ error: 'Solo el propietario puede gestionar temas importados' }, { status: 403 }),
    };
  }
  if (!(await featureDeEstudio(sesion.studioId, 'marca'))) {
    return { ok: false, res: NextResponse.json({ error: 'Tu plan no incluye la app de marca personalizada' }, { status: 403 }) };
  }
  return { ok: true, studioId: sesion.studioId };
}

// PATCH /api/theme/importado/[id] — body { accion: 'publicar' | 'despublicar' }.
//
// «Publicar» es un estado INTERNO del panel: marca cuál de los ZIP subidos es
// «el elegido» (a lo más uno por estudio, ver el índice único de la
// migración). NO lo hace visible para ninguna socia real — no existe hoy
// ninguna ruta que sirva un tema importado fuera del iframe en sandbox del
// editor (ver el comentario de seguridad arriba, en el `GET`). Servirlo de
// verdad en el portal público es una decisión de seguridad/infra aparte,
// explícitamente no tomada aquí.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ruta?: string[] }> }) {
  const auth = await autorizarEscritura(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const accion = body?.accion;
  if (accion !== 'publicar' && accion !== 'despublicar') {
    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });

  const { data: fila } = await admin
    .from('theme_imports')
    .select('studio_id, estado')
    .eq('id', id)
    .maybeSingle();
  if (!fila || fila.studio_id !== auth.studioId) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  if (accion === 'publicar') {
    if (fila.estado !== 'listo') {
      return NextResponse.json({ error: 'Solo se puede publicar un tema importado correctamente.' }, { status: 409 });
    }
    // Despublica cualquier otro tema del estudio ANTES de publicar este: el
    // índice único (`theme_imports_un_publicado_por_estudio`) lo exige, y
    // hacerlo en dos pasos explícitos deja claro qué pasó si algo falla a
    // medias, en vez de depender de un UPSERT que pise en silencio.
    const { error: errDespublicar } = await admin
      .from('theme_imports')
      .update({ publicado: false, publicado_en: null })
      .eq('studio_id', auth.studioId)
      .eq('publicado', true);
    if (errDespublicar) {
      return errorInterno('theme:importado:publicar:despublicar-otros', errDespublicar, 'No se ha podido publicar el tema.');
    }
  }

  const { error } = await admin
    .from('theme_imports')
    .update({ publicado: accion === 'publicar', publicado_en: accion === 'publicar' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) return errorInterno('theme:importado:publicar', error, 'No se ha podido guardar el cambio.');

  return NextResponse.json({ ok: true });
}

// DELETE /api/theme/importado/[id] — borra el ZIP importado entero: la fila
// y todos sus ficheros en R2 (`borrarPrefijoR2`, best-effort). Se puede
// borrar un tema publicado igual que uno en borrador — no hay ninguna
// invariante de "el estudio siempre necesita un ZIP activo": el tema real
// del estudio sigue viviendo en `studio_theme`, esto es solo la biblioteca de
// ZIPs subidos.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; ruta?: string[] }> }) {
  const auth = await autorizarEscritura(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });

  const { data: fila } = await admin
    .from('theme_imports')
    .select('studio_id, storage_prefix')
    .eq('id', id)
    .maybeSingle();
  if (!fila || fila.studio_id !== auth.studioId) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const { error } = await admin.from('theme_imports').delete().eq('id', id);
  if (error) return errorInterno('theme:importado:borrar', error, 'No se ha podido borrar el tema importado.');

  await borrarPrefijoR2(fila.storage_prefix).catch(() => {});
  return NextResponse.json({ ok: true });
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
