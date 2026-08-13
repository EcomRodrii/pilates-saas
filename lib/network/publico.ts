// Capa de datos pública de Tentare Network — server-only, service_role.
//
// docs/NETWORK-AUDIT-2.md §11: nada en el repo consulta red_perfiles
// directamente desde el navegador (siempre vía API routes con
// getSupabaseAdmin(), que ya bypasea RLS). Abrir RLS a `anon` sería
// redundante Y arriesgado — RLS es por FILA, no por columna, y un SELECT *
// como anon vería email_contacto/telefono_contacto de perfiles publicados.
// En su lugar, estas funciones son la ÚNICA fuente de columnas públicas
// (nunca seleccionan contacto/auth_user_id) y las usan tanto:
//   - las páginas públicas nuevas (app/network/instructoras/*, Server
//     Components, sin sesión — el marketplace indexable en Google), como
//   - las rutas de API ya existentes del panel de la propietaria
//     (app/api/network/buscar, app/api/network/perfil/[id]), que solo
//     añaden el guard de sesión de staff por encima.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapFilaAPerfilPublico, mapFilaAExperienciaPublica,
  type FilaRedPerfilPublica, type FilaRedExperiencia,
} from './mapeo.ts';
import { ordenarResultadosNetwork } from './ranking.ts';
import {
  emailVerificado, experienciaVerificada, referenciaProfesional, identidadVerificada, activaRecientemente,
} from './badges.ts';
import {
  esEspecialidadValida, esHorarioValido, esTipoTrabajoValido, esDisponibilidadEstadoValido,
} from './catalogo.ts';
import type { FiltroBusquedaNetwork, PerfilNetworkPublico, ExperienciaNetworkPublica, BadgesNetwork } from './tipos.ts';

const SELECT_COLUMNAS_PUBLICAS = `
  id, slug, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, estado, identidad_verificada_en,
  creado_en, actualizado_en, ultimo_acceso_en
`;

// Tope sin paginar: mismo criterio pragmático que otros listados de este
// repo (memoria "conciliador-es-el-camino-principal"). Paginar de verdad es
// prematuro antes de tener volumen que lo justifique.
const LIMITE_RESULTADOS = 200;

export function filtroDesdeSearchParams(sp: URLSearchParams): FiltroBusquedaNetwork {
  const listaParam = (clave: string): string[] => {
    const valor = sp.get(clave);
    return valor ? valor.split(',').map(v => v.trim()).filter(Boolean) : [];
  };
  const experienciaMinimaRaw = sp.get('experienciaMinima');
  return {
    ciudad: sp.get('ciudad')?.trim() || null,
    especialidades: listaParam('especialidades').filter(esEspecialidadValida) as FiltroBusquedaNetwork['especialidades'],
    disponibilidad: listaParam('disponibilidad').filter(esDisponibilidadEstadoValido) as FiltroBusquedaNetwork['disponibilidad'],
    horarios: listaParam('horarios').filter(esHorarioValido) as FiltroBusquedaNetwork['horarios'],
    tipoTrabajo: listaParam('tipoTrabajo').filter(esTipoTrabajoValido) as FiltroBusquedaNetwork['tipoTrabajo'],
    experienciaMinima: experienciaMinimaRaw && Number.isFinite(Number(experienciaMinimaRaw)) ? Number(experienciaMinimaRaw) : null,
  };
}

export async function buscarPerfilesPublico(
  admin: SupabaseClient, filtro: FiltroBusquedaNetwork,
): Promise<{ perfiles: PerfilNetworkPublico[] } | { error: unknown }> {
  // order() antes de limit(): sin un orden explícito el recorte a
  // LIMITE_RESULTADOS no es determinista (Postgres no garantiza el orden de
  // un SELECT sin ORDER BY).
  let query = admin
    .from('red_perfiles')
    .select(SELECT_COLUMNAS_PUBLICAS)
    .eq('estado', 'published')
    .order('actualizado_en', { ascending: false })
    .limit(LIMITE_RESULTADOS);

  if (filtro.ciudad) query = query.ilike('ciudad', `%${filtro.ciudad}%`);
  if (filtro.especialidades.length > 0) query = query.overlaps('especialidades', filtro.especialidades);
  if (filtro.disponibilidad.length > 0) query = query.in('disponibilidad_estado', filtro.disponibilidad);
  if (filtro.horarios.length > 0) query = query.overlaps('disponibilidad_horarios', filtro.horarios);
  if (filtro.tipoTrabajo.length > 0) query = query.overlaps('tipo_trabajo', filtro.tipoTrabajo);
  if (filtro.experienciaMinima != null) query = query.gte('anios_experiencia', filtro.experienciaMinima);

  const { data, error } = await query;
  if (error) return { error };

  const filas = (data ?? []) as unknown as FilaRedPerfilPublica[];

  // Badge "Experiencia verificada" en LOTE: una única query con
  // `.in(perfil_id)` para los N perfiles del resultado, nunca una consulta
  // por tarjeta — el resto de badges exige un lookup de Auth por persona y
  // se queda solo en el detalle de un perfil (obtenerPerfilPublico).
  const ids = filas.map(f => f.id);
  const { data: experienciasConfirmadas } = ids.length
    ? await admin.from('red_experiencias').select('perfil_id').in('perfil_id', ids).eq('estado_verificacion', 'confirmada')
    : { data: [] as { perfil_id: string }[] };
  const perfilesConExperienciaVerificada = new Set((experienciasConfirmadas ?? []).map(e => e.perfil_id as string));

  const perfiles = filas.map(f => mapFilaAPerfilPublico(f, perfilesConExperienciaVerificada.has(f.id)));
  return { perfiles: ordenarResultadosNetwork(perfiles, filtro) };
}

