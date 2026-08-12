'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NAV_V5 } from './enlaces';

// Secciones 01 (nav flotante + hero) de la landing v5.
//
// El vídeo de fondo reutiliza EXACTAMENTE la técnica ya resuelta en
// components/landing/Hero.tsx (autoplay bloqueado en iOS/Android → arranca
// invisible sobre el póster y se funde cuando confirma 'playing'; reintentos
// enganchados a los mismos gestos, nunca 'touchstart'). Los assets
// (/hero-video.mp4, /hero-video.webm, /hero-video-poster.jpg, /hero-panel.png)
// son los mismos que ya sirve la landing en producción — no hay vídeo ni
// captura nuevos que mantener en paralelo.
//
// El logo va con <LogoTentare>, nunca con un <img>: es la regla de marca del
// repo (docs/marca/), y el SVG en línea del kit ya resuelve modo oscuro y
// tinta sin depender de que una fuente esté instalada.
function HeroVideo() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nudge = () => {
      const video = wrapRef.current?.querySelector('video');
      if (!video) return;
      video.muted = true;
      if (video.paused) video.play().catch(() => {});
    };
    nudge();
    const GESTOS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
    GESTOS.forEach((ev) => window.addEventListener(ev, nudge, { passive: true }));
    document.addEventListener('visibilitychange', nudge);
    return () => {
      GESTOS.forEach((ev) => window.removeEventListener(ev, nudge));
      document.removeEventListener('visibilitychange', nudge);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, zIndex: -2, backgroundImage: 'url(/hero-video-poster.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      dangerouslySetInnerHTML={{
        __html: `<video autoplay loop muted playsinline preload="auto" onplaying="this.style.opacity=1" ontimeupdate="if(!this.paused)this.style.opacity=1" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .8s ease;pointer-events:none"><source src="/hero-video.webm" type="video/webm" /><source src="/hero-video.mp4" type="video/mp4" /></video>`,
      }}
    />
  );
}

