'use client';

import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// El logo se monta solo cada vez que alguien entra.
//
// Las cuatro piezas (asta, bol y las dos hojas) entran desenfocadas, desplazadas
// y algo más grandes, cada una desde el lado al que pertenece, y acaban nítidas
// en su sitio. Es la animación diseñada en Claude Design, con los ajustes
// guardados allí: 266px, desenfoque 60px, retardo 0,31s y la curva
// cubic-bezier(.22,.7,.3,1) — rápida al principio y con frenada larga.
//
// Las piezas se separaron del propio `public/logo-mark.png` por componentes
// conectados de alfa, así que son exactamente el logo: comprobado
// superponiéndolas de nuevo (diferencia media 1,24/255 sobre 130.460 píxeles).
// Van en WebP a 2× del tamaño en pantalla: 28 KB las cuatro, frente a 412 KB
// que ocupaban en PNG a tamaño original.
//
// ── POR QUÉ ESTO YA NO ES UN COMPONENTE "SOLO CLIENTE" ──────────────────────
// La primera versión se pintaba solo tras hidratar, y encima esperaba a tener
// las cuatro imágenes cargadas antes de aparecer. Las dos cosas juntas
// garantizaban lo que se vio en producción: primero LA WEB y, un instante
// después, la cortina cayendo encima. Una cortina que llega tarde es peor que
// no tenerla.
//
// Aquello se hizo así para poder mirar `localStorage` («solo la primera vez»)
// y para que el HTML no llevara la cortina delante. Al pasar a enseñarla
// SIEMPRE, el primer motivo desaparece — y sin él, el markup puede viajar en el
// HTML y estar pintado en el primer fotograma, antes de que se ejecute una sola
// línea de JavaScript.
//
// La cortina también se RETIRA sola con CSS: la última keyframe la deja en
// `visibility: hidden`. Si el JavaScript no llegara nunca, la web sigue siendo
// usable igualmente.
//
// El JavaScript solo añade dos cosas encima, y ninguna es imprescindible:
//   · saltarla con un gesto (clic, tecla, rueda, scroll);
//   · quitarla de golpe a quien ya tiene sesión, porque "/" le redirige a su
//     panel y sería una cortina delante de un redirect.
//
// Y quien pide menos movimiento no la ve: va por `@media
// (prefers-reduced-motion: reduce)`, en CSS, así que tampoco depende del JS.
// No es un adorno — son 60px de desenfoque animados.
// ─────────────────────────────────────────────────────────────────────────────

/** Fondo del diseño (ajuste guardado en Claude Design). */
const FONDO = '#F4F1EE';
const LOGO_PX = 266;
const DESENFOQUE = 60;
const RETARDO = 0.31;   // entre pieza y pieza
const MONTAJE = 1.564;  // lo que tarda cada pieza (34% del ciclo de 4,6s)
const CURVA = 'cubic-bezier(.22,.7,.3,1)';

// Orden de entrada y desplazamiento inicial, siempre desde el lado al que
// pertenece la pieza. Sin rotación en ningún momento: es un logo, no un molino.
const PIEZAS = [
  { nombre: 'asta', dx: 0, dy: 22 },
  { nombre: 'bol', dx: 20, dy: 8 },
  { nombre: 'hoja-izq', dx: -22, dy: -10 },
  { nombre: 'hoja-der', dx: 22, dy: -10 },
] as const;

/** La última pieza acaba aquí. */
const FIN_MONTAJE = (PIEZAS.length - 1) * RETARDO + MONTAJE;
const SALIDA = 0.55;
const TOTAL = FIN_MONTAJE + SALIDA;
/** Punto del ciclo en el que empieza a disolverse, en %. */
const PCT_SALIDA = ((FIN_MONTAJE / TOTAL) * 100).toFixed(2);

