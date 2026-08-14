import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { borrarPrefijoR2 } from '@/lib/r2';
import { servirFicheroTema, type FilaTemaImportado } from '@/lib/theme-import/servir';
import { verificarTokenPreviewHome } from '@/lib/theme/home-preview-token';
import { verificarSesionStaff } from '@/lib/auth-server';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';
import { errorInterno } from '@/lib/errores-servidor';

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
    .select('studio_id, storage_prefix, entry_html, estado, manifest')
    .eq('id', id)
    .maybeSingle<FilaTemaImportado>();
  if (!fila || fila.studio_id !== verificado.studioId) {
    return new NextResponse('No encontrado', { status: 404 });
  }

  const rutaPedida = ruta && ruta.length > 0 ? ruta.join('/') : null;
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

// PATCH /api/theme/importado/[id] — body { accion: 'publicar' | 'despublicar' }.
//
// «Publicar» marca cuál de los ZIP subidos es «el elegido» (a lo más uno por
// estudio, ver el índice único de la migración) — y desde que existe el
// origen dedicado (`imports.tentare.app`), publicar SÍ lo hace visible para
// cualquier visitante de `imports.tentare.app/<slug>`. El panel
// (`tentare.app`) nunca sirve el HTML del ZIP fuera del iframe en sandbox de
// esta misma ruta — el aislamiento lo da el origen distinto, no el panel.
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
