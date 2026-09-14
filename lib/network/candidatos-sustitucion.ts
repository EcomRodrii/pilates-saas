// Tentare Network → Sustituciones — punto de extensión de la Fase 11
// (docs/NETWORK-SUSTITUCIONES-EXTENSION.md §2-4). Sugiere perfiles de Network
// para un hueco sin instructora, SIN puntuar (nunca fusionado con el ranking
// interno de `rankear_candidatas`) y solo cuando el tipo de clase tiene
// `especialidad_network` mapeado — sin mapear, no se busca nada, nunca un
// matching aproximado por texto (§3 del documento).
import type { SupabaseClient } from '@supabase/supabase-js';
import { franjaLocalDe } from '../utils.ts';
import type { HorarioNetwork, EspecialidadNetwork } from './catalogo.ts';
import type { CandidatoNetworkSustitucion } from './tipos.ts';

// Franjas anchas de Network (mañanas/tardes/noches/fines_semana) contra un
// instante concreto: una clase puede caer en más de una a la vez (sábado por
// la mañana es 'mananas' Y 'fines_semana') — se buscan TODAS las que aplican,
// nunca una sola, para no perder candidatas por un corte arbitrario.
export function franjasDe(inicioISO: string): HorarioNetwork[] {
  const { dow, hora } = franjaLocalDe(inicioISO);
  const franjas: HorarioNetwork[] = [];
  if (hora >= 6 && hora < 14) franjas.push('mananas');
  else if (hora >= 14 && hora < 19) franjas.push('tardes');
  else franjas.push('noches');
  if (dow === 0 || dow === 6) franjas.push('fines_semana');
  return franjas;
}

const LIMITE = 6;

type Admin = Pick<SupabaseClient, 'from'>;

/**
 * Perfiles de Tentare Network que "podrían encajar" para cubrir `sesion` —
 * sección aparte del ranking interno, nunca puntuada. `especialidadNetwork`
 * viene de `tipos_clase.especialidad_network`; si es `null` (tipo de clase
 * sin mapear), no se busca nada y se devuelve `[]` — no es un fallo, es la
 * regla (§3: sin mapeo explícito, no hay matching aproximado por texto).
 *
 * Disponibilidad orientativa, no una promesa de hueco libre (§4): el cruce
 * de horarios usa las 4 franjas anchas del perfil, nunca sustituye confirmar
 * con la persona. El contacto real sigue pasando por
 * red_solicitudes_contacto (Fase 9) — esta función solo lista, no contacta.
 *
 * `studioId`: quita a quien YA tiene ficha activa en ese estudio. Esa persona
 * ya está en el ranking interno (`rankear_candidatas` exige `activo = true`),
 * y proponérsela como «profesional de Network» sería contarle a la propietaria
 * que no conoce a su propia instructora. Una ficha dada de baja NO la quita: ya
 * no está en el ranking, y por Network sí se la puede volver a llamar.
 */
export async function candidatosNetworkParaHueco(
  admin: Admin,
  params: {
    especialidadNetwork: EspecialidadNetwork | null;
    ciudadEstudio: string | null;
    inicioSesionISO: string;
    studioId?: string | null;
  },
): Promise<CandidatoNetworkSustitucion[]> {
  return (await buscarCandidatosNetwork(admin, params)) ?? [];
}