export function IntroLogo({ autenticado }: { autenticado: boolean }) {
  // Arranca en `false` en servidor y en cliente: el primer render tiene que ser
  // idéntico en los dos lados o React se queja al hidratar.
  const [saltada, setSaltada] = useState(false);

  // Quien ya tiene sesión está a punto de irse a su panel, así que no ve la
  // cortina. Se DERIVA en vez de guardarse en estado: meterlo en el efecto
  // sería un setState síncrono dentro de un efecto —una cascada de renders— y
  // aquí no hace ninguna falta. En el primer render de cliente `autenticado`
  // aún es false, igual que en el servidor, así que la hidratación cuadra.
  const oculta = saltada || autenticado;

  useEffect(() => {
    if (autenticado) return;

    const saltar = () => setSaltada(true);
    const GESTOS = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const;
    GESTOS.forEach(ev => window.addEventListener(ev, saltar, { passive: true, once: true }));
    return () => GESTOS.forEach(ev => window.removeEventListener(ev, saltar));
  }, [autenticado]);

  return (
    <div
      className="tnt-intro"
      data-saltada={oculta ? '' : undefined}
      aria-hidden="true"
      // Solo lo que NUNCA hay que anular. `display` y `animation` van en la
      // hoja de estilos: puestos aquí ganarían por ser inline, y ni el gesto ni
      // `prefers-reduced-motion` podrían quitarlos. (Pasó: el atributo se ponía
      // y la cortina se quedaba igual.)
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: FONDO }}
    >
      <style>{`
        .tnt-intro {
          display: grid;
          place-items: center;
          animation: tnt-intro-cortina ${TOTAL}s linear forwards;
        }
      `}</style>
      <div style={{ position: 'relative', width: LOGO_PX, aspectRatio: '572 / 532' }}>
        {PIEZAS.map((p, i) => (
          // `next/image` no pinta nada aquí y estorba: estas cuatro ya son
          // WebP al tamaño exacto en que se muestran (2x de 266px), así que el
          // optimizador no tiene nada que recortar, y su carga diferida es lo
          // contrario de lo que necesita una intro. Además envuelve cada
          // imagen, y estas se superponen con `inset: 0` sin nada en medio.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.nombre}
            src={`/logo-piezas/${p.nombre}.webp`}
            alt=""
            // Van en el HTML inicial, así que el escáner de precarga del
            // navegador las pide antes de ejecutar nada. Con 28 KB llegan de
            // sobra antes de que a cada una le toque entrar.
            fetchPriority="high"
            decoding="sync"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              // Las tres cosas —desenfoque, desplazamiento y escala— a la vez.
              animation: `tnt-intro-pieza ${MONTAJE}s ${CURVA} ${i * RETARDO}s both`,
              // Cada pieza necesita su propio punto de partida, así que el
              // desplazamiento va en variables y los keyframes son comunes.
              ['--dx' as string]: `${p.dx}px`,
              ['--dy' as string]: `${p.dy}px`,
              ['--blur' as string]: `${DESENFOQUE}px`,
              willChange: 'transform, filter, opacity',
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes tnt-intro-pieza {
          from {
            opacity: 0;
            filter: blur(var(--blur));
            transform: translate(var(--dx), var(--dy)) scale(1.14);
          }
          to {
            opacity: 1;
            filter: blur(0);
            transform: translate(0, 0) scale(1);
          }
        }
        /* La cortina se va sola, sin JavaScript de por medio. La última
           keyframe la deja fuera de la pila: si el JS fallara, la web sigue
           siendo usable. */
        @keyframes tnt-intro-cortina {
          0%, ${PCT_SALIDA}% { opacity: 1; visibility: visible; }
          100% { opacity: 0; visibility: hidden; }
        }
        /* Saltada a mano: se va en 0,3s, no de un corte seco. */
        .tnt-intro[data-saltada] {
          animation: none;
          opacity: 0;
          visibility: hidden;
          transition: opacity .3s ease, visibility 0s linear .3s;
        }
        /* 60px de desenfoque animados no son un adorno. */
        @media (prefers-reduced-motion: reduce) {
          .tnt-intro { display: none; }
        }
      `}</style>
    </div>
  );
}
