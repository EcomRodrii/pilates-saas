'use client';

import { useEffect } from 'react';
import { capturarEvento } from '@/lib/posthog-cliente';
import { NIVELES, type VideoAyuda } from '@/lib/ayuda/videos';
import { VideoFachada } from './VideoFachada';
import './academy.css';

// El vídeo de una guía del Centro de ayuda, si hay uno PUBLICADO (y cuenta la visita). Sin vídeo no pinta nada: nunca un hueco ni un
// «próximamente». La guía escrita es la guía; el vídeo es un añadido.
export function VideoDeGuia({ clave, video }: { clave: string; video: VideoAyuda | null }) {
  useEffect(() => { capturarEvento('ayuda_articulo_visto', { articulo: clave }); }, [clave]);
  if (!video) return null;
  return (
    <section className="ac-ficha" aria-label="Vídeo de esta guía">
      <VideoFachada video={video} />
      <div className="ac-ficha-fila"><span className="ac-pildora">{NIVELES[video.nivel]}</span></div>
      {video.resultado && <p className="ac-resultado"><strong>Lo que vas a conseguir:</strong> {video.resultado}</p>}
    </section>
  );
}
