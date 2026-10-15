// La app de tienda PUBLICADA de un estudio (o de su cadena), para decírselo a sus alumnas: el aviso
// de Safari («Abrir en la app» / «Obtener», `apple-itunes-app`) y la fila de su Perfil. Servidor.
//
// Se pide en CADA navegación de la app de la alumna (sus metadatos se recalculan por ruta), así que:
//  · va con la caché en memoria del catálogo público (`conCacheCatalogo`, 10 minutos): que una app
//    pase a publicada es raro, y esperar unos minutos a enseñar el aviso no le cuesta nada a nadie;
//  · un fallo NO se guarda en caché (la próxima petición vuelve a probar) y devuelve `null`: es una
//    invitación, no algo de lo que dependa nada, y la web sigue como siempre;
//  · con E2E_TEST=1 no se toca la red: el CI no tiene base de datos y cada consulta fallida retrasaba
//    todas las navegaciones del portal (pasó en el primer CI de esto).

import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { estudioDeLaApp } from '@/lib/app-nativa/app-de-cadena';
import { idDeTienda } from '@/lib/app-nativa/pedir-app';
import { conCacheCatalogo } from '@/lib/cache/catalogo-estudio';

export interface AppDeTienda { id: string; url: string }

const DIEZ_MINUTOS = 10 * 60_000;

async function leer(studioId: string): Promise<AppDeTienda | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const duena = await estudioDeLaApp(admin, studioId);
  const { data, error } = await admin.from('apps_estudio').select('url_tienda')
    .eq('studio_id', duena.studioId).eq('estado', 'PUBLICADA').eq('activa', true).maybeSingle();
  if (error) throw new Error(error.message);
  const url = (data?.url_tienda as string | null | undefined) ?? null;
  const id = idDeTienda(url);
  return url && id ? { id, url } : null;
}

export const appDeTiendaPublicada = cache(async (studioId: string): Promise<AppDeTienda | null> => {
  if (process.env.E2E_TEST === '1') return null;
  try {
    return await conCacheCatalogo(`app-tienda:${studioId}`, () => leer(studioId), DIEZ_MINUTOS);
  } catch {
    return null;
  }
});