export interface DetallePerfilPublico {
  perfil: PerfilNetworkPublico;
  experiencias: ExperienciaNetworkPublica[];
  badges: BadgesNetwork;
}

async function detallePerfilDesdeFila(
  admin: SupabaseClient, data: Record<string, unknown>,
): Promise<DetallePerfilPublico | { error: unknown }> {
  const id = data.id as string;

  const { data: experienciasData, error: errExp } = await admin
    .from('red_experiencias')
    .select('id, studio_id, nombre_estudio, fecha_inicio, fecha_fin, especialidades, descripcion, estado_verificacion, creado_en')
    .eq('perfil_id', id)
    .order('fecha_inicio', { ascending: false });
  if (errExp) return { error: errExp };

  const experiencias = ((experienciasData ?? []) as unknown as Omit<FilaRedExperiencia, 'perfil_id'>[]).map(mapFilaAExperienciaPublica);

  // `auth_user_id` se pide APARTE (nunca en SELECT_COLUMNAS_PUBLICAS) solo
  // para resolver si el email de la cuenta está confirmado — un único
  // perfil, un único lookup, no el N+1 que sería hacerlo en un listado.
  const [{ data: filaAuth }, { count: referenciasConfirmadas }] = await Promise.all([
    admin.from('red_perfiles').select('auth_user_id').eq('id', id).maybeSingle(),
    admin.from('red_referencias').select('id', { count: 'exact', head: true }).eq('perfil_id', id).eq('estado', 'confirmada'),
  ]);
  const { data: userData } = filaAuth?.auth_user_id
    ? await admin.auth.admin.getUserById(filaAuth.auth_user_id as string)
    : { data: { user: null } };

  const filaPublica = data as unknown as FilaRedPerfilPublica;
  const tieneExperienciaVerificada = experienciaVerificada(experiencias.map(e => e.estadoVerificacion));
  const badges: BadgesNetwork = {
    emailVerificado: emailVerificado(userData.user?.email_confirmed_at ?? null),
    experienciaVerificada: tieneExperienciaVerificada,
    referenciaProfesional: referenciaProfesional(referenciasConfirmadas ?? 0),
    identidadVerificada: identidadVerificada(filaPublica.identidad_verificada_en),
    activaRecientemente: activaRecientemente(filaPublica.ultimo_acceso_en, new Date()),
  };

  return {
    perfil: mapFilaAPerfilPublico(filaPublica, tieneExperienciaVerificada),
    experiencias,
    badges,
  };
}

export async function obtenerPerfilPublicoPorId(
  admin: SupabaseClient, id: string,
): Promise<DetallePerfilPublico | { error: unknown } | null> {
  const { data, error } = await admin
    .from('red_perfiles').select(SELECT_COLUMNAS_PUBLICAS).eq('id', id).eq('estado', 'published').maybeSingle();
  if (error) return { error };
  if (!data) return null;
  return detallePerfilDesdeFila(admin, data as Record<string, unknown>);
}

// Perfil no encontrado O no publicado → 404, nunca un 403 que confirmaría
// que existe (mismo criterio que obtenerPerfilPublicoPorId).
export async function obtenerPerfilPublicoPorSlug(
  admin: SupabaseClient, slug: string,
): Promise<DetallePerfilPublico | { error: unknown } | null> {
  const { data, error } = await admin
    .from('red_perfiles').select(SELECT_COLUMNAS_PUBLICAS).eq('slug', slug).eq('estado', 'published').maybeSingle();
  if (error) return { error };
  if (!data) return null;
  return detallePerfilDesdeFila(admin, data as Record<string, unknown>);
}
