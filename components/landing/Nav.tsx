'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ACC, BG, MUTED } from './theme';
import { NAV_LINKS } from './data';

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div style={{ position: 'sticky', top: 0, zIndex: 90, padding: '14px clamp(14px,4vw,28px) 0', pointerEvents: 'none' }}>
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
            <Link href="/crear-estudio" className="hover:brightness-110" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: ACC, padding: '11px 20px', borderRadius: 999, boxShadow: '0 10px 22px rgba(109,40,217,.28)' }}>
              Crear estudio
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

      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,15,15,.5)', backdropFilter: 'blur(6px)' }} onClick={() => setMenuOpen(false)}>
          <div
            style={{ position: 'absolute', top: 0, right: 0, width: 'min(84vw,340px)', height: '100%', background: BG, padding: 24, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '-20px 0 60px rgba(15,15,15,.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Image src="/logo-wordmark.png" alt="Tentare" width={150} height={48} style={{ height: 26, width: 'auto' }} />
              <button onClick={() => setMenuOpen(false)} aria-label="Cerrar" style={{ border: 'none', background: '#fff', borderRadius: 10, width: 40, height: 40, cursor: 'pointer', fontSize: 20, color: '#1A1A1A' }}>×</button>
            </div>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{ padding: '14px 8px', fontSize: 18, fontWeight: 600, color: '#1A1A1A', borderBottom: '1px solid #E1E1D8' }}>{l.label}</a>
            ))}
            <Link href="/login" onClick={() => setMenuOpen(false)} style={{ marginTop: 16, textAlign: 'center', padding: 15, fontSize: 16, fontWeight: 600, color: '#1A1A1A', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14 }}>Entrar</Link>
            <Link href="/crear-estudio" onClick={() => setMenuOpen(false)} style={{ textAlign: 'center', padding: 15, fontSize: 16, fontWeight: 700, color: '#fff', background: ACC, borderRadius: 14 }}>Crear estudio</Link>
          </div>
        </div>
      )}
    </>
  );
}
