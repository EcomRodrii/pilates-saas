import 'server-only';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import type { PiezaPublicada } from './pieza-destino';

// Lo publicado de un widget, para resolver un código pegado con su id
// (./pieza.ts). Lo leen las dos rutas públicas: la del 307 (dentro de una
// página, encima, botón y enlace) y la de los pares de la nativa.
//
// ⚠️ El id solo vale con el slug de SU estudio (el de ahora o uno antiguo, que
// es el que lleva un código pegado antes de rebautizarlo). Un id de otro estudio
// con este slug es un id que no existe: se pinta el widget por defecto de este,
// nunca el de otro.
//
// `null` = no hay nada publicado para ese id en ese estudio. Un fallo de la base
// de datos se LANZA, no se confunde con «no existe»: quien llama decide (el
// widget por defecto, sin guardarlo en caché).
export async function leerPiezaPublicada(slug: string, id: string): Promise<PiezaPublicada | null> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin no configurado');

  const { data: pieza, error } = await admin
    .from('widget_piezas').select('studio_id, widget, config').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!pieza) return null;

  const { data: estudio, error: errEstudio } = await admin
    .from('studios').select('slug').eq('id', pieza.studio_id).maybeSingle();
  if (errEstudio) throw errEstudio;
  if (!estudio) return null;
  if (estudio.slug !== slug) {
    const { data: antiguo, error: errAntiguo } = await admin
      .from('studio_slugs_antiguos').select('studio_id')
      .eq('slug', slug).eq('studio_id', pieza.studio_id).maybeSingle();
    if (errAntiguo) throw errAntiguo;
    if (!antiguo) return null;
  }
  return { widget: pieza.widget as string, config: pieza.config };
}
