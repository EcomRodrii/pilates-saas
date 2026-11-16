'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { capturarEvento } from '@/lib/posthog-cliente';
import { NIVELES, formatearDuracion, urlReproductor, type VideoAyuda } from '@/lib/ayuda/videos';
import './academy.css';

// El vídeo de una guía, con FACHADA: hasta que la persona pulsa reproducir no se pide NADA a Vimeo (ni el reproductor, ni su script,
// ni sus cookies). Es lo que permite decir que leer una guía no deja rastro en el dispositivo (app/(legal)/cookies), y de paso no
// cuesta ancho de banda a quien solo lee. Una vez pulsado, el reproductor lleva `dnt=1`.
//
// Nunca se pinta sin un vídeo PUBLICADO: la guía escrita es la guía; el vídeo es un añadido. Un «próximamente» no se enseña.
export function VideoFachada({ video, etiqueta }: { video: VideoAyuda; etiqueta?: string }) {
  const [activo, setActivo] = useState(false);
  const duracion = formatearDuracion(video.duracionSeg);

  return (
    <div className="ac-video" data-testid="video-fachada">
      {activo ? (
        <iframe
          src={urlReproductor(video)}
          title={video.titulo}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <>
          <button
            type="button"
            className="ac-video-boton"
            aria-label={`Reproducir el vídeo: ${video.titulo} (${duracion})`}
            onClick={() => { setActivo(true); capturarEvento('ayuda_video_reproducido', { articulo: video.articulo }); }}
          >
            <span className="ac-video-play" aria-hidden="true"><Play size={26} fill="currentColor" /></span>
            <span className="ac-video-titulo">{video.titulo}</span>
            <span className="ac-video-meta">{etiqueta ?? `Vídeo · ${NIVELES[video.nivel]}`}</span>
          </button>
          <span className="ac-video-duracion" aria-hidden="true">{duracion}</span>
        </>
      )}
    </div>
  );
}
