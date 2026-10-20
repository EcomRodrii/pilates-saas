'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { PildoraBusqueda } from '@/components/recursos/PildoraBusqueda';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { RecursosBlogStructuredData, RecursosBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { PortadaRecursos } from '@/components/recursos/PortadaRecursos';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import {
  CATEGORIAS_RECURSOS, DESTACADA, GUIAS, ORDEN_LISTADO, TARJETAS_SIN_GUIA,
  mesCorto, metaTarjeta, urlGuia,
  type CategoriaRecursos, type PortadaRecursos as Portada,
} from '@/lib/recursos/guias';
// Página de cliente: solo los metadatos (meta.ts), nunca index.ts, que trae el
// texto entero de los artículos al bundle.
import { ARTICULOS_META } from '@/lib/recursos/articulos/meta';
import { fechaArticulo, minutosLectura, urlArticulo } from '@/lib/recursos/articulos/util';
import { portadaArticulo } from '@/lib/recursos/articulos/portadas';

type Category = 'todos' | CategoriaRecursos;

const CATEGORIES: { key: Category; label: string }[] = [{ key: 'todos', label: 'Todos' }, ...CATEGORIAS_RECURSOS];

// Sin colores por categoría (1-oct-2026, el fundador): la foto manda; sin foto,
// la misma arena clara para todas.
const FONDO_SIN_FOTO = 'var(--w-sand-claro)';

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
// Los artículos escritos como datos (lib/recursos/articulos) van delante: son
// los que responden a lo que más buscan las propietarias. Su portada sale de
// lib/recursos/articulos/portadas.ts (sin ella, la tarjeta enseña el color de
// su categoría).
const ARTICULOS_DATOS: Article[] = ARTICULOS_META.filter((a) => a.slug !== DESTACADA).map((a) => ({
  category: a.categoria,
  title: a.titulo,
  body: a.resumen,
  href: urlArticulo(a.slug),
  meta: `${minutosLectura(a.palabras)} min · ${mesCorto(a.publicado)}`,
  portada: portadaArticulo(a.slug),
}));

const ARTICLES: Article[] = [...ARTICULOS_DATOS, ...ORDEN_LISTADO.map((clave) => {
  const g = GUIAS.find((x) => x.slug === clave);
  if (g) return { category: g.categoria, title: g.titulo, body: g.resumen, href: urlGuia(g.slug), meta: metaTarjeta(g), portada: g.portada };
  const t = TARJETAS_SIN_GUIA.find((x) => x.clave === clave);
  if (!t) throw new Error(`ORDEN_LISTADO: «${clave}» no es ni una guía ni una tarjeta registrada`);
  return { category: t.categoria, title: t.titulo, body: t.resumen, href: t.href, meta: t.meta, portada: t.portada };
})];

// La destacada es un artículo de datos (el pilar), y sale solo arriba: fuera
// de la rejilla para no repetirla.
const A_DESTACADA = ARTICULOS_META.find((a) => a.slug === DESTACADA);
const P_DESTACADA = A_DESTACADA && portadaArticulo(A_DESTACADA.slug);
if (!A_DESTACADA || !P_DESTACADA) throw new Error(`DESTACADA: «${DESTACADA}» no es ningún artículo con portada de lib/recursos/articulos`);
const FEATURED = {
  category: A_DESTACADA.categoria,
  title: A_DESTACADA.titulo,
  body: A_DESTACADA.resumen,
  href: urlArticulo(A_DESTACADA.slug),
  meta: `${minutosLectura(A_DESTACADA.palabras)} min de lectura · ${A_DESTACADA.actualizado ? 'Actualizado' : 'Publicado'} ${mesCorto(fechaArticulo(A_DESTACADA))}`,
  portada: P_DESTACADA,
};

// Lo que mide de verdad cada portada (ver .rec-grid y .rec-feat abajo). Nunca
// más de 480 px CSS (ANCHO_MAX_PORTADA): los originales no dan para más sin ampliar.
const SIZES_TARJETA = '(max-width: 524px) calc(100vw - 44px), (max-width: 900px) calc(50vw - 33px), (max-width: 1200px) calc(33vw - 44px), 356px';
const SIZES_DESTACADA = '(max-width: 572px) calc(100vw - 92px), 480px';

