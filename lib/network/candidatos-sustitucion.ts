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
 */
export async function candidatosNetworkParaHueco(
  admin: SupabaseClient,
  params: { especialidadNetwork: EspecialidadNetwork | null; ciudadEstudio: string | null; inicioSesionISO: string },
): Promise<CandidatoNetworkSustitucion[]> {
  const { especialidadNetwork, ciudadEstudio, inicioSesionISO } = params;
  if (!especialidadNetwork) return [];

  const franjas = franjasDe(inicioSesionISO);

  let query = admin
    .from('red_perfiles')
    .select('id, slug, nombre, foto_url, ciudad')
    .eq('estado', 'published')
    .in('disponibilidad_estado', ['disponible', 'disponible_sustituciones'])
    .contains('especialidades', [especialidadNetwork])
    .overlaps('disponibilidad_horarios', franjas)
    .limit(LIMITE);

  // Mismo texto plano que el resto de Network (sin geocodificar, ver el
  // comentario del documento §2) — sin ciudad conocida del estudio, no se
  // filtra por ciudad en vez de descartar todo por falta de dato.
  if (ciudadEstudio) query = query.eq('ciudad', ciudadEstudio);

  const { data, error } = await query;
  if (error) {
    console.error('[candidatosNetworkParaHueco]', error.message);
    return [];
  }

  return (data ?? []).map(r => ({
    perfilId: r.id as string,
    slug: (r.slug as string | null) ?? null,
    nombre: r.nombre as string,
    fotoUrl: (r.foto_url as string | null) ?? null,
    ciudad: (r.ciudad as string | null) ?? null,
  }));
}
