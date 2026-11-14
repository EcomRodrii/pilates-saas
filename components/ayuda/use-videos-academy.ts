'use client';

import { useEffect, useState } from 'react';
import type { VideoAyuda } from '@/lib/ayuda/videos';

// Los vídeos PUBLICADOS de Academy para las pantallas del panel (que son de cliente). Una sola petición por carga de página, compartida entre
// quien la pida: `GET /api/ayuda/videos` es público y cacheado. Si falla, no hay vídeos: una lección se ve igual sin él, nunca un error.
let pedida: Promise<VideoAyuda[]> | null = null;
function pedir(): Promise<VideoAyuda[]> {
  pedida ??= fetch('/api/ayuda/videos')
    .then(r => (r.ok ? r.json() : { videos: [] }))
    .then((d: { videos?: VideoAyuda[] }) => (Array.isArray(d.videos) ? d.videos : []))
    .catch(() => []);
  return pedida;
}

export function useVideosAcademy(): ReadonlyMap<string, VideoAyuda> {
  const [mapa, setMapa] = useState<ReadonlyMap<string, VideoAyuda>>(new Map());
  useEffect(() => {
    let vivo = true;
    void pedir().then(lista => { if (vivo) setMapa(new Map(lista.map(v => [v.articulo, v]))); });
    return () => { vivo = false; };
  }, []);
  return mapa;
}

/** La clave del vídeo de una lección de «Primeros pasos»: `primeros-pasos/<id del capítulo>`. */
export const claveDeLeccion = (capituloId: string) => `primeros-pasos/${capituloId}`;
