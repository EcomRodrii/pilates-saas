'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LifeBuoy, Search, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { ACC, MUTED } from '@/components/landing/theme';
import { AyudaIcono } from '@/components/ayuda/iconos';
import { CATEGORIAS, articulosPublicadosDe } from '@/lib/ayuda/registro';
import { buscarArticulos, categoriasSugeridas } from '@/lib/ayuda/busqueda';

export default function AyudaHomePage() {
  const [query, setQuery] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? ''));
  const q = query.trim();

  const resultados = useMemo(() => (q ? buscarArticulos(q) : []), [q]);
  const sugeridas = useMemo(() => (q && resultados.length === 0 ? categoriasSugeridas(q) : []), [q, resultados.length]);

  return (
    <PageShell>
      <OrganizationStructuredData />
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,48px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>
            <Sparkles size={13} /> Centro de Ayuda
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(32px,5vw,54px)', lineHeight: 1.04, letterSpacing: '-.035em', margin: '0 0 18px' }}>¿En qué podemos ayudarte?</h1>
          <p style={{ fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: MUTED, margin: '0 auto 30px', maxWidth: 520 }}>
            Cómo configurar tu estudio, gestionar reservas y pagos, personalizar tu portal y qué hacer cuando algo no va.
          </p>
          <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
            <span style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: '#A8A89F' }}>
              <Search size={19} />
            </span>
            <input
              autoFocus
              aria-label="Buscar en la ayuda de Tentare"
              placeholder="Buscar en la ayuda de Tentare…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 16, color: '#1A1A1A', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '17px 18px 17px 50px', outline: 'none', boxShadow: '0 24px 48px -32px rgba(26,26,26,.28)' }}
            />
          </div>
        </div>
      </header>

      {q ? (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 clamp(20px,4vw,44px) clamp(56px,7vw,80px)' }}>
          <p className="lp-mono" style={{ fontSize: 12, color: '#8E8E86', marginBottom: 18 }}>
            {resultados.length > 0 ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'} para «${q}»` : `Sin resultados para «${q}»`}
          </p>

          {resultados.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {resultados.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="ayuda-resultado"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 20px', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, textDecoration: 'none', color: 'inherit' }}
                >
                  <div>
                    <p className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', margin: '0 0 5px' }}>{r.categoriaTitulo}</p>
                    <p style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 4px' }}>{r.articulo.titulo}</p>
                    <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>{r.articulo.descripcion}</p>
                  </div>
                  <ArrowRight size={16} style={{ flex: 'none', color: '#8E8E86' }} />
                </Link>
              ))}
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 14.5, color: MUTED, marginBottom: 18 }}>No hemos encontrado ningún artículo para «{q}». Quizá te interese:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                {sugeridas.map((c) => (
                  <Link key={c.slug} href={`/ayuda/${c.slug}`} style={{ display: 'block', padding: '14px 16px', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, textDecoration: 'none', color: 'inherit', fontSize: 13.5, fontWeight: 700 }}>
                    {c.titulo}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 clamp(20px,4vw,44px) clamp(56px,7vw,80px)' }}>
          <div className="ayuda-grid">
            {CATEGORIAS.map((c) => {
              const nPublicados = articulosPublicadosDe(c.slug).length;
              return (
                <Link key={c.slug} href={`/ayuda/${c.slug}`} className="ayuda-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 22, background: '#fff', border: '1px solid #E7E7E0', borderRadius: 20, textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: '#F1F2EA', display: 'grid', placeItems: 'center' }}>
                    <AyudaIcono nombre={c.icono} size={18} color={ACC} />
                  </span>
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.01em' }}>{c.titulo}</p>
                    <p style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED, margin: 0 }}>{c.descripcion}</p>
                  </div>
                  <span className="lp-mono" style={{ marginTop: 'auto', fontSize: 11.5, color: '#8E8E86' }}>
                    {nPublicados > 0 ? `${nPublicados} artículo${nPublicados === 1 ? '' : 's'}` : 'En preparación'}
                  </span>
                </Link>
              );
            })}
          </div>

          <div style={{ marginTop: 'clamp(48px,6vw,72px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, background: '#0F0F0F', color: '#E8E8E4', borderRadius: 26, padding: 'clamp(28px,4vw,40px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: 'rgba(255,255,255,.08)', display: 'grid', placeItems: 'center' }}>
                <LifeBuoy size={19} />
              </span>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>¿No encuentras lo que buscas?</p>
                <p style={{ fontSize: 13.5, color: '#A6A69E', margin: '3px 0 0' }}>Nuestro equipo puede ayudarte.</p>
              </div>
            </div>
            <a href="mailto:soporte@tentare.app" className="hover:brightness-110" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: ACC, borderRadius: 12, padding: '13px 22px' }}>
              Contactar con soporte
            </a>
          </div>
        </div>
      )}

      <SiteFooter links={[{ href: '/ayuda/novedades', label: 'Novedades' }, { href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }]} />

      <style>{`
        .ayuda-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .ayuda-card, .ayuda-resultado { transition: border-color .15s, transform .15s; }
        .ayuda-card:hover, .ayuda-resultado:hover { border-color: ${ACC}; transform: translateY(-3px); }
        @media (max-width: 900px) { .ayuda-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 600px) { .ayuda-grid { grid-template-columns: 1fr; } }
      `}</style>
    </PageShell>
  );
}
