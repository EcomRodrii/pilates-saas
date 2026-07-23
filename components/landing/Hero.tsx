'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ACC, BG, btnCta } from './theme';
import { IconCheck } from './icons';

// Restores the source design's hero parallax tilt: the mockup rotates in 3D
// as the cursor moves over it. Disabled for touch pointers and
// prefers-reduced-motion, and driven via direct DOM writes (not React state)
// so the tilt tracks the pointer at 60fps without re-rendering the tree.
function useHeroTilt() {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const tilt = tiltRef.current;
    if (!stage || !tilt) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (reduce || coarse) return;

    function onMove(e: MouseEvent) {
      const r = stage!.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      tilt!.style.transform = `rotateX(${py * -8}deg) rotateY(${px * 10}deg)`;
    }
    function onLeave() {
      tilt!.style.transform = 'rotateX(0deg) rotateY(0deg)';
    }
    stage.addEventListener('mousemove', onMove);
    stage.addEventListener('mouseleave', onLeave);
    return () => {
      stage.removeEventListener('mousemove', onMove);
      stage.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return { stageRef, tiltRef };
}

export function Hero() {
  const { stageRef, tiltRef } = useHeroTilt();

  return (
    <header id="top" style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) 56px', overflow: 'hidden', isolation: 'isolate' }}>
      <video
        autoPlay
        loop
        muted
        playsInline
        poster="/hero-video-poster.jpg"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -2 }}
      >
        <source src="/hero-video.webm" type="video/webm" />
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(10,9,12,.88) 0%, rgba(10,9,12,.82) 34%, rgba(10,9,12,.42) 62%, rgba(10,9,12,.6) 100%)', zIndex: -1 }} />
      <div style={{ position: 'absolute', top: -140, right: -120, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(124,58,237,.28), transparent 62%)', pointerEvents: 'none' }} />
      <div className="tnt-wrap tnt-hero" style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.02fr .98fr', gap: 52, alignItems: 'center' }}>
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(38px,5.6vw,66px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px', color: '#fff' }}>
            <span style={{ display: 'block', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .06s both' }}>El software que lleva</span>
            <span style={{ display: 'block', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .15s both' }}>tu estudio de pilates.</span>
          </h1>
          <p style={{ fontSize: 'clamp(18px,1.7vw,23px)', fontWeight: 600, lineHeight: 1.35, color: '#F3F2ED', margin: '0 0 18px', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .24s both' }}>
            Reservas, cobros y equipo en un panel — y la única plataforma que cubre una baja de instructora{' '}
            <span style={{ position: 'relative', whiteSpace: 'nowrap', color: '#C9A6F5' }}>
              sola.
              <svg viewBox="0 0 90 14" style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 12, overflow: 'visible' }}>
                <path d="M3 9 C 25 3, 65 3, 87 8" fill="none" stroke="#C9A6F5" strokeWidth={5} strokeLinecap="round" strokeDasharray={100} strokeDashoffset={100} style={{ animation: 'lp-dash 1s ease .7s forwards' }} />
              </svg>
            </span>
          </p>
          <p style={{ fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: '#C9C9C2', maxWidth: 470, margin: '0 0 32px', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .32s both' }}>
            Cuando una instructora avisa de que no puede, Tentare busca sustituta, la contacta y avisa a las alumnas antes de que cuelgues el teléfono. Tú solo apruebas.
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 22, animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .42s both' }}>
            <Link href="/crear-estudio" className={btnCta} style={{ fontSize: 16, fontWeight: 700, padding: '16px 28px', boxShadow: '0 16px 34px rgba(109,40,217,.34)' }}>
              Crear mi estudio →
            </Link>
          </div>
          <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.03em', color: '#B8B8B0', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .5s both' }}>
            Sin permanencia · Fácil de usar desde el día 1 · Hecho en España
          </div>
        </div>

        {/* ===== HERO PRODUCT MOCKUP ===== */}
        <div
          ref={stageRef}
          className="tnt-herostage"
          style={{ position: 'relative', width: '100%', maxWidth: 560, marginLeft: 'auto', perspective: 1900, animation: 'lp-riseIn 1.1s cubic-bezier(.2,.7,0,1) .3s both' }}
        >
          <div ref={tiltRef} style={{ position: 'relative', width: '100%', transformStyle: 'preserve-3d', transition: 'transform .3s ease-out' }}>
            <div style={{ position: 'relative', width: '82%', animation: 'lp-floatA 8s ease-in-out infinite' }}>
              <div style={{ borderRadius: 15, background: 'linear-gradient(#232326,#131315)', padding: '8px 8px 11px', boxShadow: '0 40px 80px -24px rgba(26,26,26,.42), 0 8px 22px rgba(26,26,26,.18)' }}>
                <div style={{ borderRadius: 6, overflow: 'hidden', background: BG }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#E9E9E2', borderBottom: '1px solid #E1E1D9' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: ACC }} />
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
                    </div>
                    <div className="lp-mono" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#A8A89F' }}>tentare.app</div>
                  </div>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '2862 / 1360' }}>
                    <Image src="/hero-panel.png" alt="Panel de Tentare" fill sizes="(max-width: 960px) 90vw, 460px" style={{ objectFit: 'cover', objectPosition: 'top' }} priority />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: 'absolute', right: 0, bottom: 0, width: '30%', animation: 'lp-floatB 6.6s ease-in-out infinite', zIndex: 4 }}>
              <div style={{ background: 'linear-gradient(150deg,#46464b,#1e1e21 42%,#33333a)', borderRadius: 28, padding: 5, boxShadow: '-22px 34px 60px -18px rgba(26,26,26,.5)' }}>
                <div style={{ background: '#000', borderRadius: 24, padding: 3 }}>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1206 / 2622', borderRadius: 21, overflow: 'hidden' }}>
                    <Image src="/hero-app.png" alt="App de Tentare en el móvil" fill sizes="(max-width: 960px) 30vw, 168px" style={{ objectFit: 'cover' }} priority />
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: 'absolute', top: '8%', left: '-4%', zIndex: 6, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #E4EFE9', borderRadius: 14, padding: '10px 13px', boxShadow: '0 18px 40px -14px rgba(26,26,26,.26)', animation: 'lp-floatY 5s ease-in-out infinite' }} className="tnt-herobadge">
              <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: '#E7F3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4E9E7F' }}>{IconCheck(16)}</span>
              <div><div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>Baja cubierta sola</div><div className="lp-mono" style={{ fontSize: 10.5, color: '#8E8E86' }}>sin una llamada</div></div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