export default function RecursosPage() {
  const [cat, setCat] = useState<Category>('todos');
  // Lee ?q= una vez al montar: un enlace a /recursos?q=… llega ya filtrado.
  // (Lo anunciaba un SearchAction del JSON-LD, retirado el 23-sep: Google ya no
  // pinta ese cuadro de búsqueda. El ?q= se queda porque no cuesta nada.)
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
      <IslaWeb />

      {/* Cabecera editorial a la izquierda, en el ancho de la rejilla (la forma de
          bsport): sin el destello de color de antes ni titulares en 800. */}
      <header style={{ position: 'relative', padding: 'clamp(56px,7vw,96px) 0 clamp(32px,4vw,48px)' }}>
        {/* El mismo contenedor que los filtros y la rejilla, para que todo arranque en la misma línea. */}
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px)' }}>
          <h1 style={{ fontWeight: 600, fontSize: 'clamp(38px,5.4vw,64px)', lineHeight: 1.04, letterSpacing: 'var(--w-track-display)', margin: '0 0 20px', maxWidth: 820, color: 'var(--w-texto)' }}>
            <PildoraBusqueda>Guías para gestionar un estudio de Pilates</PildoraBusqueda>
            Cómo llenar, cobrar y<br className="rec-br" /> automatizar tu estudio.
          </h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: 'var(--w-texto-2)', maxWidth: 600, margin: '0 0 30px' }}>Guías prácticas para propietarias de estudios de pilates: ocupación, precios, sustituciones, retención y la parte administrativa que nadie te contó. Sin humo.</p>
          <div style={{ position: 'relative', maxWidth: 460 }}>
            <span style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--w-texto-3)' }}>
              <Search size={18} />
            </span>
            <input
              aria-label="Buscar en recursos"
              placeholder="Busca: sustituciones, precios, ocupación…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rec-buscar"
              style={{ width: '100%', fontFamily: 'inherit', fontSize: 15, color: 'var(--w-texto)', background: 'var(--w-papel)', border: '1px solid var(--w-linea)', borderRadius: 999, padding: '15px 18px 15px 48px' }}
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
                aria-pressed={active}
                style={{ border: active ? '1px solid var(--w-olive)' : '1px solid var(--w-linea)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '9px 17px', borderRadius: 999, background: active ? 'var(--w-olive)' : 'var(--w-papel)', color: active ? 'var(--w-cream)' : 'var(--w-texto-2)', transition: 'background .2s, color .2s' }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {featuredVisible && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 clamp(20px,4vw,44px)', marginBottom: 44 }}>
          <div className="rec-card" style={{ background: 'var(--w-papel)', border: '1px solid var(--w-linea)', borderRadius: 'var(--w-r-tarjeta)', overflow: 'hidden' }}>
            <div className="rec-feat">
              {/* La portada a su tamaño (480 px como mucho), enmarcada en el
                  degradado de su categoría: estirarla para rellenar la columna
                  la ampliaría por encima de su original. */}
              <div className="rec-feat-media" style={{ background: FONDO_SIN_FOTO }}>
                <div className="rec-feat-foto">
                  <PortadaRecursos portada={FEATURED.portada} sizes={SIZES_DESTACADA} prioritaria className="rec-portada" />
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', padding: 18, background: 'linear-gradient(to top, rgba(15,15,15,.62), transparent 60%)' }}>
                    <div>
                      <span style={{ display: 'inline-block', fontSize: 13, fontWeight: 600, color: 'var(--w-ink)', background: 'rgba(255,255,255,.88)', padding: '5px 12px', borderRadius: 999 }}>Guía destacada</span>
                    </div>
                  </div>
                </div>
              </div>
              <Link href={FEATURED.href} style={{ padding: 'clamp(26px,3vw,40px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}>
                <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: 'var(--w-olive)' }}>{CATEGORIES.find((c) => c.key === FEATURED.category)?.label}</p>
                <h2 style={{ fontWeight: 600, fontSize: 'clamp(26px,2.8vw,36px)', lineHeight: 1.1, letterSpacing: 'var(--w-track-h2)', margin: '0 0 12px', color: 'var(--w-texto)' }}>{FEATURED.title}</h2>
                <p style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--w-texto-2)', margin: '0 0 20px' }}>{FEATURED.body}</p>
                <div style={{ fontSize: 14, color: 'var(--w-texto-3)' }}>{FEATURED.meta}</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 22, fontSize: 15, fontWeight: 600, color: 'var(--w-olive)' }}>
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
                <div style={{ position: 'relative', aspectRatio: '2/1', background: FONDO_SIN_FOTO, overflow: 'hidden' }}>
                  {a.portada && <PortadaRecursos portada={a.portada} sizes={SIZES_TARJETA} className="rec-portada" />}
                  {!a.href && (
                    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 14 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--w-ink)', background: 'rgba(255,255,255,.88)', padding: '4px 10px', borderRadius: 999 }}>Próximamente</span>
                    </div>
                  )}
                </div>
                <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  {/* La categoría, en texto y fuera de la foto: sin píldora oscura encima ni color por categoría (#2458). */}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--w-olive)' }}>{CATEGORIES.find((c) => c.key === a.category)?.label}</span>
                  <h3 style={{ fontSize: 19, fontWeight: 600, letterSpacing: 'var(--w-track-h3)', lineHeight: 1.2, margin: 0, color: 'var(--w-texto)' }}>{a.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--w-texto-2)', margin: 0, flex: 1 }}>{a.body}</p>
                  <div style={{ fontSize: 13, color: 'var(--w-texto-3)', marginTop: 4 }}>{a.meta}</div>
                </div>
              </>
            );
            const style: React.CSSProperties = { display: 'flex', flexDirection: 'column', background: 'var(--w-papel)', border: '1px solid var(--w-linea)', borderRadius: 'var(--w-r-tarjeta)', overflow: 'hidden' };
            return a.href ? (
              <Link key={a.title} href={a.href} className="rec-card" style={{ ...style, textDecoration: 'none', color: 'inherit' }}>{card}</Link>
            ) : (
              <div key={a.title} className="rec-card" style={style}>{card}</div>
            );
          })}
          {filtered.length === 0 && !featuredVisible && (
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--w-texto-2)', padding: '40px 0' }}>No hay guías que coincidan con tu búsqueda todavía.</p>
          )}
        </div>

        <div style={{ marginTop: 'clamp(48px,6vw,72px)', background: 'var(--w-noche)', color: 'var(--w-sobre-noche)', borderRadius: 'var(--w-r-tarjeta)', padding: 'clamp(32px,5vw,56px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'relative', maxWidth: 560 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--w-sand)', margin: '0 0 14px' }}>La newsletter de Tentare</p>
            <h2 style={{ fontWeight: 600, fontSize: 'clamp(26px,3.4vw,40px)', lineHeight: 1.08, letterSpacing: 'var(--w-track-h2)', margin: '0 0 12px', color: 'var(--w-sobre-noche)' }}>Una idea al mes para llenar tu estudio.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--w-sobre-noche-2)', margin: '0 0 24px' }}>Guías nuevas, plantillas y datos del sector. Sin spam — cancelas cuando quieras.</p>
            <a
              href="mailto:hola@tentare.app?subject=Suscribirme%20a%20la%20newsletter"
              className="hover:brightness-110"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: 'var(--w-olive)', background: 'var(--w-sand)', borderRadius: 999, padding: '14px 26px' }}
            >
              Suscribirme por email
            </a>
          </div>
        </div>
      </div>

      <PieWeb />

      <style>{`
        .rec-feat { display: grid; grid-template-columns: minmax(0,528px) minmax(0,1fr); gap: 0; }
        .rec-feat-media { display: flex; align-items: center; justify-content: center; padding: 24px; }
        .rec-feat-foto { position: relative; width: 100%; max-width: 480px; aspect-ratio: 2/1; border-radius: 16px;
          overflow: hidden; background: rgba(255,255,255,.08); box-shadow: 0 24px 50px -30px rgba(0,0,0,.6); }
        .rec-portada { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .rec-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 22px; }
        .rec-card { transition: transform .28s cubic-bezier(.2,.7,0,1), box-shadow .28s; }
        .rec-card:hover { transform: translateY(-4px); box-shadow: var(--w-sombra-suave); }
        .rec-buscar:focus-visible { outline: 2px solid var(--w-olive); outline-offset: 2px; }
        @media (max-width: 900px) {
          .rec-feat { grid-template-columns: 1fr; }
          .rec-grid { grid-template-columns: repeat(2,1fr); }
        }
        /* Una columna solo hasta 524 px: más ancha, una tarjeta a todo el ancho
           mediría más que los 480 px de la portada y se ampliaría. */
        @media (max-width: 524px) {
          .rec-grid { grid-template-columns: 1fr; }
          /* En el móvil el salto dejaba la «y» sola en su línea. */
          .rec-br { display: none; }
        }
      `}</style>
    </PageShell>
  );
}
