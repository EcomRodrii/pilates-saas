'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ACC } from '@/components/landing/theme';
import { SiteNav } from './SiteNav';
import { SiteFooter } from './SiteFooter';

export type TocItem = { id: string; label: string };

export function ArticleShell({
  category,
  coverGradient,
  title,
  intro,
  readTime,
  toc,
  children,
}: {
  category: string;
  coverGradient: string;
  title: string;
  intro: string;
  readTime: string;
  toc: TocItem[];
  children: React.ReactNode;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(toc[0]?.id ?? '');

  useEffect(() => {
    const sections = toc
      .map((t) => document.getElementById(t.id))
      .filter(Boolean) as HTMLElement[];
    let ticking = false;
    function update() {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight || 1;
      if (barRef.current) barRef.current.style.width = `${Math.min(100, (window.scrollY / max) * 100)}%`;
      let activo = sections[0]?.id ?? '';
      for (const s of sections) {
        if (s.getBoundingClientRect().top <= 140) activo = s.id;
      }
      setActive(activo);
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, [toc]);

  return (
    <>
      <div ref={barRef} style={{ position: 'fixed', top: 0, left: 0, height: 3, width: 0, background: ACC, zIndex: 120, boxShadow: '0 0 10px rgba(124,58,237,.5)' }} />
      <SiteNav />

      <header style={{ position: 'relative', background: coverGradient, color: '#fff', overflow: 'hidden', padding: 'clamp(48px,7vw,84px) clamp(20px,4vw,44px) clamp(40px,5vw,60px)' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-6%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.14), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.8)', marginBottom: 20 }}>
            <span style={{ background: 'rgba(255,255,255,.16)', padding: '5px 12px', borderRadius: 999 }}>{category}</span>
            <span>Guía</span>
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(30px,5vw,54px)', lineHeight: 1.04, letterSpacing: '-.035em', margin: '0 0 22px', maxWidth: '17ch' }}>{title}</h1>
          <p style={{ fontSize: 'clamp(17px,1.6vw,20px)', lineHeight: 1.55, color: 'rgba(255,255,255,.86)', maxWidth: 600, margin: '0 0 28px' }}>{intro}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#fff' }}>T</span>
              <div><div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>Equipo Tentare</div><div className="lp-mono" style={{ fontSize: 11, color: 'rgba(255,255,255,.7)' }}>Contenido</div></div>
            </div>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,.4)' }} />
            <span className="lp-mono" style={{ fontSize: 12, color: 'rgba(255,255,255,.8)' }}>{readTime}</span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,.4)' }} />
            <span className="lp-mono" style={{ fontSize: 12, color: 'rgba(255,255,255,.8)' }}>Actualizado jul 2026</span>
          </div>
        </div>
      </header>

      <div style={{ padding: 'clamp(40px,6vw,72px) 0 clamp(60px,8vw,96px)' }}>
        <div className="art-wrap">
          <aside className="art-toc">
            <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 14 }}>En esta guía</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, borderLeft: '2px solid #E1E1D9' }}>
              {toc.map((t) => {
                const on = active === t.id;
                return (
                  <a
                    key={t.id}
                    href={`#${t.id}`}
                    style={{ fontSize: 13.5, lineHeight: 1.4, color: on ? ACC : '#5A5A52', fontWeight: on ? 700 : 400, padding: '7px 0 7px 14px', marginLeft: -2, borderLeft: `2px solid ${on ? ACC : 'transparent'}`, transition: 'color .2s, border-color .2s' }}
                  >
                    {t.label}
                  </a>
                );
              })}
            </nav>
            <Link href="/#precio" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 24, fontSize: 13, fontWeight: 700, color: ACC }}>
              Ver Tentare <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </Link>
          </aside>

          <article className="art-body">{children}</article>
        </div>
      </div>

      <SiteFooter />

      <style>{`
        .art-wrap { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: 230px minmax(0,1fr); gap: clamp(28px,5vw,64px); padding: 0 clamp(20px,4vw,44px); }
        .art-toc { position: sticky; top: 96px; align-self: start; }
        .art-body { max-width: 720px; }
        .art-body h2 { font-weight: 800; font-size: clamp(24px,3vw,32px); line-height: 1.12; letter-spacing: -.03em; margin: 44px 0 14px; scroll-margin-top: 96px; }
        .art-body h3 { font-weight: 700; font-size: 19px; letter-spacing: -.01em; margin: 26px 0 8px; }
        .art-body p { font-size: 17px; line-height: 1.68; color: #3A3A34; margin: 0 0 18px; }
        .art-body strong { color: #1A1A1A; font-weight: 700; }
        .art-cta2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .art-related-card { transition: transform .2s, box-shadow .2s; }
        .art-related-card:hover { transform: translateY(-4px); box-shadow: 0 26px 50px -30px rgba(26,26,26,.3); }
        @media (max-width: 900px) {
          .art-wrap { grid-template-columns: 1fr; }
          .art-toc { display: none; }
          .art-cta2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
