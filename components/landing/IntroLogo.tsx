'use client';

import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// El logo se monta solo al entrar por primera vez.
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
// que ocupaban en PNG a tamaño original. En lo PRIMERO que carga una landing,
// eso importa más que en ningún otro sitio.
//
// ── Cuándo NO se ve ─────────────────────────────────────────────────────────
// Una cortina delante de una página que vende tiene que ganarse el sitio, así
// que se quita de en medio en cuanto estorba:
//
//   · quien ya la vio hace poco       — se recuerda 30 días, no para siempre:
//                                       un lead que vuelve meses después es
//                                       casi un visitante nuevo.
//   · quien pide menos movimiento     — `prefers-reduced-motion`. No es un
//                                       adorno: son 60px de desenfoque
//                                       animados.
//   · quien ya ha iniciado sesión     — "/" les redirige a su panel; una intro
//                                       ahí sería una cortina delante de un
//                                       redirect.
//   · quien toca cualquier cosa       — clic, tecla o scroll la saltan.
//   · si algo va mal                  — un temporizador la retira pase lo que
//                                       pase. Nadie se queda mirando una
//                                       pantalla en blanco porque una imagen
//                                       no cargó.
//
// Y no se renderiza en el servidor: el HTML que ven Google y los lectores de
// pantalla es la landing, sin cortina delante.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'tentare:intro-vista';
const RECORDAR_DIAS = 30;

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

/** La última pieza acaba aquí; a partir de ahí se disuelve la cortina. */
const FIN_MONTAJE = (PIEZAS.length - 1) * RETARDO + MONTAJE;
const SALIDA = 0.55;
/** Red de seguridad: pase lo que pase, fuera. */
const TOPE_MS = (FIN_MONTAJE + SALIDA + 1.5) * 1000;

function yaLaVio(): boolean {
  try {
    const t = Number(window.localStorage.getItem(CLAVE));
    return Number.isFinite(t) && t > 0 && Date.now() - t < RECORDAR_DIAS * 864e5;
  } catch {
    // Modo incógnito o storage bloqueado: mejor enseñarla que reventar.
    return false;
  }
}

export function IntroLogo({ autenticado }: { autenticado: boolean }) {
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    if (autenticado) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (yaLaVio()) return;

    try { window.localStorage.setItem(CLAVE, String(Date.now())); } catch { /* da igual */ }

    // Se precargan las cuatro antes de empezar: si no, las piezas aparecerían
    // de una en una según llegan y el montaje se vería a trompicones.
    let vivo = true;
    let pendientes = PIEZAS.length;
    const arrancar = () => { if (vivo && --pendientes <= 0) setVisible(true); };
    PIEZAS.forEach(p => {
      const img = new Image();
      img.onload = arrancar;
      img.onerror = arrancar; // una pieza que falle no bloquea a las demás
      img.src = `/logo-piezas/${p.nombre}.webp`;
    });
    // Si la red va lenta, no se hace esperar a nadie por una animación.
    const espera = setTimeout(() => { if (vivo) setVisible(true); }, 1200);

    return () => { vivo = false; clearTimeout(espera); };
  }, [autenticado]);

  useEffect(() => {
    if (!visible) return;

    const cerrar = () => setSaliendo(true);
    const salidaNatural = setTimeout(cerrar, FIN_MONTAJE * 1000 - 150);
    const quitar = setTimeout(() => setVisible(false), TOPE_MS);

    // Cualquier gesto la salta: nadie debería tener que esperar a una cortina.
    const GESTOS = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const;
    GESTOS.forEach(ev => window.addEventListener(ev, cerrar, { passive: true, once: true }));

    return () => {
      clearTimeout(salidaNatural);
      clearTimeout(quitar);
      GESTOS.forEach(ev => window.removeEventListener(ev, cerrar));
    };
  }, [visible]);

  // La retirada NO cuelga de `transitionEnd`: ese evento puede no llegar nunca
  // —si la pestaña pasa a segundo plano, si el navegador colapsa la transición,
  // si el valor no llega a cambiar—. Cuando alguien la salta con un gesto,
  // esperar a un evento que no llega la deja puesta hasta el temporizador de
  // emergencia. Aquí se retira por reloj, que siempre corre.
  useEffect(() => {
    if (!saliendo) return;
    const t = setTimeout(() => setVisible(false), SALIDA * 1000 + 80);
    return () => clearTimeout(t);
  }, [saliendo]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      onTransitionEnd={() => saliendo && setVisible(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: FONDO,
        display: 'grid',
        placeItems: 'center',
        opacity: saliendo ? 0 : 1,
        transition: `opacity ${SALIDA}s ease`,
        // Ya está saliendo: que no se coma los clics de la landing de debajo.
        pointerEvents: saliendo ? 'none' : 'auto',
      }}
    >
      <div style={{ position: 'relative', width: LOGO_PX, aspectRatio: '572 / 532' }}>
        {PIEZAS.map((p, i) => (
          // `next/image` no pinta nada aquí y estorba: estas cuatro ya son
          // WebP al tamaño exacto en que se muestran (2x de 266px), así que el
          // optimizador no tiene nada que recortar, y su carga diferida es lo
          // contrario de lo que necesita una intro —se precargan a mano antes
          // de empezar—. Además envuelve cada imagen, y estas se superponen
          // con `inset: 0` sin nada en medio.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.nombre}
            src={`/logo-piezas/${p.nombre}.webp`}
            alt=""
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
      `}</style>
    </div>
  );
}
