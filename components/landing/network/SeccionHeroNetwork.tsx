'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW } from './data';

// Nav + primer viewport de la landing de Tentare Network — mismo lenguaje
// visual que la landing principal (SeccionHero.tsx: barra cápsula flotante,
// titular gigante sobre foto oscurecida), pero con SU narrativa: la
// audiencia no es "propietaria de estudio" sino "instructora buscando
// visibilidad", así que el titular invierte la búsqueda en vez de prometer
// control operativo.
//
// Reutiliza /disciplinas/pilates.jpg (la misma foto real que ya usa
// SeccionCtaFinal) en vez de encargar/inventar una foto nueva — solo cambia
// el velo a un tono verde para diferenciarla de la landing de Manager sin
// redibujar nada. Mismo criterio de marca que el logo: el producto se
// distingue por su color, no por rehacer el material.

const NAV_LINKS = [
  { href: '#problema', label: 'Por qué' },
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#confianza', label: 'Confianza' },
  { href: '#faq', label: 'FAQ' },
] as const;

export function SeccionHeroNetwork() {
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (!menuAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [menuAbierto]);

  return (
    <>
      <nav className="nw-nav" aria-label="Tentare Network">
        <Link href="/network/unirse" className="nw-nav-logo" aria-label="Tentare Network — inicio">
          <LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo />
        </Link>
        <div className="nw-nav-links">
          {NAV_LINKS.map(l => <a key={l.href} href={l.href}>{l.label}</a>)}
          <Link href="/network/instructoras">¿Eres un estudio?</Link>
        </div>
        <div className="nw-nav-acciones">
          <Link href="/login" className="nw-nav-entrar">Entrar</Link>
          <a href="#registro" className="nw-nav-cta">Crear mi perfil</a>
        </div>
        <button
          type="button"
          className="nw-nav-burger"
          aria-label="Abrir el menú"
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto(true)}
        >
          <span aria-hidden />
          <span aria-hidden />
        </button>
      </nav>

      {menuAbierto && (
        <div className="nw-menu" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="nw-menu-top">
            <span className="nw-menu-etiqueta">Menú</span>
            <button type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar el menú" className="nw-menu-cerrar">✕</button>
          </div>
          <nav className="nw-menu-links">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} onClick={() => setMenuAbierto(false)}>{l.label}</a>
            ))}
            <Link href="/network/instructoras" onClick={() => setMenuAbierto(false)}>¿Eres un estudio?</Link>
          </nav>
          <div className="nw-menu-pie">
            <Link href="/login" onClick={() => setMenuAbierto(false)} className="nw-menu-entrar">Entrar</Link>
            <a href="#registro" onClick={() => setMenuAbierto(false)} className="nw-menu-cta">Crear mi perfil</a>
          </div>
        </div>
      )}

      <header id="top" className="nw-hero">
        <Image src="/disciplinas/pilates.jpg" alt="" fill priority sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 38%' }} />
        <div className="nw-hero-velo" aria-hidden />
        <div className="nw-hero-wrap">
          <p className="nw-hero-eyebrow">Red profesional de instructoras de Pilates y Yoga</p>
          <h1 className="nw-hero-h1">Que te encuentren<br />los estudios.</h1>
          <p className="nw-hero-lead">
            Publica tu perfil gratis. Estudios de toda España buscan por especialidad, ciudad y
            disponibilidad — y te contactan ellos cuando encajas, no al revés.
          </p>
          <div className="nw-hero-acciones">
            <a href="#registro" className="nw-hero-cta">Crear mi perfil gratis</a>
            <Link href="/network/instructoras" className="nw-hero-cta-2">¿Eres un estudio? Busca instructoras →</Link>
          </div>
        </div>
      </header>

      <style>{`
        .nw-nav { position: sticky; top: 14px; z-index: 60; display: flex; align-items: center; gap: clamp(10px,1.6vw,22px);
          width: fit-content; max-width: calc(100vw - 28px); margin: 0 auto; padding: 8px 8px 8px 18px;
          border-radius: 999px; background: rgba(255,255,255,.72); backdrop-filter: blur(20px) saturate(1.6);
          border: 1px solid rgba(255,255,255,.6); box-shadow: 0 14px 44px rgba(26,26,26,.16); white-space: nowrap; }
        .nw-nav-logo { display: flex; align-items: center; flex-shrink: 0; }
        .nw-nav-links { display: flex; gap: clamp(10px,1.6vw,20px); }
        .nw-nav-links a { font-size: 14px; font-weight: 600; color: #3B3B34; }
        .nw-nav-links a:hover { color: #1A1A1A; }
        .nw-nav-acciones { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .nw-nav-entrar { font-size: 14px; font-weight: 600; color: #1A1A1A; padding: 9px 8px; }
        .nw-nav-cta { flex-shrink: 0; background: ${NW}; color: #fff; padding: 9px 18px; border-radius: 999px;
          font-weight: 700; font-size: 14px; transition: filter .2s; }
        .nw-nav-cta:hover { filter: brightness(1.08); }

        .nw-nav-burger { display: none; width: 40px; height: 40px; flex-shrink: 0; border-radius: 999px;
          border: 1px solid rgba(26,26,26,.12); background: rgba(255,255,255,.6); cursor: pointer;
          flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
        .nw-nav-burger span { display: block; width: 16px; height: 2px; border-radius: 2px; background: #1A1A1A; }
        .nw-nav-burger:focus-visible { outline: 2px solid ${NW}; outline-offset: 2px; }
        @media (max-width: 760px) {
          .nw-nav-links { display: none; }
          .nw-nav-burger { display: flex; }
        }
        @media (max-width: 420px) { .nw-nav-entrar { display: none; } }

        .nw-menu { position: fixed; inset: 0; z-index: 120; background: #0F0F0F; color: #fff;
          display: flex; flex-direction: column; overflow-y: auto;
          padding: 18px 24px calc(28px + env(safe-area-inset-bottom, 0px)); }
        .nw-menu-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: clamp(24px,6vh,52px); }
        .nw-menu-etiqueta { font-size: 11.5px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.4); }
        .nw-menu-cerrar { width: 42px; height: 42px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18);
          background: rgba(255,255,255,.06); color: #fff; font-size: 16px; cursor: pointer; }
        .nw-menu-links { display: flex; flex-direction: column; }
        .nw-menu-links a { padding: 15px 0; font-size: clamp(26px,7vw,32px); font-weight: 800; letter-spacing: -.03em;
          color: #fff; border-bottom: 1px solid rgba(255,255,255,.08); }
        .nw-menu-pie { margin-top: auto; padding-top: 32px; display: flex; flex-direction: column; gap: 10px; }
        .nw-menu-entrar { text-align: center; padding: 16px; font-size: 16px; font-weight: 600; color: #fff;
          background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); border-radius: 999px; }
        .nw-menu-cta { text-align: center; padding: 16px; font-size: 16px; font-weight: 700; color: #fff;
          background: ${NW}; border-radius: 999px; }

        #problema, #como-funciona, #confianza, #para-estudios, #faq, #registro { scroll-margin-top: 88px; }

        .nw-hero { --alto-barra: 58px; position: relative; isolation: isolate; overflow: hidden;
          margin-top: calc(-1 * var(--alto-barra));
          padding: calc(var(--alto-barra) + clamp(56px,9vh,104px)) clamp(20px,4vw,48px) clamp(96px,11vw,140px); }
        .nw-hero-velo { position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: linear-gradient(176deg,rgba(9,20,12,.88) 0%,rgba(9,20,12,.82) 40%,rgba(9,20,12,.92) 100%); }
        .nw-hero-wrap { position: relative; z-index: 2; max-width: 900px; margin: 0 auto; text-align: center; }
        .nw-hero-eyebrow { font-size: 13px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase;
          color: #9FCBA8; margin: 0 0 20px; }
        .nw-hero-h1 { font-size: clamp(40px,7vw,84px); font-weight: 800; line-height: .98; letter-spacing: -.05em;
          margin: 0 auto; color: #FCFBF6; text-wrap: balance; }
        .nw-hero-lead { margin: 22px auto 0; max-width: 52ch; font-size: clamp(16px,1.5vw,19px);
          line-height: 1.55; color: rgba(234,232,222,.88); }
        .nw-hero-acciones { display: flex; align-items: center; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 30px; }
        .nw-hero-cta { display: inline-block; background: ${NW}; color: #fff;
          font-weight: 800; font-size: 17px; padding: 18px 38px; border-radius: 999px; white-space: nowrap;
          transition: transform .2s, filter .2s; box-shadow: 0 18px 44px rgba(0,0,0,.35); }
        .nw-hero-cta:hover { filter: brightness(1.08); transform: translateY(-2px); }
        .nw-hero-cta-2 { font-size: 14px; font-weight: 600; color: rgba(255,255,255,.82); }
        .nw-hero-cta-2:hover { color: #fff; }

        @media (max-width: 760px) {
          .nw-hero { padding: calc(var(--alto-barra) + 34px) 20px 72px; }
          .nw-hero-wrap { text-align: left; }
          .nw-hero-eyebrow { font-size: 11.5px; letter-spacing: .16em; margin-bottom: 14px; }
          .nw-hero-h1 { font-size: clamp(36px,10.5vw,48px); letter-spacing: -.045em; }
          .nw-hero-lead { margin: 16px 0 0; font-size: 15.5px; max-width: none; }
          .nw-hero-acciones { justify-content: flex-start; margin-top: 22px; }
          .nw-hero-cta { display: block; text-align: center; font-size: 16px; padding: 16px 24px; }
        }
      `}</style>
    </>
  );
}
