// La app de tienda PUBLICADA de un estudio (o de su cadena), para decírselo a sus alumnas: el aviso
// de Safari («Abrir en la app» / «Obtener», `apple-itunes-app`) y la fila de su Perfil. Servidor.
//
// Tolerante a propósito: si no se puede leer, `null` y la web sigue como siempre (sin aviso). Es
// una invitación, no algo de lo que dependa nada.

import { cache } from 'react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { estudioDeLaApp } from '@/lib/app-nativa/app-de-cadena';
import { idDeTienda } from '@/lib/app-nativa/pedir-app';

export interface AppDeTienda { id: string; url: string }

export const appDeTiendaPublicada = cache(async (studioId: string): Promise<AppDeTienda | null> => {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const duena = await estudioDeLaApp(admin, studioId);
    const { data, error } = await admin.from('apps_estudio').select('url_tienda')
      .eq('studio_id', duena.studioId).eq('estado', 'PUBLICADA').eq('activa', true).maybeSingle();
    if (error || !data?.url_tienda) return null;
    const url = data.url_tienda as string;
    const id = idDeTienda(url);
    return id ? { id, url } : null;
  } catch {
    return null;
  }
});
