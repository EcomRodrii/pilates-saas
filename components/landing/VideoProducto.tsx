'use client';

import { useSyncExternalStore } from 'react';

// El vídeo de producto del hero: la demo REAL de Tentare (/demo → "Estudio
// Aurora", ficticio) grabada con scripts/grabar-demo.mjs. Cuatro pantallas
// —lo que necesita tu atención, la semana, tus clientas y el dinero— con
// encadenados suaves, sin cursor, sin barra de navegador y sin nada del
// sistema operativo: solo el producto.
//
// Rendimiento (es la portada, no puede costar caro):
//  · 10 s, ~775 KB en MP4 y ~615 KB en WebM; el navegador elige.
//  · `poster` con el primer fotograma: mientras carga se ve el producto
//    quieto, no un hueco. Es lo que mide el LCP, así que no hay penalización
//    por esperar al vídeo.
//  · `preload="metadata"`: no se descarga entero hasta que hace falta.
//  · A cambio, el hero YA NO lleva el vídeo de ambiente del estudio que tenía
//    antes (1,3 MB): el protagonista pasa a ser el producto, y de paso la
//    portada no carga dos vídeos.
//
// Con `prefers-reduced-motion` no se monta el <video> siquiera — se queda el
// póster. Un bucle de 10 s es movimiento continuo en pantalla, justo lo que
// esa preferencia pide evitar.
function useMenosMovimiento(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

const ALT = 'Tentare por dentro: lo que necesita tu atención, la semana de clases, tus clientas y los cobros del mes.';

export function VideoProducto() {
  const menos = useMenosMovimiento();

  return (
    <div className="v5-prod" id="producto">
      <div className="v5-prod-marco">
        {menos ? (
          // eslint-disable-next-line @next/next/no-img-element -- mismo fotograma que el póster del vídeo; next/image no aporta aquí y añadiría un salto
          <img src="/producto/demo-poster.jpg" alt={ALT} width={1440} height={900} />
        ) : (
          <video
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            poster="/producto/demo-poster.jpg"
            aria-label={ALT}
          >
            <source src="/producto/demo.webm" type="video/webm" />
            <source src="/producto/demo.mp4" type="video/mp4" />
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
        .v5-prod-marco video, .v5-prod-marco img { display: block; width: 100%; height: auto; }

        @media (max-width: 760px) {
          /* Sube menos (el hero es más corto) y va de borde a borde: a 390 px
             cada píxel cuenta para que el producto se reconozca, y sin
             márgenes laterales gana ~9 % de ancho y se lee mejor.
             ⚠️ Aun así es un interfaz de escritorio a 390 px: se reconoce
             perfectamente que es una aplicación de gestión real —rejilla de
             semana, cifras, listados— pero los rótulos pequeños no se leen.
             Es un límite físico del ancho, no del montaje: recortar la barra
             lateral solo daría 1,3× y costaría la señal de "panel completo",
             y un segundo vídeo aparte doblaría la descarga de la portada. */
          .v5-prod { margin-top: -40px; padding: 0; }
          .v5-prod-marco { border-radius: 12px; border-left: none; border-right: none; }
        }
      `}</style>
    </div>
  );
}
