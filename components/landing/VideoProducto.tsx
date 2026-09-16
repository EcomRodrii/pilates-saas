'use client';

import { useSyncExternalStore } from 'react';
import { CONSULTA_MOVIL, CORTES_VIDEO_PRODUCTO } from '@/lib/landing/video-producto';

// El vídeo de producto del hero: el panel REAL de Tentare con datos de un
// estudio de prueba inventado, en bucle y sin sonido. Cuatro momentos —el día
// en el estudio, la agenda, la sustituta ya propuesta y los cobros del mes—
// con zooms suaves sobre la interfaz, sin cursor, sin barra de navegador y sin
// nada del sistema operativo: solo el producto.
//
// Se monta con HyperFrames en un proyecto que vive fuera del repo, a partir de
// capturas del panel (ver la nota de scripts/grabar-demo.mjs). Hay dos cortes:
//  · escritorio: 1440×900, 13,6 s, ~1 MB en MP4 y ~760 KB en WebM;
//  · móvil (≤ 760 px): 1080×1350 (4:5), el mismo bucle recortado sobre una
//    fila de Inicio, la agenda, la tarjeta de la sustituta y las tarjetas de
//    Cobros, para que a 390 px de ancho los rótulos se lean. Un solo vídeo de
//    escritorio a 390 px era una interfaz reconocible pero ilegible.
//
// Rendimiento (es la portada, no puede costar caro) y la regla que manda:
// NUNCA se descargan los dos cortes.
//  · En el servidor y durante la hidratación todavía no se sabe el ancho, así
//    que no se pinta ningún <video>: solo un <picture> con los dos pósteres, y
//    el navegador pide únicamente el que casa con su `media`. Es lo que mide el
//    LCP. Un <video> con varios <source> no sirve para esto: el póster es un
//    atributo único y el navegador lo pide antes de saber nada.
//  · Ya en el cliente se monta el <video> del corte que toca, con ese mismo
//    póster (sale de la caché) y `preload="metadata"`.
//  · `key` por corte: si la ventana cruza los 760 px, el <video> se vuelve a
//    montar con sus fuentes nuevas (cambiar los <source> de un vídeo ya
//    cargado no hace nada).
//  · Codificación: H.264 High 4:2:0 (`yuv420p`) y VP9 perfil 0. Un 4:4:4 no lo
//    decodifica por hardware ni iOS ni la mayoría de Android y el vídeo se
//    veía en negro (#1004); lib/landing/video-producto.test.ts lo vigila.
//
// Con `prefers-reduced-motion` no se monta el <video> siquiera — se queda el
// póster. Un bucle de 13 s es movimiento continuo en pantalla, justo lo que
// esa preferencia pide evitar.

const CONSULTA_MENOS_MOVIMIENTO = '(prefers-reduced-motion: reduce)';

/** `null` en el servidor y en la hidratación: todavía no se sabe. */
function useConsulta(consulta: string): boolean | null {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia(consulta).matches,
    () => null,
  );
}

const ALT = 'Tentare por dentro: las clases del día, la agenda, la sustituta ya propuesta ante una baja y los cobros del mes.';

export function VideoProducto() {
  const menos = useConsulta(CONSULTA_MENOS_MOVIMIENTO);
  const movil = useConsulta(CONSULTA_MOVIL);
  const { escritorio, movil: corteMovil } = CORTES_VIDEO_PRODUCTO;
  const corte = movil === null ? null : movil ? corteMovil : escritorio;

  return (
    <div className="v5-prod" id="producto">
      <div className="v5-prod-marco">
        {menos !== false || corte === null ? (
          <picture>
            <source media={CONSULTA_MOVIL} srcSet={corteMovil.poster} width={corteMovil.ancho} height={corteMovil.alto} />
            {/* Un <img> normal dentro de <picture>: es el mismo fotograma que el póster del vídeo y next/image no deja elegir fuente por `media`. */}
            <img src={escritorio.poster} alt={ALT} width={escritorio.ancho} height={escritorio.alto} />
          </picture>
        ) : (
          <video
            key={corte.id}
            ref={(el) => {
              // El atributo `muted` (no solo la propiedad) es lo que el
              // autoplay de iOS exige a un vídeo creado en el cliente.
              if (el) el.defaultMuted = true;
            }}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster={corte.poster}
            width={corte.ancho}
            height={corte.alto}
            aria-label={ALT}
          >
            <source src={corte.webm} type="video/webm" />
            <source src={corte.mp4} type="video/mp4" />
          </video>
        )}
      </div>

      <style>{`
        .v5-prod { position: relative; z-index: 2; max-width: 1180px; margin: -96px auto 0;
          padding: 0 clamp(20px,4vw,48px); }
        /* El marco: esquinas redondeadas, un borde muy tenue y una sombra
           larga. Nada de barra de navegador ni de puntos de ventana — lo que
           se enseña es el producto, no una captura de pantalla. */
        .v5-prod-marco { position: relative; border-radius: clamp(14px,1.6vw,22px); overflow: hidden;
          background: #0F0F0F; border: 1px solid rgba(252,251,246,.14);
          box-shadow: 0 40px 120px -30px rgba(0,0,0,.65), 0 8px 24px rgba(0,0,0,.28); }
        .v5-prod-marco picture { display: block; }
        .v5-prod-marco video, .v5-prod-marco img { display: block; width: 100%; height: auto; }

        @media (max-width: 760px) {
          /* Sube menos (el hero es más corto) y va de borde a borde: a 390 px
             cada píxel cuenta. Aquí se sirve el corte vertical (4:5), hecho
             para leerse a este ancho. */
          .v5-prod { margin-top: -40px; padding: 0; }
          .v5-prod-marco { border-radius: 12px; border-left: none; border-right: none; }
        }
      `}</style>
    </div>
  );
}
