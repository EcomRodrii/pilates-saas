import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { mapFilaAPerfilPublico, type FilaRedPerfilPublica } from '@/lib/network/mapeo';
import type { EstudioListadoPublico } from '@/lib/network/publico-estudios';

// Favoritos de la ALUMNA (estudio o instructora) en Tentare Network — F3
// pieza 2. Tabla dedicada `red_favoritos_alumna`, distinta de `red_favoritos`
// (esa es unidireccional estudio→instructora, con GET acotado a
// verificarSesionStaff en app/api/network/favoritos/route.ts, que se usa
// aquí como plantilla exacta de estructura). Auth con
// verificarUsuarioSupabase (JWT de Supabase Auth de una alumna, sin
// studioId de staff) — nunca verificarSesionStaff.
//
// ⚠️ Riesgo de seguridad explícito (ver migración 20260824230509): esta
// lista NUNCA debe filtrarse a nadie que no sea la propia alumna. El GET
// filtra SIEMPRE por auth_user_id = sesion.userId — nunca una consulta sin
// ese filtro.
const SELECT_COLUMNAS_PUBLICAS_PERFIL = `
  id, slug, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, estado, destacado, identidad_verificada_en,
  creado_en, actualizado_en, ultimo_acceso_en, lat, lng
`;

const SELECT_COLUMNAS_LISTADO_ESTUDIO = 'id, nombre, ciudad, slug, descripcion, logo_url, foto_url, lat, lng';

interface FilaEstudioListado {
  id: string;
  nombre: string;
  ciudad: string | null;
  slug: string | null;
  descripcion: string | null;
  logo_url: string | null;
  foto_url: string | null;
  lat: number | null;
  lng: number | null;
}

function mapFilaAEstudioListado(f: FilaEstudioListado): EstudioListadoPublico | null {
  if (!f.slug) return null;
  return {
    id: f.id, nombre: f.nombre, ciudad: f.ciudad, slug: f.slug, descripcion: f.descripcion,
    logoUrl: f.logo_url, fotoUrl: f.foto_url, lat: f.lat, lng: f.lng,
  };
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarUsuarioSupabase(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: favoritos, error: errFav } = await admin
    .from('red_favoritos_alumna').select('tipo, studio_id, perfil_id').eq('auth_user_id', sesion.userId);
  if (errFav) return errorInterno('network:alumna:favoritos:GET:lista', errFav, 'No se han podido cargar tus favoritos.');

  const studioIds = (favoritos ?? []).filter(f => f.tipo === 'estudio').map(f => f.studio_id as string);
  const perfilIds = (favoritos ?? []).filter(f => f.tipo === 'instructora').map(f => f.perfil_id as string);

  let estudios: EstudioListadoPublico[] = [];
  if (studioIds.length > 0) {
    // `visible_en_network` es un opt-in apagado por defecto: un estudio que
    // se ha salido del directorio no puede seguir apareciendo aquí solo
    // porque alguien lo marcó como favorito antes. Mismo filtro que el único
    // camino legítimo de lectura (lib/network/publico-estudios.ts).
    const { data, error } = await admin.from('studios')
      .select(SELECT_COLUMNAS_LISTADO_ESTUDIO)
      .eq('visible_en_network', true)
      .in('id', studioIds);
    if (error) return errorInterno('network:alumna:favoritos:GET:estudios', error, 'No se han podido cargar tus favoritos.');
    estudios = ((data ?? []) as unknown as FilaEstudioListado[])
      .map(mapFilaAEstudioListado)
      .filter((e): e is EstudioListadoPublico => e !== null);
  }

  let perfiles: ReturnType<typeof mapFilaAPerfilPublico>[] = [];
  if (perfilIds.length > 0) {
    // Igual con los perfiles: uno despublicado o suspendido por moderación
    // deja de mostrarse aunque siga en la lista de favoritos.
    const { data, error } = await admin.from('red_perfiles')
      .select(SELECT_COLUMNAS_PUBLICAS_PERFIL)
      .eq('estado', 'published')
      .in('id', perfilIds);
    if (error) return errorInterno('network:alumna:favoritos:GET:perfiles', error, 'No se han podido cargar tus favoritos.');
    perfiles = ((data ?? []) as unknown as FilaRedPerfilPublica[]).map(f => mapFilaAPerfilPublico(f, false));
  }

  return NextResponse.json({ estudios, perfiles });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarUsuarioSupabase(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { tipo?: unknown; id?: unknown } | null;
  const tipo = body?.tipo === 'estudio' || body?.tipo === 'instructora' ? body.tipo : null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!tipo || !id) return errorPeticion('Falta el estudio o la instructora.');

  const columnaId = tipo === 'estudio' ? 'studio_id' : 'perfil_id';

  const { data: existente } = await admin
    .from('red_favoritos_alumna').select('id')
    .eq('auth_user_id', sesion.userId).eq('tipo', tipo).eq(columnaId, id).maybeSingle();

  if (existente) {
    const { error } = await admin.from('red_favoritos_alumna').delete().eq('id', existente.id);
    if (error) return errorInterno('network:alumna:favoritos:POST:quitar', error, 'No se ha podido quitar de favoritos.');
    return NextResponse.json({ ok: true, favorito: false });
  }

  // Solo al AÑADIR: no se puede marcar como favorito lo que no está en el
  // directorio. La FK de la migración solo comprueba EXISTENCIA, no
  // visibilidad. Quitar sí se permite siempre — si el estudio se salió de
  // Network después, la alumna tiene que poder deshacerse de la fila.
  const visible = tipo === 'estudio'
    ? await admin.from('studios').select('id').eq('id', id).eq('visible_en_network', true).maybeSingle()
    : await admin.from('red_perfiles').select('id').eq('id', id).eq('estado', 'published').maybeSingle();
  if (!visible.data) return errorPeticion('No está disponible en Network.');

  // `id` no se pasa: la columna es `uuid default gen_random_uuid()`, mismo
  // motivo que ya documenta app/api/network/favoritos/route.ts.
  const { error } = await admin.from('red_favoritos_alumna').insert({
    auth_user_id: sesion.userId, tipo, [columnaId]: id,
  });
  if (error) return errorInterno('network:alumna:favoritos:POST:anadir', error, 'No se ha podido añadir a favoritos.');
  return NextResponse.json({ ok: true, favorito: true });
}
