import type { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { leerPremio, type PremioResena } from '@/lib/valoraciones/premio';
import { rutaEnlaceResenas } from '@/lib/valoraciones/momento';

// Lo que se le añade a la respuesta de una valoración: el premio (si el estudio lo
// ofrece) y, si toca, el enlace a su página de reseñas. Compartido por las TRES
// puertas: el deep link del correo, la app de la alumna y la página del enlace.
//
// ⚠️ Esto NUNCA hace fallar la valoración: la nota ya está guardada y es lo que
// importa. Si el premio o el enlace no salen (la base no contesta, la migración aún
// no está aplicada), la alumna ve el «gracias» de siempre.
//
// ⚠️ NINGUNA de las dos decisiones mira la nota (ni las funciones SQL la reciben):
//   · el premio se da con cualquier nota;
//   · el enlace lo decide la ASISTENCIA (3 clases, una vez cada 180 días), nunca el
//     ánimo de la alumna. Google prohíbe pedir reseñas solo a quien está contento.

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export interface ExtrasValoracion {
  premio?: PremioResena;
  /** Ruta con seguimiento (`/resena/<slug>?o=app`) al enlace de reseñas del estudio. Solo si le toca a ella. */
  enlaceResenas?: string;
}

/**
 * `crear = false`: solo LEE el premio ya dado y no pide nada (la página del enlace del
 * correo no crea nada al pintarse). `true`: da el premio si toca y reclama, atómicamente,
 * el «toca enseñarle el enlace» (a lo sumo una vez por clienta cada 180 días).
 */
export async function extrasDeValoracion(
  admin: Admin, studioId: string, socioId: string, opciones: { crear: boolean },
): Promise<ExtrasValoracion> {
  const extras: ExtrasValoracion = {};
  try {
    const [premio, slug] = await Promise.all([
      admin.rpc('otorgar_premio_resena', { p_studio_id: studioId, p_socio_id: socioId, p_crear: opciones.crear }),
      opciones.crear ? admin.rpc('reclamar_pedido_resena', { p_studio_id: studioId, p_socio_id: socioId }) : Promise.resolve({ data: null, error: null }),
    ]);
    if (premio.error) console.warn('[valoraciones] premio no disponible:', premio.error.message);
    const p = premio.error ? null : leerPremio(premio.data);
    if (p) extras.premio = p;
    if (slug.error) console.warn('[valoraciones] enlace no disponible:', slug.error.message);
    if (!slug.error && typeof slug.data === 'string' && slug.data) extras.enlaceResenas = rutaEnlaceResenas(slug.data, 'app');
  } catch (err) {
    console.warn('[valoraciones] extras no disponibles:', err instanceof Error ? err.message : err);
  }
  return extras;
}
