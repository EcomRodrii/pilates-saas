'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ACC, MUTED } from './theme';
import { NAV_LINKS } from './data';

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Con el menú a pantalla completa abierto, la página de detrás no debe
  // desplazarse (en iOS el scroll "atraviesa" el overlay si no se bloquea).
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  return (
    <>
      <div style={{ position: 'sticky', top: 0, zIndex: 90, height: 0, pointerEvents: 'none' }}>
        <div style={{ padding: '14px clamp(14px,4vw,28px) 0' }}>
        <nav
          style={{
            pointerEvents: 'auto',
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '9px 10px 9px 22px',
            borderRadius: 999,
            background: 'rgba(255,255,255,.55)',
            backdropFilter: 'blur(20px) saturate(160%)',
            border: '1px solid rgba(255,255,255,.6)',
            boxShadow: '0 10px 34px -8px rgba(26,26,26,.14), inset 0 1px 0 rgba(255,255,255,.5)',
          }}
        >
          <a href="#top" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Image src="/logo-wordmark.png" alt="Tentare" width={150} height={48} style={{ height: 26, width: 'auto' }} />
          </a>
          <div className="tnt-navlinks lp-mono" style={{ display: 'flex', gap: 28, alignItems: 'center', fontSize: 12.5, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} style={{ color: MUTED }}>{l.label}</a>
            ))}
          </div>
          <div className="tnt-navcta" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', padding: '9px 6px' }}>Entrar</Link>
            <Link href="#lista-espera" className="hover:brightness-110" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: ACC, padding: '11px 20px', borderRadius: 999, boxShadow: '0 10px 22px rgba(109,40,217,.28)' }}>
              Lista de espera
            </Link>
          </div>
          <button
            className="tnt-menubtn"
            onClick={() => setMenuOpen(true)}
            aria-label="Menú"
            style={{ display: 'none', border: '1px solid rgba(26,26,26,.1)', background: 'rgba(255,255,255,.7)', borderRadius: 999, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#1A1A1A', flexShrink: 0 }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1={3} y1={6} x2={21} y2={6} /><line x1={3} y1={12} x2={21} y2={12} /><line x1={3} y1={18} x2={21} y2={18} /></svg>
          </button>
        </nav>
        </div>
      </div>

      {menuOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 120, display: 'flex', flexDirection: 'column',
            background: '#0F0F0F', color: '#fff', padding: '18px 24px calc(28px + env(safe-area-inset-bottom, 0px))',
            animation: 'lp-fadeIn .25s ease both', overflowY: 'auto',
          }}
        >
          <div style={{ position: 'fixed', top: -160, right: -140, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.32), transparent 62%)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(28px,6vh,52px)', position: 'relative' }}>
            <span className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.4)' }}>Menú</span>
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Cerrar el menú"
              style={{ border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.06)', borderRadius: 999, width: 42, height: 42, cursor: 'pointer', fontSize: 20, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </button>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            {NAV_LINKS.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 14, padding: '15px 0',
                  fontSize: 'clamp(26px,7vw,32px)', fontWeight: 800, letterSpacing: '-.03em', color: '#fff',
                  borderBottom: '1px solid rgba(255,255,255,.08)',
                  animation: `lp-riseIn .55s cubic-bezier(.2,.7,0,1) ${0.08 + i * 0.06}s both`,
                }}
              >
                <span className="lp-mono" style={{ fontSize: 11, color: '#C9A6F5', letterSpacing: '.08em' }}>{String(i + 1).padStart(2, '0')}</span>
                {l.label}
              </a>
            ))}
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              style={{ textAlign: 'center', padding: 16, fontSize: 16, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 999, animation: 'lp-riseIn .55s cubic-bezier(.2,.7,0,1) .42s both' }}
            >
              Entrar
            </Link>
            <Link
              href="#lista-espera"
              onClick={() => setMenuOpen(false)}
              style={{ textAlign: 'center', padding: 16, fontSize: 16, fontWeight: 700, color: '#fff', background: ACC, borderRadius: 999, boxShadow: '0 14px 30px rgba(109,40,217,.4)', animation: 'lp-riseIn .55s cubic-bezier(.2,.7,0,1) .48s both' }}
            >
              Unirme a la lista de espera →
            </Link>
            <p className="lp-mono" style={{ textAlign: 'center', fontSize: 10.5, letterSpacing: '.06em', color: 'rgba(255,255,255,.32)', margin: '10px 0 0', animation: 'lp-fadeIn .6s ease .55s both' }}>
              Sin permanencia · Hecho en España
            </p>
          </div>
        </div>
      )}
    </>
  );
}
