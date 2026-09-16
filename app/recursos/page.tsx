'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { RecursosBlogStructuredData, RecursosBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { PortadaRecursos } from '@/components/recursos/PortadaRecursos';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import {
  CATEGORIAS_RECURSOS, DESTACADA, GUIAS, ORDEN_LISTADO, TARJETAS_SIN_GUIA,
  fechaModificada, guia, mesCorto, metaTarjeta, urlGuia,
  type CategoriaRecursos, type PortadaRecursos as Portada,
} from '@/lib/recursos/guias';

type Category = 'todos' | CategoriaRecursos;

const CATEGORIES: { key: Category; label: string }[] = [{ key: 'todos', label: 'Todos' }, ...CATEGORIAS_RECURSOS];

const CATEGORY_GRADIENTS: Record<CategoriaRecursos, string> = {
  sustituciones: 'linear-gradient(140deg,#22463a,#4E9E7F)',
  rentabilidad: 'linear-gradient(140deg,#1f3d42,#3E7C86)',
  operacion: 'linear-gradient(140deg,#5e2318,#C2503A)',
  espana: 'linear-gradient(140deg,#22251A,#5A6142)',
  software: 'linear-gradient(140deg,#1C1F14,#343825)',
};

type Article = {
  category: CategoriaRecursos;
  title: string;
  body: string;
  href?: string;
  meta: string;
  portada?: Portada;
};

// Las tarjetas y la destacada salen del registro de guías (lib/recursos/guias.ts):
// título, texto, fechas, minutos y portada ya no se escriben aquí. El pie de cada
// tarjeta («9 min · ago 2026») se deriva de la misma fecha que el JSON-LD.
const ARTICLES: Article[] = ORDEN_LISTADO.map((clave) => {
  const g = GUIAS.find((x) => x.slug === clave);
  if (g) return { category: g.categoria, title: g.titulo, body: g.resumen, href: urlGuia(g.slug), meta: metaTarjeta(g), portada: g.portada };
  const t = TARJETAS_SIN_GUIA.find((x) => x.clave === clave);
  if (!t) throw new Error(`ORDEN_LISTADO: «${clave}» no es ni una guía ni una tarjeta registrada`);
  return { category: t.categoria, title: t.titulo, body: t.resumen, href: t.href, meta: t.meta, portada: t.portada };
});

const G_DESTACADA = guia(DESTACADA);
const FEATURED = {
  category: G_DESTACADA.categoria,
  title: G_DESTACADA.titulo,
  body: G_DESTACADA.resumen,
  href: urlGuia(G_DESTACADA.slug),
  meta: `${G_DESTACADA.lectura} min de lectura · Actualizado ${mesCorto(fechaModificada(G_DESTACADA))}`,
  portada: G_DESTACADA.portada,
};

// Lo que mide de verdad cada portada (ver .rec-grid y .rec-feat abajo). Nunca
// más de 480 px CSS (ANCHO_MAX_PORTADA): los originales no dan para más sin ampliar.
const SIZES_TARJETA = '(max-width: 524px) calc(100vw - 44px), (max-width: 900px) calc(50vw - 33px), (max-width: 1200px) calc(33vw - 44px), 356px';
const SIZES_DESTACADA = '(max-width: 572px) calc(100vw - 92px), 480px';

