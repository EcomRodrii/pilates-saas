import 'server-only';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { videoDeFila, type FilaVideo, type VideoAyuda } from './videos';

// Los vídeos PUBLICADOS, por guía («categoria/slug»). Lo leen las páginas públicas (la guía y Academy) en el servidor: la tabla es solo
// servidor (supabase/migrations/20261114100000_academy_base.sql). ISR de unos minutos + `revalidatePath` al guardar desde /interno.
//
// ⚠️ NUNCA lanza: la ayuda tiene que verse aunque la tabla no exista todavía (la migración se aplica aparte), la service-role falte
// o Supabase no conteste. Sin vídeos la guía se ve igual, solo que sin vídeo — que es justo lo que pasa con una guía sin producir.
export async function videosPublicados(): Promise<Map<string, VideoAyuda>> {
  const vacio = new Map<string, VideoAyuda>();
  try {
    const db = getSupabaseAdmin();
    if (!db) return vacio;
    const { data, error } = await db
      .from('ayuda_videos')
      .select('articulo, video_id, hash_privado, titulo, duracion_seg, nivel, resultado, destacado, publicado')
      .eq('publicado', true)
      .limit(500);
    if (error) {
      // 42P01 = la tabla aún no existe: es esperable antes de aplicar la migración, no un fallo que avisar.
      if (error.code !== '42P01') console.warn('[ayuda] no se han podido leer los vídeos', error.code);
      return vacio;
    }
    const mapa = new Map<string, VideoAyuda>();
    for (const fila of (data ?? []) as FilaVideo[]) {
      const v = videoDeFila(fila);
      if (v) mapa.set(v.articulo, v);
    }
    return mapa;
  } catch (e) {
    console.warn('[ayuda] fallo leyendo los vídeos', e instanceof Error ? e.message : e);
    return vacio;
  }
}
