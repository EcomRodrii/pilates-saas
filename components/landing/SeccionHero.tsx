'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { ALTA, NAV_CAMBIARSE, NAV_V5 } from './enlaces';
import { useIslaCompacta } from './use-isla-compacta';

// La isla de navegación de la home y su menú móvil.
//
// Hasta la home nueva (fase 2.2, 19-oct-2026) este fichero pintaba también el
// héroe; ahora el héroe es components/web/home/Heroe.tsx (servidor) y aquí
// queda solo la barra, que la fase 2.1 extrae a un componente compartido.
//
// El logo va con <LogoTentare>, nunca con un <img>: es la regla de marca del
// repo (docs/marca/).

export function SeccionHero() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  // La isla se encoge al bajar y se alarga al subir (use-isla-compacta.ts).
  const isla = useRef<HTMLElement>(null);
  useIslaCompacta(isla);

  // Con el menú a pantalla completa abierto, la página de detrás no debe
  // desplazarse (en iOS el scroll "atraviesa" el overlay si no se bloquea).
  useEffect(() => {
    if (!menuAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [menuAbierto]);

  return (
    <>
      <nav ref={isla} className="v5-nav" aria-label="Principal">
        <a href="#top" className="v5-nav-logo" aria-label="Tentare — inicio">
          <LogoTentare formato="isotipo" tinta="color" alto={30} decorativo />
        </a>
        {/* Lo que se esconde al encogerse va dentro de un envoltorio de rejilla
            que pasa de 1fr a 0fr: así el ancho de la isla (fit-content) se
            anima sin medir nada con JavaScript. */}
        <div className="v5-nav-col v5-nav-col-links">
          <div className="v5-nav-links">
            {NAV_V5.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
            <Link href="/recursos">Recursos</Link>
            {/* La entrada se quita la primera: entre 761 y 1000 px (no cabe) y al
                encogerse la isla, que se queda con el logo y el botón. */}
            <Link href={NAV_CAMBIARSE.href} className="v5-nav-cambiarse">{NAV_CAMBIARSE.label}</Link>
          </div>
        </div>
        <div className="v5-nav-col v5-nav-col-entrar">
          <Link href="/login" className="v5-nav-entrar">Entrar</Link>
        </div>
        <Link href={ALTA} className="v5-nav-cta">{CTA_ALTA}</Link>
        <button
          type="button"
          className="v5-nav-burger"
          aria-label="Abrir el menú"
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto(true)}
        >
          <span aria-hidden />
          <span aria-hidden />
        </button>
      </nav>

      {menuAbierto && (
        <div className="v5-menu" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="v5-menu-top">
            <span className="v5-menu-etiqueta">Menú</span>
            <button type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar el menú" className="v5-menu-cerrar">✕</button>
          </div>
          <nav className="v5-menu-links">
            {NAV_V5.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuAbierto(false)}>{l.label}</a>
            ))}
            <Link href="/recursos" onClick={() => setMenuAbierto(false)}>Recursos</Link>
            <Link href={NAV_CAMBIARSE.href} onClick={() => setMenuAbierto(false)}>{NAV_CAMBIARSE.label}</Link>
          </nav>
          <div className="v5-menu-pie">
            <Link href="/login" onClick={() => setMenuAbierto(false)} className="v5-menu-entrar">Entrar</Link>
            <Link href={ALTA} onClick={() => setMenuAbierto(false)} className="v5-menu-cta">{CTA_ALTA}</Link>
          </div>
        </div>
      )}


      <style>{`
        /* LA ISLA. Cristal de verdad (blur + saturación sobre lo que pasa por
           detrás) con borde fino y un reflejo arriba; si el navegador no sabe
           de backdrop-filter, fondo sólido (abajo). Encogida (data-compacta,
           al bajar) deja el logo y el botón; al subir recupera todo. El alto no
           cambia nunca: la barra va en el flujo (sticky) y el héroe sube por
           debajo de ella, así que encoger NO mueve nada de la página. */
        .v5-nav { position: sticky; top: 14px; z-index: 60; display: flex; align-items: center;
          width: fit-content; max-width: calc(100vw - 28px); margin: 0 auto; padding: 8px 8px 8px 18px;
          border-radius: 999px; background: rgba(255,255,255,.62);
          -webkit-backdrop-filter: blur(22px) saturate(1.7); backdrop-filter: blur(22px) saturate(1.7);
          border: 1px solid rgba(255,255,255,.7);
          box-shadow: 0 14px 44px rgba(26,26,26,.14), inset 0 1px 0 rgba(255,255,255,.8);
          white-space: nowrap;
          transition: box-shadow .4s var(--motion-ease), background-color .4s var(--motion-ease); }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .v5-nav { background: #F6F5EF; }
        }
        .v5-nav[data-compacta] { box-shadow: 0 10px 30px rgba(26,26,26,.16), inset 0 1px 0 rgba(255,255,255,.8); background: rgba(255,255,255,.7); }
        .v5-nav-logo { display: flex; align-items: center; flex-shrink: 0; margin-right: 6px; }

        /* Envoltorio que se pliega: 1fr → 0fr. Al alargarse, un resorte ligero
           (rebasa un pelo y se asienta); al encogerse, una curva limpia y más
           corta. Los enlaces plegados quedan fuera del orden de tabulación
           (visibility) una vez terminada la transición. */
        .v5-nav-col { display: grid; grid-template-columns: 1fr; min-width: 0; opacity: 1; visibility: visible;
          transition: grid-template-columns .55s cubic-bezier(.34,1.32,.5,1), opacity .3s ease .08s, visibility 0s; }
        .v5-nav-col > * { min-width: 0; overflow: hidden; }
        .v5-nav[data-compacta] .v5-nav-col { grid-template-columns: 0fr; opacity: 0; visibility: hidden;
          transition: grid-template-columns .4s cubic-bezier(.4,0,.2,1), opacity .18s ease, visibility 0s .4s; }

        .v5-nav-links { display: flex; gap: clamp(10px,1.6vw,20px); padding: 0 clamp(10px,1.6vw,22px) 0 clamp(8px,1.2vw,16px); }
        .v5-nav-links a { font-size: 14px; font-weight: 600; color: #3B3B34; }
        .v5-nav-links a:hover { color: #1A1A1A; }
        /* No cabe junto al resto entre 761 y 1000 px: ahí se quita (en móvil vive en el menú). */
        @media (max-width: 1000px) { .v5-nav-cambiarse { display: none; } }
        .v5-nav-entrar { display: block; font-size: 14px; font-weight: 600; color: #1A1A1A; padding: 9px 12px; }
        .v5-nav-cta { flex-shrink: 0; background: #343825; color: #D9C29E; padding: 9px 18px; border-radius: 999px;
          font-weight: 700; font-size: 14px; transition: background .2s; }
        .v5-nav-cta:hover { background: #22251A; }

        /* Sin animación de ancho para quien pidió menos movimiento: la isla
           cambia de golpe (sigue encogiéndose, que es información de layout,
           pero sin transición). */
        @media (prefers-reduced-motion: reduce) {
          .v5-nav, .v5-nav-col, .v5-nav[data-compacta] .v5-nav-col { transition: none; }
        }

        .v5-nav-burger { display: none; width: 40px; height: 40px; flex-shrink: 0; border-radius: 999px;
          border: 1px solid rgba(26,26,26,.12); background: rgba(255,255,255,.6); cursor: pointer;
          flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .v5-nav-burger span { display: block; width: 16px; height: 2px; border-radius: 2px; background: #1A1A1A; }
        .v5-nav-burger:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        @media (max-width: 760px) {
          .v5-nav-col-links { display: none; }
          .v5-nav-burger { display: flex; margin-left: 8px; }
          .v5-nav-cta { margin-left: 8px; transition: background .2s, padding .4s var(--motion-ease); }
          .v5-nav[data-compacta] .v5-nav-cta { padding: 9px 14px; }
        }
        @media (max-width: 420px) { .v5-nav-col-entrar { display: none; } }

        .v5-menu { position: fixed; inset: 0; z-index: 120; background: #0F0F0F; color: #fff;
          display: flex; flex-direction: column; overflow-y: auto;
          padding: 18px 24px calc(28px + env(safe-area-inset-bottom, 0px)); }
        .v5-menu-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: clamp(24px,6vh,52px); }
        .v5-menu-etiqueta { font-size: 11.5px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.4); }
        .v5-menu-cerrar { width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06); color: #fff; font-size: 16px; cursor: pointer; }
        .v5-menu-links { display: flex; flex-direction: column; }
        .v5-menu-links a { padding: 15px 0; font-size: clamp(26px,7vw,32px); font-weight: 800; letter-spacing: -.03em;
          color: #fff; border-bottom: 1px solid rgba(255,255,255,.08); }
        .v5-menu-pie { margin-top: auto; padding-top: 32px; display: flex; flex-direction: column; gap: 10px; }
        .v5-menu-entrar { text-align: center; padding: 16px; font-size: 16px; font-weight: 600; color: #fff;
          background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); border-radius: 999px; }
        .v5-menu-cta { text-align: center; padding: 16px; font-size: 16px; font-weight: 700; color: #D9C29E;
          background: #343825; border-radius: 999px; }

        /* Los enlaces de la barra saltan a secciones de esta misma página. La
           barra flota (sticky, top:14, alto 58), así que sin esto el título de
           la sección aterriza justo DEBAJO de ella y queda tapado — se ve al
           pulsar "Sustituciones", "Precios" o "FAQ". Medido: la sección
           llegaba a top:0 con la barra ocupando hasta 72. */
        #producto, #te-suena, #tu-estudio, #sustituciones, #calendario, #app,
        #funcionalidades, #precio, #faq { scroll-margin-top: 88px; }

        /* El héroe vive en components/web/home/Heroe.tsx desde la home nueva
           (fase 2.2): aquí queda solo la isla y su menú. */
      `}</style>
    </>
  );
}