export default function RecursosPage() {
  const [cat, setCat] = useState<Category>('todos');
  // Lee ?q= una vez al montar para que el SearchAction del WebSite JSON-LD
  // (components/OrganizationStructuredData.tsx) sea real, no solo declarado.
  const [query, setQuery] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? ''));

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      ARTICLES.filter((a) => (cat === 'todos' || a.category === cat) && (!q || a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q))),
    [cat, q]
  );
  const featuredVisible = (cat === 'todos' || cat === FEATURED.category) && (!q || FEATURED.title.toLowerCase().includes(q) || FEATURED.body.toLowerCase().includes(q));

  return (
    <PageShell>
      <OrganizationStructuredData />
      <RecursosBreadcrumb />
      <RecursosBlogStructuredData />
      <SiteNav backHref="/recursos" backLabel="Recursos" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,48px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Centro de Recursos</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(36px,5.4vw,62px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Cómo llenar, cobrar y<br />automatizar tu estudio.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 560, margin: '0 0 30px' }}>Guías prácticas para propietarias de estudios de pilates: ocupación, precios, sustituciones, retención y la parte administrativa que nadie te contó. Sin humo.</p>
          <div style={{ position: 'relative', maxWidth: 460 }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#A8A89F' }}>
              <Search size={18} />
            </span>
            <input
              aria-label="Buscar en recursos"
              placeholder="Busca: sustituciones, precios, ocupación…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 15, color: '#1A1A1A', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '15px 16px 15px 46px', outline: 'none' }}
            />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px)', marginBottom: 34 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => {
            const active = cat === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setCat(c.key)}
                style={{ border: active ? 'none' : '1px solid #E1E1D8', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 999, background: active ? ACC : '#fff', color: active ? '#fff' : '#5A5A52', transition: 'background .2s, color .2s' }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {featuredVisible && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px)', marginBottom: 44 }}>
          <div className="rec-card" style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 24, overflow: 'hidden', boxShadow: '0 30px 60px -40px rgba(26,26,26,.3)' }}>
            <div className="rec-feat">
              {/* La portada a su tamaño (480 px como mucho), enmarcada en el
                  degradado de su categoría: estirarla para rellenar la columna
                  la ampliaría por encima de su original. */}
              <div className="rec-feat-media" style={{ background: CATEGORY_GRADIENTS[FEATURED.category] }}>
                <div className="rec-feat-foto">
                  <PortadaRecursos portada={FEATURED.portada} sizes={SIZES_DESTACADA} prioritaria className="rec-portada" />
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', padding: 18, background: 'linear-gradient(to top, rgba(15,15,15,.62), transparent 60%)' }}>
                    <div>
                      <span className="lp-mono" style={{ display: 'inline-block', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#fff', background: 'rgba(15,15,15,.42)', padding: '5px 11px', borderRadius: 999, marginBottom: 10 }}>★ Guía destacada</span>
                      <div className="lp-mono" style={{ fontSize: 12, color: 'rgba(255,255,255,.9)' }}>{CATEGORIES.find((c) => c.key === FEATURED.category)?.label}</div>
                    </div>
                  </div>
                </div>
              </div>
              <Link href={FEATURED.href} style={{ padding: 'clamp(26px,3vw,40px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>
                <h2 style={{ fontWeight: 800, fontSize: 'clamp(24px,2.6vw,34px)', lineHeight: 1.08, letterSpacing: '-.03em', margin: '0 0 12px' }}>{FEATURED.title}</h2>
                <p style={{ fontSize: 16, lineHeight: 1.6, color: MUTED, margin: '0 0 20px' }}>{FEATURED.body}</p>
                <div className="lp-mono" style={{ fontSize: 12, color: '#8E8E86' }}>{FEATURED.meta}</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 22, fontSize: 15, fontWeight: 700, color: ACC }}>
                  Leer la guía <ArrowRight size={16} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px) clamp(60px,8vw,96px)' }}>
        <div className="rec-grid">
          {filtered.map((a) => {
            const card = (
              <>
                <div style={{ position: 'relative', aspectRatio: '2/1', background: CATEGORY_GRADIENTS[a.category], overflow: 'hidden' }}>
                  {a.portada && <PortadaRecursos portada={a.portada} sizes={SIZES_TARJETA} className="rec-portada" />}
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: 14, background: 'linear-gradient(to top, rgba(15,15,15,.55), transparent 60%)' }}>
                    <span className="lp-mono" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#fff', background: 'rgba(15,15,15,.42)', padding: '5px 10px', borderRadius: 999 }}>
                      {CATEGORIES.find((c) => c.key === a.category)?.label}
                    </span>
                    {!a.href && <span className="lp-mono" style={{ fontSize: 9.5, color: '#fff', background: 'rgba(0,0,0,.3)', padding: '4px 9px', borderRadius: 999 }}>Próximamente</span>}
                  </div>
                </div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.15, margin: 0 }}>{a.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0, flex: 1 }}>{a.body}</p>
                  <div className="lp-mono" style={{ fontSize: 11.5, color: a.href ? '#8E8E86' : '#A8A89F' }}>{a.meta}</div>
                </div>
              </>
            );
            const style: React.CSSProperties = { display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 20, overflow: 'hidden' };
            return a.href ? (
              <Link key={a.title} href={a.href} className="rec-card" style={{ ...style, textDecoration: 'none', color: 'inherit' }}>{card}</Link>
            ) : (
              <div key={a.title} className="rec-card" style={style}>{card}</div>
            );
          })}
          {filtered.length === 0 && !featuredVisible && (
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: MUTED, padding: '40px 0' }}>No hay guías que coincidan con tu búsqueda todavía.</p>
          )}
        </div>

        <div style={{ marginTop: 'clamp(48px,6vw,72px)', background: '#0F0F0F', color: '#E8E8E4', borderRadius: 26, padding: 'clamp(32px,5vw,56px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-30%', right: '-6%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,97,66,.3), transparent 64%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', maxWidth: 520 }}>
            <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#A8B080', marginBottom: 14 }}>La newsletter de Tentare</div>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,3.4vw,40px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 12px', color: '#fff' }}>Una idea al mes para llenar tu estudio.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: '#A6A69E', margin: '0 0 24px' }}>Guías nuevas, plantillas y datos del sector. Sin spam — cancelas cuando quieras.</p>
            <a
              href="mailto:hola@tentare.app?subject=Suscribirme%20a%20la%20newsletter"
              className="hover:brightness-110"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'inherit', fontSize: 15, fontWeight: 700, color: '#fff', background: ACC, borderRadius: 12, padding: '14px 24px' }}
            >
              Suscribirme por email
            </a>
          </div>
        </div>
      </div>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/glosario', label: 'Glosario' }]} />

      <style>{`
        .rec-feat { display: grid; grid-template-columns: minmax(0,528px) minmax(0,1fr); gap: 0; }
        .rec-feat-media { display: flex; align-items: center; justify-content: center; padding: 24px; }
        .rec-feat-foto { position: relative; width: 100%; max-width: 480px; aspect-ratio: 2/1; border-radius: 16px;
          overflow: hidden; background: rgba(255,255,255,.08); box-shadow: 0 24px 50px -30px rgba(0,0,0,.6); }
        .rec-portada { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .rec-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 22px; }
        .rec-card { transition: transform .28s cubic-bezier(.2,.7,0,1), box-shadow .28s; }
        .rec-card:hover { transform: translateY(-6px); box-shadow: 0 40px 74px -40px rgba(26,26,26,.32); }
        @media (max-width: 900px) {
          .rec-feat { grid-template-columns: 1fr; }
          .rec-grid { grid-template-columns: repeat(2,1fr); }
        }
        /* Una columna solo hasta 524 px: más ancha, una tarjeta a todo el ancho
           mediría más que los 480 px de la portada y se ampliaría. */
        @media (max-width: 524px) {
          .rec-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </PageShell>
  );
}