// `null` = la búsqueda falló. Distinto de `[]` (buscado y no hay nadie): al
// REFRESCAR, un fallo transitorio no puede borrar la lista que ya había.
async function buscarCandidatosNetwork(
  admin: Admin,
  params: Parameters<typeof candidatosNetworkParaHueco>[1],
): Promise<CandidatoNetworkSustitucion[] | null> {
  const { especialidadNetwork, ciudadEstudio, inicioSesionISO, studioId } = params;
  if (!especialidadNetwork) return [];

  const franjas = franjasDe(inicioSesionISO);

  let query = admin
    .from('red_perfiles')
    .select('id, slug, nombre, foto_url, ciudad, auth_user_id')
    .eq('estado', 'published')
    .in('disponibilidad_estado', ['disponible', 'disponible_sustituciones'])
    .contains('especialidades', [especialidadNetwork])
    .overlaps('disponibilidad_horarios', franjas)
    // Con el filtro de equipo se pide margen: si no, dos compañeras entre las
    // seis primeras dejarían la lista en cuatro habiendo más perfiles.
    .limit(studioId ? LIMITE * 2 : LIMITE);

  // Mismo texto plano que el resto de Network (sin geocodificar, ver el
  // comentario del documento §2) — sin ciudad conocida del estudio, no se
  // filtra por ciudad en vez de descartar todo por falta de dato.
  if (ciudadEstudio) query = query.eq('ciudad', ciudadEstudio);

  const { data, error } = await query;
  if (error) {
    console.error('[candidatosNetworkParaHueco]', error.message);
    return null;
  }
  let filas = data ?? [];

  const authIds = filas.map(r => r.auth_user_id as string | null).filter((v): v is string => !!v);
  if (studioId && authIds.length > 0) {
    const { data: equipo, error: errEquipo } = await admin
      .from('instructores').select('auth_user_id, activo')
      .eq('studio_id', studioId).in('auth_user_id', authIds);
    if (errEquipo) {
      // Sin poder comprobarlo se enseñan igual: repetir a una compañera es un
      // detalle; no proponer a nadie por un fallo de esta consulta, no.
      console.error('[candidatosNetworkParaHueco:equipo]', errEquipo.message);
    } else {
      // `activo` NULL cuenta como activa, igual que coalesce(activo, true).
      const yaEnEquipo = new Set((equipo ?? [])
        .filter(i => i.activo !== false).map(i => i.auth_user_id as string));
      filas = filas.filter(r => !yaEnEquipo.has(r.auth_user_id as string));
    }
  }

  // `auth_user_id` NO sale de aquí: la lista acaba en el JSON del panel.
  return filas.slice(0, LIMITE).map(r => ({
    perfilId: r.id as string,
    slug: (r.slug as string | null) ?? null,
    nombre: r.nombre as string,
    fotoUrl: (r.foto_url as string | null) ?? null,
    ciudad: (r.ciudad as string | null) ?? null,
  }));
}

/**
 * Vuelve a calcular los candidatos de Network de una sustitución que YA existe
 * y los guarda. Al crear la baja se guardan una vez y se quedan viejos: cuando
 * el motor se queda sin nadie a quien preguntar ('agotada') —horas después, a
 * veces— o la propietaria pulsa «Volver a buscar», la lista tiene que ser la de
 * AHORA.
 *
 * Solo escribe `sustituciones.candidatos_network`, acotado por id Y estudio
 * (cliente service-role: la RLS no filtra). NUNCA contacta a nadie ni crea
 * `red_solicitudes_contacto`: Tentare propone, el contacto lo decide ella.
 *
 * Best-effort, nunca lanza: devuelve cuántos candidatos quedaron guardados, o
 * `null` si no se pudo (y entonces no toca lo que había). Quien llama sigue su
 * flujo igual — un fallo aquí no puede frenar una sustitución.
 */
export async function refrescarCandidatosNetwork(
  admin: Admin,
  params: { sustitucionId: string; studioId: string },
): Promise<number | null> {
  const { sustitucionId, studioId } = params;
  try {
    const { data: sust } = await admin
      .from('sustituciones').select('sesion_id')
      .eq('id', sustitucionId).eq('studio_id', studioId).maybeSingle();
    if (!sust?.sesion_id) return null;

    const { data: sesion } = await admin
      .from('sesiones').select('inicio, tipo_clase_id')
      .eq('id', sust.sesion_id as string).eq('studio_id', studioId).maybeSingle();
    if (!sesion?.inicio) return null;

    // El tipo de clase por id, sin `studio_id`, igual que crearBaja: el id ya
    // viene de una sesión acotada a este estudio, y en una cadena el menú es de
    // la cadena (migr 0103), no de cada sede.
    const [tipoClase, estudio] = await Promise.all([
      sesion.tipo_clase_id
        ? admin.from('tipos_clase').select('especialidad_network')
          .eq('id', sesion.tipo_clase_id as string).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from('studios').select('ciudad').eq('id', studioId).maybeSingle(),
    ]);

    const candidatos = await buscarCandidatosNetwork(admin, {
      especialidadNetwork: (tipoClase.data?.especialidad_network as EspecialidadNetwork | null) ?? null,
      ciudadEstudio: (estudio.data?.ciudad as string | null) ?? null,
      inicioSesionISO: sesion.inicio as string,
      studioId,
    });
    if (candidatos === null) return null;

    const { data: act, error } = await admin
      .from('sustituciones').update({ candidatos_network: candidatos })
      .eq('id', sustitucionId).eq('studio_id', studioId)
      .select('id');
    if (error || !act || act.length === 0) {
      if (error) console.error('[refrescarCandidatosNetwork:guardar]', error.message);
      return null;
    }
    return candidatos.length;
  } catch (e) {
    console.error('[refrescarCandidatosNetwork]', e);
    return null;
  }
}
