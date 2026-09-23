export function GlobalStyles() {
  return (
    <style>{`
      .lp-mono { font-family: var(--font-plex-mono), ui-monospace, monospace; }

      /* ── SISTEMA DE MOVIMIENTO DE LA WEB PÚBLICA (fase 4, 23-sep) ──────────
         Mismos tokens que el panel (--motion-* en app/globals.css): nada de
         curvas ni duraciones sueltas. Cada movimiento tiene UN motivo:
           · Entrada al hacer scroll (.lp-rv) ........ orientación: qué es nuevo.
           · Escalonado (--lp-r) ..................... leer en orden.
           · Demos (sustituciones, iPhone, avisos) ... explican el producto.
           · Cambio de estado (píldora de pestañas,
             FAQ, paso de la demo) ................... continuidad: de dónde viene.
           · Hover (sombra, borde, flecha) ........... qué se puede tocar / a dónde lleva.
           · Pulsación (scale .97–.98) ............... respuesta táctil.
           · Flotantes (WhatsApp, popup) ............. llegan sin tapar lo que se lee.
         Y lo que NO se hace, a propósito: nada en el héroe ni en el vídeo (son
         lo primero que se pinta), sin parallax, sin cursores, sin texto letra a
         letra, sin bucles infinitos salvo el aro del botón de WhatsApp, y sin
         transiciones entre páginas (casi todo el tráfico entra directo desde
         Google a una página, y cada página pública tiene su propio layout).
         Con prefers-reduced-motion, todo se ve quieto y completo.

         ── Entrada al hacer scroll ──
         Un solo gesto para todo lo que entra en pantalla: sube 32 px y aparece,
         atado al SCROLL (animation-timeline: view()), no a un temporizador. Por
         eso no cuesta JavaScript, no se dispara «tarde» y va a la velocidad a
         la que lee cada uno. Es mejora progresiva: donde el navegador no lo
         soporta (Firefox, hoy) el contenido está quieto y visible desde el
         principio; con prefers-reduced-motion, también.
         Solo transform y opacity. NUNCA en el héroe ni en el vídeo (están en
         pantalla al cargar: saldrían a medio aparecer) ni sobre un elemento que
         ya use transform en :hover (la animación, con fill both, se lo come):
         en esos casos va en su envoltorio. --lp-r retrasa la entrada en % del
         recorrido, para escalonar hermanos. */
      @keyframes lp-rv {
        from { opacity: 0; transform: translate3d(0, 32px, 0) scale(.985); }
        to { opacity: 1; transform: none; }
      }
      /* Flecha que avanza en los enlaces que llevan a OTRA página: anuncia
         «esto sale de aquí» antes del clic. */
      .lp-flecha svg { transition: transform var(--motion-normal) var(--motion-ease); }
      .lp-flecha:hover svg, .lp-flecha:focus-visible svg { transform: translateX(3px); }

      @media (prefers-reduced-motion: no-preference) {
        @supports (animation-timeline: view()) {
          .lp-rv { animation: lp-rv linear both; animation-timeline: view();
            animation-range: entry calc(var(--lp-r, 0) * 1%) entry calc(62% + var(--lp-r, 0) * 1%); }
        }
      }

      /* Hover-lift cards: translateY + shadow + a radial glow tracking the
         cursor via --mx/--my custom properties written by LiftCard. */
      .tnt-lift { position: relative; transition: transform .28s cubic-bezier(.2,.7,0,1), box-shadow .28s; }
      .tnt-lift:hover { transform: translateY(-7px); box-shadow: 0 44px 80px -34px rgba(26,26,26,.34); }
      .tnt-lift::after { content:''; position:absolute; inset:0; border-radius:inherit; background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%), rgba(52,56,37,.07), transparent 72%); opacity:0; transition:opacity .35s; pointer-events:none; }
      .tnt-lift:hover::after { opacity:1; }

      /* Discipline cards + integration chips: subtle hover feedback */
      .tnt-disc-card { transition: transform .3s cubic-bezier(.2,.7,0,1), box-shadow .3s; }
      .tnt-disc-card:hover { transform: translateY(-5px); box-shadow: 0 22px 40px -16px rgba(26,26,26,.34); }

      /* Disciplinas: rejilla centrada en escritorio, marquesina en móvil */
      .tnt-disc-strip { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; }
      .tnt-disc-dup { display: none; }
      @media (max-width: 960px) {
        .tnt-disc-scroller {
          overflow: hidden;
          margin: 0 calc(-1 * clamp(20px, 4vw, 44px));
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
        }
        .tnt-disc-strip { flex-wrap: nowrap; justify-content: flex-start; gap: 0; width: max-content; animation: lp-marquee 40s linear infinite; }
        .tnt-disc-strip > * { margin-right: 14px; width: 150px !important; }
        .tnt-disc-dup { display: block; }
      }
      @media (prefers-reduced-motion: reduce) {
        /* Sin animación la marquesina no avanza: se permite el scroll manual. */
        .tnt-disc-scroller { overflow-x: auto; }
      }
      .tnt-ichip { transition: border-color .18s, color .18s; }
      .tnt-ichip:hover { border-color: #343825; color: #343825; }

      /* Sustituciones flow comet */
      .tnt-flow-comet { box-shadow: 0 0 16px 5px rgba(90,97,66,.85); animation: lp-cometpulse 1.4s ease-in-out infinite; }
      .tnt-flow-vline-bg, .tnt-flow-vline-fill { display: none; }
      .tnt-steps4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; }

      .tnt-bento-4 { grid-column: span 4; }
      .tnt-bento-2 { grid-column: span 2; }

      @media (max-width: 960px) {
        .tnt-row { grid-template-columns: 1fr !important; }
        .tnt-row > div { order: unset !important; }
        .tnt-navlinks, .tnt-navcta { display: none !important; }
        .tnt-menubtn { display: inline-flex !important; }
        .tnt-g2, .tnt-g3 { grid-template-columns: 1fr !important; }
        .tnt-pricing { grid-template-columns: 1fr !important; max-width: 440px; margin: 0 auto; }
        .tnt-footer { grid-template-columns: repeat(3,1fr) !important; }
        .tnt-steps4 { grid-template-columns: repeat(2,1fr) !important; gap: 28px; }
        .tnt-flowline { display: none !important; }
      }
      @media (max-width: 600px) {
        .tnt-footer { grid-template-columns: 1fr 1fr !important; }
        .tnt-steps4 { grid-template-columns: 1fr !important; gap: 36px !important; }
        .tnt-flow-vline-bg, .tnt-flow-vline-fill { display: block; }
      }

      @keyframes lp-riseIn { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
      @keyframes lp-dash { to { stroke-dashoffset: 0; } }
      @keyframes lp-kenburns { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
      @keyframes lp-msgIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes lp-cometpulse { 0%,100% { box-shadow: 0 0 14px 4px rgba(90,97,66,.7); } 50% { box-shadow: 0 0 22px 7px rgba(90,97,66,.95); } }
      @keyframes lp-fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes lp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
      @keyframes lp-marquee { to { transform: translateX(-50%); } }

      @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
    `}</style>
  );
}
