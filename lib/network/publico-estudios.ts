// Capa de datos pública de la ficha de ESTUDIO en Tentare Network — server-only,
// service_role. Hermana de lib/network/publico.ts (ficha de instructora), pero
// deliberadamente NO reutiliza `fetchPublicStudioData` (lib/reservar-publico.ts):
// esa función está pensada para el widget de `/reservar/[slug]` (~15 queries,
// aforos/tipos de clase/planes en vivo) y es la función "god" de over-fetching
// que el arquitecto ya marcó como no tocar/no reutilizar para un directorio de
// descubrimiento. Aquí la query es deliberadamente estrecha: 9 columnas, cero
// dato de reserva.
//
// Decisión confirmada con el fundador: esta ficha NO enseña email/teléfono del
// estudio. En `/reservar/[slug]` sí tiene sentido (ya se está reservando con
// ESE estudio); aquí es un directorio de descubrimiento — exponer contacto
// directo saltaría el patrón "solicitud primero" que el resto de Network exige
// (mismo principio que ya aplica lib/network/publico.ts a la ficha de
// instructora, que tampoco expone email_contacto/telefono_contacto ahí).
import type { SupabaseClient } from '@supabase/supabase-js';

const SELECT_COLUMNAS_PUBLICAS_ESTUDIO = 'id, nombre, ciudad, slug, descripcion, logo_url, foto_url, sitio_web, lat, lng';

export interface PerfilEstudioPublico {
  id: string;
  nombre: string;
  ciudad: string | null;
  slug: string;
  descripcion: string | null;
  logoUrl: string | null;
  fotoUrl: string | null;
  sitioWeb: string | null;
  lat: number | null;
  lng: number | null;
}

interface FilaEstudioPublico {
  id: string;
  nombre: string;
  ciudad: string | null;
  slug: string | null;
  descripcion: string | null;
  logo_url: string | null;
  foto_url: string | null;
  sitio_web: string | null;
  lat: number | null;
  lng: number | null;
}

// Instructora destacada — solo los campos ya públicos de su ficha (README
// F1: mismo opt-in `mostrar_estudios_actuales` que ya usa el sentido inverso
// en lib/network/publico.ts, `estado='published'` porque un perfil en
// borrador/oculto no debe aparecer enlazado desde fuera). Enlaza a
// /network/instructoras/[slug].
export interface InstructoraDestacadaEstudio {
  nombre: string;
  fotoUrl: string | null;
  slug: string | null;
}

interface FilaInstructor {
  auth_user_id: string | null;
}

interface FilaPerfilDestacado {
  auth_user_id: string;
  nombre: string;
  foto_url: string | null;
  slug: string | null;
}

function mapFilaAPerfilEstudio(f: FilaEstudioPublico): PerfilEstudioPublico {
  return {
    id: f.id,
    nombre: f.nombre,
    ciudad: f.ciudad,
    // NOT NULL en la query (filtrado por .eq('slug', slug)), pero la columna
    // real es nullable — se resuelve aquí, no se propaga el `string | null`.
    slug: f.slug ?? '',
    descripcion: f.descripcion,
    logoUrl: f.logo_url,
    fotoUrl: f.foto_url,
    sitioWeb: f.sitio_web,
    lat: f.lat,
    lng: f.lng,
  };
}

export interface DetalleEstudioPublico {
  estudio: PerfilEstudioPublico;
  instructorasDestacadas: InstructoraDestacadaEstudio[];
}

/**
 * Ficha pública de estudio para el directorio de Network. `null` si el
 * estudio no existe o no ha activado `visible_en_network` — nunca lanza,
 * la página hace `notFound()` con el `null`.
 */
export async function obtenerEstudioPublicoPorSlug(
  admin: SupabaseClient, slug: string,
): Promise<DetalleEstudioPublico | null> {
  const { data, error } = await admin
    .from('studios')
    .select(SELECT_COLUMNAS_PUBLICAS_ESTUDIO)
    .eq('slug', slug)
    .eq('visible_en_network', true)
    .maybeSingle();
  if (error || !data) return null;

  const fila = data as unknown as FilaEstudioPublico;
  const estudio = mapFilaAPerfilEstudio(fila);

  // Dos consultas, no un join — mismo criterio que lib/network/publico.ts
  // (supabase-js no cruza dos tablas por id crudo sin una FK-embed
  // declarada entre instructores.auth_user_id y red_perfiles.auth_user_id).
  const { data: instructoresData } = await admin
    .from('instructores')
    .select('auth_user_id')
    .eq('studio_id', estudio.id)
    .eq('activo', true);

  const authUserIds = ((instructoresData ?? []) as FilaInstructor[])
    .map(i => i.auth_user_id)
    .filter((id): id is string => id !== null);

  let instructorasDestacadas: InstructoraDestacadaEstudio[] = [];
  if (authUserIds.length > 0) {
    const { data: perfilesData } = await admin
      .from('red_perfiles')
      .select('auth_user_id, nombre, foto_url, slug')
      .in('auth_user_id', authUserIds)
      .eq('estado', 'published')
      .eq('mostrar_estudios_actuales', true);

    instructorasDestacadas = ((perfilesData ?? []) as FilaPerfilDestacado[])
      .map(p => ({ nombre: p.nombre, fotoUrl: p.foto_url, slug: p.slug }));
  }

  return { estudio, instructorasDestacadas };
}
