import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mapFilaAMedia, type FilaRedPerfilMedia } from '@/lib/network/mapeo';
import { PORTFOLIO_MAX_FOTOS, type MediaNetwork } from '@/lib/network/tipos';

// Portfolio de fotos (F1) — CRUD mínimo: GET/POST/DELETE, sin PATCH de
// reordenar (V1: el orden es el de subida, ver comentario de `orden` en
// insert() más abajo). Mismo patrón que app/api/network/experiencia/route.ts
// (editar es borrar y volver a subir).
//
// El bucket que guarda las fotos (`red-documentos-identidad`) es PRIVADO
// —lib/network/portfolio-storage.ts explica por qué no es el bucket público
// `avatars`—, así que toda lectura pasa por una URL firmada generada aquí
// con service_role. 1 hora de caducidad: la propietaria puede tener la
// pantalla abierta un rato; para el perfil público (visitas de un momento)
// ver la misma constante en lib/network/publico.ts.
const BUCKET = 'red-documentos-identidad';
const CADUCIDAD_URL_SEGUNDOS = 3600;
const COLUMNAS = 'id, perfil_id, path, orden, creado_en';

async function propioPerfilId(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string): Promise<string | null> {
  const { data } = await admin!.from('red_perfiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

async function firmarFotos(
  admin: ReturnType<typeof getSupabaseAdmin>, filas: FilaRedPerfilMedia[],
): Promise<MediaNetwork[]> {
  if (filas.length === 0) return [];
  const { data: firmadas, error } = await admin!.storage
    .from(BUCKET)
    .createSignedUrls(filas.map(f => f.path), CADUCIDAD_URL_SEGUNDOS);
  if (error || !firmadas) return [];
  // createSignedUrls devuelve un resultado por path EN EL MISMO ORDEN que se
  // pidió — se hace por índice y no por buscar el path de vuelta, porque un
  // path repetido (no debería pasar, pero) rompería un `.find()`.
  return filas
    .map((f, i) => (firmadas[i]?.signedUrl ? mapFilaAMedia(f, firmadas[i].signedUrl) : null))
    .filter((m): m is MediaNetwork => m !== null);
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return NextResponse.json({ fotos: [] });

  const { data, error } = await admin
    .from('red_perfil_media')
    .select(COLUMNAS)
    .eq('perfil_id', perfilId)
    .order('orden', { ascending: true })
    .order('creado_en', { ascending: true });
  if (error) return errorInterno('network:portfolio:GET', error, 'No se han podido cargar tus fotos.');

  const fotos = await firmarFotos(admin, data as unknown as FilaRedPerfilMedia[]);
  return NextResponse.json({ fotos });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('Crea tu perfil antes de añadir fotos.', 404);

  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === 'string' ? body.path : '';
  if (!path) return errorPeticion('Falta la foto.');
  // Defensa en profundidad: la RLS de storage ya obliga a que el primer
  // segmento del path sea el propio auth.uid() al SUBIR, pero esta fila la
  // crea el cliente con datos que él controla — nunca fiarse de que el path
  // que dice haber subido es realmente suyo.
  if (!path.startsWith(`${usuario.userId}/portfolio-`)) return errorPeticion('La foto no es válida.');

  const { count, error: errConteo } = await admin
    .from('red_perfil_media')
    .select('id', { count: 'exact', head: true })
    .eq('perfil_id', perfilId);
  if (errConteo) return errorInterno('network:portfolio:POST:conteo', errConteo, 'No se ha podido guardar la foto.');
  if ((count ?? 0) >= PORTFOLIO_MAX_FOTOS) return errorPeticion(`Ya tienes el máximo de ${PORTFOLIO_MAX_FOTOS} fotos.`, 409);

  const { data, error } = await admin
    .from('red_perfil_media')
    .insert({
      id: `redmedia-${uid()}`,
      perfil_id: perfilId,
      path,
      orden: count ?? 0,
    })
    .select(COLUMNAS)
    .single();
  if (error) return errorInterno('network:portfolio:POST', error, 'No se ha podido guardar la foto.');

  const [foto] = await firmarFotos(admin, [data as unknown as FilaRedPerfilMedia]);
  if (!foto) return errorInterno('network:portfolio:POST:firma', new Error('sin URL firmada'), 'La foto se guardó pero no se ha podido mostrar. Recarga la página.');

  return NextResponse.json({ foto });
}

export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return errorPeticion('Falta el id.');

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('No tienes ningún perfil.', 404);

  // La RLS de la tabla ya acota el UPDATE/DELETE a la dueña, pero el mensaje
  // de error para "esto no es tuyo" debe ser claro, no un 500 genérico — se
  // busca la fila primero, acotada al perfil propio (nunca solo por `id`).
  const { data: fila, error: errBuscar } = await admin
    .from('red_perfil_media')
    .select('id, path')
    .eq('id', id)
    .eq('perfil_id', perfilId)
    .maybeSingle();
  if (errBuscar) return errorInterno('network:portfolio:DELETE:buscar', errBuscar, 'No se ha podido eliminar la foto.');
  if (!fila) return errorPeticion('Esa foto no existe o no es tuya.', 404);

  const { error: errStorage } = await admin.storage.from(BUCKET).remove([fila.path as string]);
  if (errStorage) return errorInterno('network:portfolio:DELETE:storage', errStorage, 'No se ha podido eliminar la foto.');

  const { error } = await admin
    .from('red_perfil_media')
    .delete()
    .eq('id', id)
    .eq('perfil_id', perfilId); // nunca confiar en que el id venga ya acotado al perfil propio
  if (error) return errorInterno('network:portfolio:DELETE', error, 'No se ha podido eliminar la foto.');

  return NextResponse.json({ ok: true });
}
