import type { Metadata } from 'next';
import Link from 'next/link';
import { MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';

// Índice de /soluciones (fase 5 del rediseño, 23-sep). Hasta entonces la URL
// daba 404 aunque colgaran de ella tres páginas: un hueco en las migas de pan y
// en el árbol que Google recorre. Las tarjetas salen del registro
// (`relacionadas` de esta página en lib/seo/paginas.ts), no de una lista aquí.

const PATH = '/soluciones';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

export default function SolucionesPage() {
  const soluciones = relacionadasDe(PATH);
  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Soluciones" />
      <SiteNav backHref="/" backLabel="Inicio" />

      <header style={{ padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(28px,4vw,40px)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,56px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 18px' }}>Tentare, según tu estudio.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>El mismo producto y el mismo precio público, contado desde lo que más le importa a cada tipo de estudio.</p>
        </div>
      </header>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        <div className="sol-grid" style={{ maxWidth: 900, margin: '0 auto' }}>
          {soluciones.map((s) => (
            <Link key={s.path} href={s.path} className="sol-card">
              <span className="sol-nombre">{s.etiqueta}</span>
              <span className="sol-resumen">{s.resumen ?? s.descripcion}</span>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(64px,8vw,110px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Pruébalo con tu estudio de verdad." body="7 días gratis, sin tarjeta y sin permanencia." cta="Probar 7 días gratis" />
        </div>
      </section>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }]} />

      <style>{`
        .sol-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 16px; }
        .sol-card { display: block; background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 24px;
          text-decoration: none; transition: transform var(--motion-normal) var(--motion-ease), box-shadow var(--motion-normal) var(--motion-ease); }
        .sol-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        .sol-nombre { display: block; font-size: 18px; font-weight: 800; letter-spacing: -.01em; color: #1A1A1A; margin-bottom: 8px; }
        .sol-resumen { display: block; font-size: 14px; line-height: 1.55; color: ${MUTED}; }
        @media (max-width: 760px) { .sol-grid { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .sol-card { transition: none; } }
      `}</style>
    </PageShell>
  );
}
