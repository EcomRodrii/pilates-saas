// El vídeo de producto («Ver cómo funciona» en el hero): el resumen de 78 s
// del panel REAL de Tentare con datos de un estudio de prueba inventado —
// bajas que se cubren solas, la semana entera en el calendario, reservas,
// cobros— narrado con tipografía y avisos sobre el propio producto.
//
// Hasta el 17-sep-2026 este hueco era un bucle mudo en autoplay (dos cortes,
// uno vertical para el móvil, montado solo en el cliente con
// `prefers-reduced-motion` y un `<picture>` de arranque para no descargar
// nada de más). Se sustituyó por este vídeo con controles nativos, que el
// visitante arranca él mismo, por dos motivos:
//  · un bucle de 13 s en autoplay es exactamente el movimiento continuo que
//    `prefers-reduced-motion` pide evitar — con controles, el visitante decide;
//  · el corte 4:5 se veía apretado en el móvil real (medido en tentare.app a
//    390 px: 487 px de alto, más que la mitad de la pantalla, contra las
//    secciones de alrededor). Un 16:9 con controles no necesita un corte
//    aparte: a 390 px de ancho mide ~219 px de alto en cualquier pantalla.
//
// Un solo fichero, un solo tamaño (1920×1080) y sin nada de la maquinaria que
// existía solo para que el autoplay fuera seguro y barato: ni dos cortes, ni
// medias queries de movimiento reducido, ni montar el <video> aparte en el
// cliente. `width`/`height` explícitos reservan el hueco (nada de CLS) y
// `preload="none"` con `poster` significa que no se descarga nada del vídeo
// hasta que el visitante pulsa play.
//
// Codificación: H.264 High 4:2:0 (yuv420p) — un 4:4:4 no lo decodifica por
// hardware ni iOS ni la mayoría de Android (#1004); lib/landing/video-producto.test.ts
// lo vigila, aunque ahora el vídeo lo arranca el visitante y no autoplay.

const ANCHO = 1920;
const ALTO = 1080;
const ALT = 'Tentare por dentro: bajas que se cubren solas, la semana entera en el calendario, reservas online y los cobros del mes.';

export function VideoProducto() {
  return (
    <div className="v5-prod" id="producto">
      <div className="v5-prod-marco">
        <video controls preload="none" poster="/producto/tour-poster.jpg" width={ANCHO} height={ALTO} aria-label={ALT}>
          <source src="/producto/tour.mp4" type="video/mp4" />
          Tu navegador no puede reproducir este vídeo. Puedes verlo directamente en{' '}
          <a href="/producto/tour.mp4">/producto/tour.mp4</a>.
        </video>
      </div>

      <style>{`
        /* Desde la home nueva (fase 2.2) va al final de la sección de producto
           (components/web/home/PestanasProducto.tsx), dentro de su contenedor:
           sin solaparse con nada y sin relleno propio. */
        .v5-prod { position: relative; max-width: 1180px; margin: 0 auto; }
        /* El marco: esquinas redondeadas, un borde muy tenue y una sombra
           larga. Nada de barra de navegador ni de puntos de ventana — lo que
           se enseña es el producto, no una captura de pantalla. */
        .v5-prod-marco { position: relative; border-radius: clamp(14px,1.6vw,22px); overflow: hidden;
          background: #0F0F0F; border: 1px solid rgba(252,251,246,.14);
          box-shadow: 0 40px 120px -30px rgba(0,0,0,.65), 0 8px 24px rgba(0,0,0,.28); }
        .v5-prod-marco video { display: block; width: 100%; height: auto; }

        @media (max-width: 760px) {
          .v5-prod-marco { border-radius: 14px; }
        }
      `}</style>
    </div>
  );
}