export function SeccionHero() {
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
        </div>
        <Link href="/crear-estudio" className="v5-nav-cta">Probar Tentare</Link>
      </nav>

      <header id="top" className="v5-hero">
        <HeroVideo />
        <div className="v5-hero-velo" aria-hidden />
        <div className="v5-hero-wrap">
          <p className="v5-hero-eyebrow">Software para estudios de Pilates</p>
          <h1 className="v5-hero-h1">Todo lo que necesitas para dirigir tu estudio. Sin el caos.</h1>
          <div className="v5-hero-chips">
            {['Reservas', 'Pagos', 'Clientas', 'Equipo', 'App propia', 'Automatizaciones'].map((c) => (
              <span key={c}>{c}</span>
            ))}
            <span className="v5-hero-chip-oro">Sustituciones que se cubren solas</span>
          </div>
          <div className="v5-hero-acciones">
            <a href="#sustituciones" className="v5-hero-cta">Ver Tentare en acción ↓</a>
            <Link href="/crear-estudio" className="v5-hero-cta-2">Probar Tentare</Link>
          </div>
          <p className="v5-hero-nota">Sin permanencia · Migración incluida · Sin comisión sobre tus cobros · Hecho en España</p>

          <div className="v5-hero-mockup">
            <div className="v5-hero-mockup-barra">
              <span className="v5-hero-dot v5-hero-dot-on" />
              <span className="v5-hero-dot" />
              <span className="v5-hero-dot" />
              <span className="v5-hero-mockup-url">tentare.app · el producto real</span>
            </div>
            <div className="v5-hero-mockup-cuerpo">
              <Image src="/hero-panel.png" alt="Panel real de Tentare" width={2862} height={1360} sizes="(max-width: 1120px) 96vw, 1080px" priority style={{ width: '100%', height: 'auto', display: 'block' }} />
              <div className="v5-hero-mockup-fade" aria-hidden />
              <div className="v5-hero-badge">
                <span className="v5-hero-badge-tit">✓ Baja de las 18:00 cubierta</span>
                <span className="v5-hero-badge-sub">sin una llamada tuya</span>
              </div>
            </div>
          </div>
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
        .v5-nav-cta { flex-shrink: 0; background: #343825; color: #D9C29E; padding: 9px 18px; border-radius: 999px;
          font-weight: 700; font-size: 14px; transition: background .2s; }
        .v5-nav-cta:hover { background: #22251A; }
        @media (max-width: 760px) { .v5-nav-links { display: none; } }

        .v5-hero { position: relative; isolation: isolate; overflow: hidden;
          padding: clamp(60px,10vh,100px) clamp(20px,4vw,48px) clamp(60px,8vw,100px); }
        .v5-hero-velo { position: absolute; inset: 0; z-index: -1; pointer-events: none;
          background: linear-gradient(178deg,rgba(12,11,8,.78) 0%,rgba(12,11,8,.6) 42%,rgba(12,11,8,.72) 78%,rgba(12,11,8,.9) 100%); }
        .v5-hero-wrap { max-width: 1180px; margin: 0 auto; text-align: center; }
        .v5-hero-eyebrow { font-size: 13px; font-weight: 800; letter-spacing: .2em; color: #D9C29E; margin: 0 0 22px; }
        .v5-hero-h1 { font-size: clamp(38px,6vw,84px); font-weight: 800; line-height: .99; letter-spacing: -.045em;
          margin: 0 auto; max-width: 16ch; text-wrap: balance; color: #FCFBF6; }
        .v5-hero-chips { display: flex; justify-content: center; gap: 8px 14px; flex-wrap: wrap;
          margin: 26px auto 0; max-width: 760px; font-size: 14px; font-weight: 700; color: #EAE8DE; }
        .v5-hero-chips span:not(:last-child)::after { content: '·'; margin-left: 14px; color: rgba(252,251,246,.45); font-weight: 400; }
        .v5-hero-chip-oro { color: #D9C29E; }
        .v5-hero-acciones { display: flex; justify-content: center; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 34px; }
        .v5-hero-cta { background: #D9C29E; color: #23271A; font-weight: 800; font-size: 17px; padding: 18px 36px;
          border-radius: 999px; white-space: nowrap; transition: transform .2s, background .2s; box-shadow: 0 18px 44px rgba(0,0,0,.35); }
        .v5-hero-cta:hover { background: #E3CFAF; transform: translateY(-2px); }
        .v5-hero-cta-2 { font-weight: 700; font-size: 16px; color: #FCFBF6; padding: 17px 10px; border-bottom: 2px solid rgba(252,251,246,.6); }
        .v5-hero-nota { font-size: 12.5px; font-weight: 600; color: rgba(234,232,222,.75); margin: 22px 0 0; }

        .v5-hero-mockup { position: relative; max-width: 1080px; margin: 56px auto 0; border-radius: 18px; overflow: hidden;
          background: #0F0F0F; border: 1px solid rgba(255,255,255,.14); box-shadow: 0 60px 140px rgba(0,0,0,.55); }
        .v5-hero-mockup-barra { display: flex; align-items: center; gap: 8px; padding: 13px 18px; }
        .v5-hero-dot { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,.16); }
        .v5-hero-dot-on { background: #343825; }
        .v5-hero-mockup-url { flex: 1; text-align: center; font-size: 12px; font-weight: 600; color: rgba(255,255,255,.45); }
        .v5-hero-mockup-cuerpo { position: relative; max-height: 470px; overflow: hidden; }
        .v5-hero-mockup-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 110px;
          background: linear-gradient(180deg,rgba(15,15,15,0),rgba(15,15,15,.92)); }
        .v5-hero-badge { position: absolute; top: 18px; right: 18px; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 12px; padding: 10px 14px; box-shadow: 0 14px 34px rgba(26,26,26,.14); text-align: left; }
        .v5-hero-badge-tit { display: block; font-size: 12.5px; font-weight: 800; color: #2F6B4F; }
        .v5-hero-badge-sub { display: block; font-size: 11px; color: #8E8E86; }
      `}</style>
    </>
  );
}
