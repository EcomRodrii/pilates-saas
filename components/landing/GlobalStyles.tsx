export function GlobalStyles() {
  return (
    <style>{`
      .lp-mono { font-family: var(--font-plex-mono), ui-monospace, monospace; }

      /* Spine nav: dot + hover/active label, matching the source design */
      .tnt-spine { display: flex; }
      .tnt-spine::before { content:''; position:absolute; left:3.5px; top:0; bottom:0; width:2px; background:rgba(26,26,26,.12); border-radius:2px; z-index:0; }
      .tnt-spine-dot { position: relative; }
      .tnt-spine-label { position:absolute; left:16px; top:50%; transform:translateY(-50%) translateX(-4px); white-space:nowrap; font-family: var(--font-plex-mono), monospace; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:#5B21B6; background:#fff; padding:5px 10px; border-radius:6px; box-shadow:0 6px 16px -4px rgba(26,26,26,.25); opacity:0; transition:opacity .2s, transform .2s; pointer-events:none; }
      .tnt-spine-dot.on .tnt-spine-label, .tnt-spine-dot:hover .tnt-spine-label { opacity:1; transform: translateY(-50%) translateX(0); }
      @media (max-width: 1150px) { .tnt-spine { display: none !important; } }

      /* Hover-lift cards: translateY + shadow + a radial glow tracking the
         cursor via --mx/--my custom properties written by LiftCard. */
      .tnt-lift { position: relative; transition: transform .28s cubic-bezier(.2,.7,0,1), box-shadow .28s; }
      .tnt-lift:hover { transform: translateY(-7px); box-shadow: 0 44px 80px -34px rgba(26,26,26,.34); }
      .tnt-lift::after { content:''; position:absolute; inset:0; border-radius:inherit; background:radial-gradient(240px circle at var(--mx,50%) var(--my,50%), rgba(109,40,217,.07), transparent 72%); opacity:0; transition:opacity .35s; pointer-events:none; }
      .tnt-lift:hover::after { opacity:1; }

      /* Discipline cards + integration chips: subtle hover feedback */
      .tnt-disc-card { transition: transform .3s cubic-bezier(.2,.7,0,1), box-shadow .3s; }
      .tnt-disc-card:hover { transform: translateY(-5px); box-shadow: 0 22px 40px -16px rgba(26,26,26,.34); }
      .tnt-ichip { transition: border-color .18s, color .18s; }
      .tnt-ichip:hover { border-color: #6D28D9; color: #6D28D9; }

      /* Sustituciones flow comet */
      .tnt-flow-comet { box-shadow: 0 0 16px 5px rgba(124,58,237,.85); animation: lp-cometpulse 1.4s ease-in-out infinite; }

      .tnt-bento-4 { grid-column: span 4; }
      .tnt-bento-2 { grid-column: span 2; }

      @media (max-width: 960px) {
        .tnt-hero, .tnt-row { grid-template-columns: 1fr !important; }
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
        .tnt-steps4 { grid-template-columns: 1fr !important; }
        .tnt-herobadge { display: none; }
      }

      @keyframes lp-riseIn { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
      @keyframes lp-dash { to { stroke-dashoffset: 0; } }
      @keyframes lp-floatA { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-13px); } }
      @keyframes lp-floatB { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
      @keyframes lp-floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
      @keyframes lp-msgIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes lp-cometpulse { 0%,100% { box-shadow: 0 0 14px 4px rgba(124,58,237,.7); } 50% { box-shadow: 0 0 22px 7px rgba(124,58,237,.95); } }
      @keyframes lp-fadeIn { from { opacity: 0; } to { opacity: 1; } }

      @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
    `}</style>
  );
}
