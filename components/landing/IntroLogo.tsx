'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// El logo se monta solo la PRIMERA vez que alguien entra (decisión del
// fundador, 23-sep: 3 s de cortina en cada visita frenaban a quien volvía a
// mirar el precio). A partir de ahí, la página aparece directamente.
//
// Las cuatro piezas (asta, bol y las dos hojas) entran desenfocadas, desplazadas
// y algo más grandes, cada una desde el lado al que pertenece, y acaban nítidas
// en su sitio. Es la animación diseñada en Claude Design, con los ajustes
// guardados allí: 266px, desenfoque 60px, retardo 0,31s y la curva
// cubic-bezier(.22,.7,.3,1) — rápida al principio y con frenada larga.
//
// Las piezas salen del kit SVG (docs/marca/), cada una rasterizada con solo su
// trazado visible sobre el mismo lienzo, así que superpuestas reconstruyen el
// isotipo exacto por construcción — ya no por recorte de alfa de un PNG. Se
// regeneran con `node scripts/regenerar-marca.mjs`, igual que el resto de
// derivados: si el isotipo cambia, estas cuatro tienen que cambiar con él o la
// intro monta una marca distinta de la que enseña el resto de la página.
// Van en WebP a 2× del tamaño en pantalla: 11 KB las cuatro.
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

/** La última pieza acaba aquí, y la cortina empieza a irse. Lo lee el héroe
 *  para que sus tarjetas no entren escondidas detrás de ella. */
export const FIN_MONTAJE = (PIEZAS.length - 1) * RETARDO + MONTAJE;
const SALIDA = 0.55;
const TOTAL = FIN_MONTAJE + SALIDA;
/** Punto del ciclo en el que empieza a disolverse, en %. */
const PCT_SALIDA = ((FIN_MONTAJE / TOTAL) * 100).toFixed(2);

/**
 * Marca de «ya la vio». Se lee ANTES de pintar con un <script> en línea que
 * viaja en el HTML (va delante de la cortina): si está, mete en <head> una
 * <style id="tnt-intro-vista"> que la quita sin que llegue a verse (y adelanta
 * las tarjetas del héroe, que si no esperarían a una cortina que no hay). Si
 * no está, la escribe en ese mismo momento.
 * ⚠️ Una <style> nueva en <head> y NO un atributo en <html>: el <html> lo pinta
 * React (app/layout.tsx) y un atributo puesto antes de hidratar es un error
 * de hidratación en toda la página; React 19 ignora las etiquetas de más en
 * <head>. En una navegación dentro de la web (sin recarga) el script no corre,
 * así que el componente repite lo mismo en un layout effect, antes de pintar.
 * Todo con try/catch: sin almacenamiento (modo privado estricto) se enseña,
 * que es el comportamiento de siempre.
 */
export const CLAVE_INTRO_VISTA = 'tentare:intro-vista';
/** Estado de módulo: sobrevive a las navegaciones sin recarga, no a una recarga. */
let introMontadaAntes = false;
const ID_ESTILO_VISTA = 'tnt-intro-vista';
const CSS_VISTA = '.tnt-intro{display:none!important}.v5-hero-tarjeta{animation-delay:calc(.25s + var(--orden,0) * .12s)!important}';
const CUERPO_PRIMERA_VEZ = `window.__tntIntroDecidida=1;try{var k=${JSON.stringify(CLAVE_INTRO_VISTA)};if(localStorage.getItem(k)){if(!document.getElementById(${JSON.stringify(ID_ESTILO_VISTA)})){var s=document.createElement('style');s.id=${JSON.stringify(ID_ESTILO_VISTA)};s.textContent=${JSON.stringify(CSS_VISTA)};document.head.appendChild(s)}}else{localStorage.setItem(k,String(Date.now()))}}catch(e){}`;
const SCRIPT_PRIMERA_VEZ = `(function(){${CUERPO_PRIMERA_VEZ}})();`;

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

  // Navegación sin recarga: el script en línea no corre, así que se mira aquí,
  // antes de pintar, si ya la vio (y si no, se anota).
  useLayoutEffect(() => {
    // Lo mismo que el script en línea: si hubo recarga ya lo hizo él (la
    // <style> existe y no se duplica, y la marca ya estaba escrita).
    // ⚠️ Si el script ya decidió en ESTA carga, no se vuelve a mirar: en una
    // primera visita acaba de escribir la marca, y leerla aquí ocultaría la
    // cortina que tiene que verse (pasó al montarlo).
    // Solo cuenta para el PRIMER montaje tras una carga: en una navegación
    // posterior (volver a «/» sin recargar) hay que mirar la marca, que ya
    // estará escrita.
    const w = window as typeof window & { __tntIntroDecidida?: number };
    const primerMontaje = !introMontadaAntes;
    introMontadaAntes = true;
    if (primerMontaje && w.__tntIntroDecidida) return;
    if (document.getElementById(ID_ESTILO_VISTA)) return;
    try {
      if (localStorage.getItem(CLAVE_INTRO_VISTA)) {
        const estilo = document.createElement('style');
        estilo.id = ID_ESTILO_VISTA;
        estilo.textContent = CSS_VISTA;
        document.head.appendChild(estilo);
      } else {
        localStorage.setItem(CLAVE_INTRO_VISTA, String(Date.now()));
      }
    } catch { /* sin almacenamiento: se enseña */ }
  }, []);

  useEffect(() => {
    if (autenticado) return;

    const saltar = () => setSaltada(true);
    const GESTOS = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const;
    GESTOS.forEach(ev => window.addEventListener(ev, saltar, { passive: true, once: true }));
    return () => GESTOS.forEach(ev => window.removeEventListener(ev, saltar));
  }, [autenticado]);

  return (
    <>
    {/* Va DELANTE de la cortina y el navegador lo ejecuta al leer el HTML,
        antes del primer pintado. Dentro de un contenedor con
        dangerouslySetInnerHTML y no como <script> de React: React 19 avisa de
        (y nunca ejecuta) los <script> que pinta él; este solo tiene que
        correr desde el HTML del servidor, y en cliente ya lo cubre el layout
        effect de arriba. */}
    <div hidden dangerouslySetInnerHTML={{ __html: `<script>${SCRIPT_PRIMERA_VEZ}</script>` }} />
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
      <div style={{ position: 'relative', width: LOGO_PX, aspectRatio: '572 / 529' }}>
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
            alt={p.nombre === 'asta' ? 'Asta del logo de Tentare' : p.nombre === 'bol' ? 'Bol del logo de Tentare' : p.nombre === 'hoja-izq' ? 'Hoja izquierda del logo de Tentare' : 'Hoja derecha del logo de Tentare'}
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
    </>
  );
}
