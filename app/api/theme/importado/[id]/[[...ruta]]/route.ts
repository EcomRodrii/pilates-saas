import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { borrarPrefijoR2, subirObjetoR2 } from '@/lib/r2';
import { servirFicheroTema, contenidoFuenteDeFichero, type FilaTemaImportado } from '@/lib/theme-import/servir';
import { resolverPreviewEnVivo } from '@/lib/theme-import/preview-en-vivo';
import { contentTypeDe } from '@/lib/theme-import/content-type';
import { extraerColorDeclarado } from '@/lib/theme-import/extraer-tema';
import { verificarTokenPreviewHome } from '@/lib/theme/home-preview-token';
import { verificarSesionStaff } from '@/lib/auth-server';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';
import { errorInterno } from '@/lib/errores-servidor';
import { guardarBorradorTheme, getThemeBorrador } from '@/lib/theme-data';
import { instalarTema } from '@/lib/theme-schema';
import type { ImportedThemeManifest } from '@/lib/theme-import/manifest';

/** Límite de tamaño de un fichero editado a mano — el importador de ZIP
 *  tampoco tenía uno explícito hasta ahora; este es el primero, no un hueco
 *  reabierto. 2 MB es sobrado para HTML/CSS escrito por una persona. */
const LIMITE_FICHERO_EDITADO_BYTES = 2 * 1024 * 1024;

export const runtime = 'nodejs';

// GET /api/theme/importado/[id]/[...ruta]?t=<token> — sirve un tema
// importado TAL CUAL, byte a byte, dentro del iframe en sandbox del editor.
// La resolución de fichero/reescritura/datos reales vive en
// `lib/theme-import/servir.ts`, compartida con el origen público
// (`app/tema-publicado/[slug]/[[...ruta]]/route.ts`).
//
// ⚠️ SEGURIDAD — por qué esto NO usa la sesión de staff normal (cookies):
// este endpoint sirve código que subió la PROPIETARIA de un ZIP externo, y el
// iframe que lo carga va SIN `allow-same-origin` (ver
// `components/theme/importar-tema-zip.tsx`) precisamente para que un script
// del ZIP no pueda leer las cookies de sesión de este dominio ni hacer fetch
// autenticado contra el resto de la API. Este endpoint, en su lado servidor,
// se protege con el MISMO token firmado y de corta duración que ya usa
// `/portal-preview/[slug]` (`lib/theme/home-preview-token.ts`) — no depende
// de cookies, así que sirve igual con o sin `allow-same-origin`.
//
// Esta ruta sirve CUALQUIER estado (borrador o publicado) del tema del
// estudio que abrió el token — es la vista previa del panel, no el portal
// público. El origen dedicado (`imports.tentare.app`) solo sirve el tema
// `publicado = true`, y sin token: ver el comentario de seguridad en esa
// ruta para el porqué del aislamiento por origen en vez de por sandbox.
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
    .select('studio_id, storage_prefix, entry_html, estado, manifest, rutas_editadas')
    .eq('id', id)
    .maybeSingle<FilaTemaImportado>();
  if (!fila || fila.studio_id !== verificado.studioId) {
    return new NextResponse('No encontrado', { status: 404 });
  }

  const rutaPedida = ruta && ruta.length > 0 ? ruta.join('/') : null;

  // `?crudo=1` — el texto FUENTE de un fichero HTML/CSS, para el editor de
  // código. Sin esto, "editar" partiría del HTML ya reescrito (URLs
  // absolutas, nombre del estudio ya enlazado) y lo guardaría contaminado.
  if (req.nextUrl.searchParams.get('crudo') === '1') {
    if (!rutaPedida) return NextResponse.json({ error: 'Falta la ruta del fichero' }, { status: 400 });
    const fuente = await contenidoFuenteDeFichero(fila, rutaPedida);
    if (!fuente) return NextResponse.json({ error: 'No encontrado o no es HTML/CSS' }, { status: 404 });
    return NextResponse.json(fuente);
  }

  return servirFicheroTema(
    admin, fila, rutaPedida,
    (rutaResuelta) => `/api/theme/importado/${id}/${rutaResuelta}?t=${encodeURIComponent(token!)}`,
  );
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

