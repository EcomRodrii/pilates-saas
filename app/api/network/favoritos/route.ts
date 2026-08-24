import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { mapFilaAPerfilPublico, type FilaRedPerfilPublica } from '@/lib/network/mapeo';

// Favoritos de Tentare Network — brief §19 ("Network → Buscar instructoras /
// Mis favoritas / Solicitudes"). Mismo criterio de auth que el buscador
// (verificarSesionStaff, cualquier rol del panel, no solo propietaria) y
// mismas columnas públicas que el resto de vistas de candidatas — nunca
// contacto privado en un listado (docs/NETWORK-AUDIT.md §4).
const SELECT_COLUMNAS_PUBLICAS = `
  id, slug, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, estado, destacado, identidad_verificada_en,
  creado_en, actualizado_en, ultimo_acceso_en, lat, lng
`;

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: favoritos, error: errFav } = await admin
    .from('red_favoritos').select('perfil_id').eq('studio_id', sesion.studioId);
  if (errFav) return errorInterno('network:favoritos:GET:lista', errFav, 'No se han podido cargar tus favoritas.');

  const ids = (favoritos ?? []).map(f => f.perfil_id as string);
  if (ids.length === 0) return NextResponse.json({ perfiles: [] });

  const { data, error } = await admin
    .from('red_perfiles').select(SELECT_COLUMNAS_PUBLICAS).in('id', ids);
  if (error) return errorInterno('network:favoritos:GET:perfiles', error, 'No se han podido cargar tus favoritas.');

  const perfiles = ((data ?? []) as unknown as FilaRedPerfilPublica[]).map(f => mapFilaAPerfilPublico(f, false));
  return NextResponse.json({ perfiles });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { perfilId?: unknown } | null;
  const perfilId = typeof body?.perfilId === 'string' ? body.perfilId : null;
  if (!perfilId) return errorPeticion('Falta el perfil.');

  const { data: existente } = await admin
    .from('red_favoritos').select('id').eq('studio_id', sesion.studioId).eq('perfil_id', perfilId).maybeSingle();

  if (existente) {
    const { error } = await admin.from('red_favoritos').delete().eq('id', existente.id);
    if (error) return errorInterno('network:favoritos:POST:quitar', error, 'No se ha podido quitar de favoritas.');
    return NextResponse.json({ ok: true, favorito: false });
  }

  // `id` no se pasa: la columna es `uuid default gen_random_uuid()` — `uid()`
  // de lib/utils.ts genera un string que no es UUID válido (22P02), es para
  // columnas `text`.
  const { error } = await admin.from('red_favoritos').insert({
    studio_id: sesion.studioId, perfil_id: perfilId, creado_por: sesion.userId,
  });
  if (error) return errorInterno('network:favoritos:POST:anadir', error, 'No se ha podido añadir a favoritas.');
  return NextResponse.json({ ok: true, favorito: true });
}
