'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NAV_V5, NAV_NETWORK } from './enlaces';

// Nav + primer viewport.
//
// El hero responde, por orden, a las cuatro preguntas que trae una propietaria
// que está comparando Tentare con bsport, Momence o Eversports:
//   ¿esto es para mí? → el antetítulo nombra el mercado
//   ¿qué hace?        → el titular promete el resultado, no la función
//   ¿qué gestiona?    → una línea con las cinco áreas, sin párrafo
//   ¿cómo se ve?      → el vídeo de producto, justo debajo (<VideoProducto/>)
//
// Un solo CTA. Antes había dos con el mismo peso ("Ver Tentare en acción" y
// "Probar Tentare") compitiendo entre sí; "Probar Tentare" se queda en la
// barra, que es donde no compite con nada.
//
// ⚠️ El hero ya NO lleva vídeo de ambiente. Llevaba uno (1,3 MB) y ahora el
// protagonista es el vídeo de PRODUCTO: dos vídeos en la portada es el doble
// de descarga y dos cosas moviéndose a la vez. Se queda el mismo fotograma
// como foto fija, que mantiene el contexto de estudio de Pilates sin competir
// con el producto ni costar nada extra (ya se descargaba como póster).
//
// El logo va con <LogoTentare>, nunca con un <img>: es la regla de marca del
// repo (docs/marca/).