// PATCH /api/theme/importado/[id] — body { accion: 'publicar' | 'despublicar' | 'extraer' }.
//
// «Publicar» marca cuál de los ZIP subidos es «el elegido» (a lo más uno por
// estudio, ver el índice único de la migración) — y desde que existe el
// origen dedicado (`imports.tentare.app`), publicar SÍ lo hace visible para
// cualquier visitante de `imports.tentare.app/<slug>`. El panel
// (`tentare.app`) nunca sirve el HTML del ZIP fuera del iframe en sandbox de
// esta misma ruta — el aislamiento lo da el origen distinto, no el panel.
//
// «Extraer» es la vía real para lo que de verdad se pidió — un tema NATIVO,
// visualmente editable y publicable como "Tu tema" — sin reabrir el
// aislamiento de origen del ZIP (ver el comentario de seguridad de
// `app/tema-publicado/[slug]/[[...ruta]]/route.ts`): lee el color de marca
// DECLARADO por el diseño (`extraerColorDeclarado`, del HTML fuente sin
// enlazar) e instala un tema nativo nuevo con ese color, en el MISMO camino
// que "Usar" en la Biblioteca (`instalarTema` + `guardarBorradorTheme`) —
// borrador, nunca publicado solo. El ZIP en sí se queda intacto, sandboxed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; ruta?: string[] }> }) {
  const auth = await autorizarEscritura(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const accion = body?.accion;
  if (accion !== 'publicar' && accion !== 'despublicar' && accion !== 'extraer') {
    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });

  const { data: fila } = await admin
    .from('theme_imports')
    .select('studio_id, estado, entry_html, manifest, rutas_editadas')
    .eq('id', id)
    .maybeSingle<FilaTemaImportado>();
  if (!fila || fila.studio_id !== auth.studioId) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  if (accion === 'extraer') {
    if (fila.estado !== 'listo' || !fila.entry_html) {
      return NextResponse.json({ error: 'Este tema no se pudo importar en modo estático.' }, { status: 409 });
    }
    const fuente = await contenidoFuenteDeFichero(fila, fila.entry_html);
    const color = fuente ? extraerColorDeclarado(fuente.contenido) : null;
    if (!color) {
      return NextResponse.json({ error: 'Este tema no declara un color de marca extraíble.' }, { status: 422 });
    }
    const draftActual = await getThemeBorrador(auth.studioId);
    const nuevo = instalarTema(draftActual, { primary: color }, { themeId: 'importado', themeVersion: 1 });
    await guardarBorradorTheme(auth.studioId, nuevo);
    return NextResponse.json({ ok: true, primary: color });
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

// PUT /api/theme/importado/[id]/<ruta> — guarda una edición de un fichero
// HTML/CSS del tema. Body: { contenido: string }.
//
// Nunca sobrescribe el original: sube a `storage_prefix + 'editado/' +
// ruta` (`lib/theme-import/servir.ts` ya sabe leer de ahí si
// `rutas_editadas` lo incluye) y añade `ruta` a esa lista. Solo HTML/CSS —
// el usuario pidió explícitamente "editor de código real (HTML/CSS)", no un
// editor de JS/imágenes/config del tema.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; ruta?: string[] }> }) {
  const auth = await autorizarEscritura(req);
  if (!auth.ok) return auth.res;

  const { id, ruta } = await params;
  if (!ruta || ruta.length === 0) {
    return NextResponse.json({ error: 'Falta la ruta del fichero a guardar' }, { status: 400 });
  }
  const rutaPedida = ruta.join('/');

  const body = await req.json().catch(() => null);
  const contenido = body?.contenido;
  if (typeof contenido !== 'string') {
    return NextResponse.json({ error: 'Falta el contenido' }, { status: 400 });
  }
  const bytes = new TextEncoder().encode(contenido);
  if (bytes.length > LIMITE_FICHERO_EDITADO_BYTES) {
    return NextResponse.json({ error: 'El fichero supera el límite de 2 MB' }, { status: 413 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });

  const { data: fila } = await admin
    .from('theme_imports')
    .select('studio_id, storage_prefix, manifest, rutas_editadas')
    .eq('id', id)
    .maybeSingle();
  if (!fila || fila.studio_id !== auth.studioId) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const manifest = fila.manifest as ImportedThemeManifest;
  const fichero = manifest.ficheros.find((f) => f.ruta === rutaPedida);
  if (!fichero || (fichero.clase !== 'html' && fichero.clase !== 'css')) {
    return NextResponse.json({ error: 'Solo se puede editar HTML o CSS del tema.' }, { status: 400 });
  }

  try {
    await subirObjetoR2(`${fila.storage_prefix}editado/${rutaPedida}`, bytes, contentTypeDe(rutaPedida));
  } catch (e) {
    return errorInterno('theme:importado:guardar-fichero', e, 'No se ha podido guardar el fichero.');
  }

  const rutasEditadas: string[] = fila.rutas_editadas ?? [];
  if (!rutasEditadas.includes(rutaPedida)) {
    const { error } = await admin
      .from('theme_imports')
      .update({ rutas_editadas: [...rutasEditadas, rutaPedida] })
      .eq('id', id);
    if (error) return errorInterno('theme:importado:guardar-fichero:marcar', error, 'El fichero se subió pero no se pudo registrar.');
  }

  return NextResponse.json({ ok: true });
}

// POST /api/theme/importado/[id] — vista previa EN VIVO, sin persistir.
// Body: { ruta: string, contenido: string, token: string }.
//
// `token` es el MISMO token de preview que ya usa el `GET` — aquí no
// autentica la petición (esta ya lo está, por sesión de staff normal), solo
// se reutiliza para construir las URLs de assets (imágenes/fuentes) que
// referencia la página, para no inventar un segundo mecanismo de firma.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; ruta?: string[] }> }) {
  const auth = await autorizarEscritura(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const ruta = body?.ruta;
  const contenido = body?.contenido;
  const token = body?.token;
  if (typeof ruta !== 'string' || typeof contenido !== 'string' || typeof token !== 'string') {
    return NextResponse.json({ error: 'Faltan datos de la vista previa' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servicio no disponible' }, { status: 503 });

  const { data: fila } = await admin
    .from('theme_imports')
    .select('studio_id, storage_prefix, entry_html, estado, manifest, rutas_editadas')
    .eq('id', id)
    .maybeSingle<FilaTemaImportado>();
  if (!fila || fila.studio_id !== auth.studioId) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  return resolverPreviewEnVivo(
    admin, fila, { ruta, contenido },
    (rutaResuelta) => `/api/theme/importado/${id}/${rutaResuelta}?t=${encodeURIComponent(token)}`,
  );
}