export function SeccionHero() {
  const [menuAbierto, setMenuAbierto] = useState(false);

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
      <nav className="v5-nav" aria-label="Principal">
        <a href="#top" className="v5-nav-logo" aria-label="Tentare — inicio">
          <LogoTentare formato="horizontal" tinta="tinta" alto={26} decorativo />
        </a>
        <div className="v5-nav-links">
          {NAV_V5.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
          <Link href="/recursos">Recursos</Link>
          <Link href={NAV_NETWORK.href}>{NAV_NETWORK.label}</Link>
        </div>
        <div className="v5-nav-acciones">
          <Link href="/login" className="v5-nav-entrar">Entrar</Link>
          <Link href="/crear-estudio" className="v5-nav-cta">Probar Tentare</Link>
        </div>
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
            <Link href={NAV_NETWORK.href} onClick={() => setMenuAbierto(false)}>{NAV_NETWORK.label}</Link>
          </nav>
          <div className="v5-menu-pie">
            <Link href="/login" onClick={() => setMenuAbierto(false)} className="v5-menu-entrar">Entrar</Link>
            <Link href="/crear-estudio" onClick={() => setMenuAbierto(false)} className="v5-menu-cta">Probar Tentare</Link>
          </div>
        </div>
      )}

      <header id="top" className="v5-hero">
        <Image src="/hero-video-poster.jpg" alt="" fill priority sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 42%' }} />
        <div className="v5-hero-velo" aria-hidden />
        <div className="v5-hero-wrap">
          <p className="v5-hero-eyebrow">Software para estudios de Pilates en Barcelona</p>
          <h1 className="v5-hero-h1">Tu estudio de Pilates<br />en Barcelona, bajo control.</h1>
          <p className="v5-hero-lead">
            Reservas, alumnas, pagos, clases y equipo. Todo en un solo lugar.
          </p>
          <a href="#producto" className="v5-hero-cta">Ver Tentare en acción</a>
        </div>
      </header>

      <style>{`
        .v5-nav { position: sticky; top: 14px; z-index: 60; display: flex; align-items: center; gap: clamp(10px,1.6vw,22px);
          width: fit-content; max-width: calc(100vw - 28px); margin: 0 auto; padding: 8px 8px 8px 18px;
          border-radius: 999px; background: rgba(255,255,255,.72); backdrop-filter: blur(20px) saturate(1.6);
          border: 1px solid rgba(255,255,255,.6); box-shadow: 0 14px 44px rgba(26,26,26,.16); white-space: nowrap; }
        .v5-nav-logo { display: flex; align-items: center; flex-shrink: 0; }
        .v5-nav-links { display: flex; gap: clamp(10px,1.6vw,20px); }
        .v5-nav-links a { font-size: 14px; font-weight: 600; color: #3B3B34; }
        .v5-nav-links a:hover { color: #1A1A1A; }
        .v5-nav-acciones { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .v5-nav-entrar { font-size: 14px; font-weight: 600; color: #1A1A1A; padding: 9px 8px; }
        .v5-nav-cta { flex-shrink: 0; background: #343825; color: #D9C29E; padding: 9px 18px; border-radius: 999px;
          font-weight: 700; font-size: 14px; transition: background .2s; }
        .v5-nav-cta:hover { background: #22251A; }

        .v5-nav-burger { display: none; width: 40px; height: 40px; flex-shrink: 0; border-radius: 999px;
          border: 1px solid rgba(26,26,26,.12); background: rgba(255,255,255,.6); cursor: pointer;
          flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .v5-nav-burger span { display: block; width: 16px; height: 2px; border-radius: 2px; background: #1A1A1A; }
        .v5-nav-burger:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        @media (max-width: 760px) {
          .v5-nav-links { display: none; }
          .v5-nav-burger { display: flex; }
        }
        @media (max-width: 420px) { .v5-nav-entrar { display: none; } }

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
        #producto, #sustituciones, #calendario, #app, #widget, #clientas,
        #cambiarse, #funcionalidades, #precio, #faq { scroll-margin-top: 88px; }

        /* --alto-barra: la barra mide 58px y va en el flujo, así que sin esto
           queda una franja del fondo de página por encima de la foto. */
        .v5-hero { --alto-barra: 58px; position: relative; isolation: isolate; overflow: hidden;
          margin-top: calc(-1 * var(--alto-barra));
          padding: calc(var(--alto-barra) + clamp(56px,9vh,104px)) clamp(20px,4vw,48px) clamp(128px,13vw,168px); }
        .v5-hero-velo { position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: linear-gradient(176deg,rgba(12,11,8,.86) 0%,rgba(12,11,8,.8) 40%,rgba(12,11,8,.9) 100%); }
        .v5-hero-wrap { position: relative; z-index: 2; max-width: 1180px; margin: 0 auto; text-align: center; }
        .v5-hero-eyebrow { font-size: 13px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase;
          color: #D9C29E; margin: 0 0 20px; }
        /* El titular es el elemento protagonista: dos líneas cortas, muy
           grandes, con el punto de "Tu estudio." haciendo la pausa. */
        .v5-hero-h1 { font-size: clamp(44px,8vw,104px); font-weight: 800; line-height: .94; letter-spacing: -.05em;
          margin: 0 auto; color: #FCFBF6; text-wrap: balance; }
        .v5-hero-lead { margin: 22px auto 0; max-width: 48ch; font-size: clamp(16px,1.5vw,19px);
          line-height: 1.5; color: rgba(234,232,222,.88); }
        .v5-hero-cta { display: inline-block; margin-top: 30px; background: #D9C29E; color: #23271A;
          font-weight: 800; font-size: 17px; padding: 18px 38px; border-radius: 999px; white-space: nowrap;
          transition: transform .2s, background .2s; box-shadow: 0 18px 44px rgba(0,0,0,.35); }
        .v5-hero-cta:hover { background: #E3CFAF; transform: translateY(-2px); }

        @media (max-width: 760px) {
          .v5-hero { padding: calc(var(--alto-barra) + 34px) 20px 86px; }
          .v5-hero-wrap { text-align: left; }
          .v5-hero-eyebrow { font-size: 11.5px; letter-spacing: .16em; margin-bottom: 14px; }
          .v5-hero-h1 { font-size: clamp(40px,11.5vw,52px); letter-spacing: -.045em; }
          .v5-hero-lead { margin: 16px 0 0; font-size: 15.5px; max-width: none; }
          .v5-hero-cta { display: block; text-align: center; margin-top: 22px; font-size: 16px; padding: 16px 24px; }
        }
      `}</style>
    </>
  );
}
