import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { PildoraBusqueda } from '@/components/recursos/PildoraBusqueda';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';

// Índice de /soluciones (fase 5 del rediseño, 23-sep). Hasta entonces la URL
// daba 404 aunque colgaran de ella tres páginas: un hueco en las migas de pan y
// en el árbol que Google recorre. Las tarjetas salen del registro
// (`relacionadas` de esta página en lib/seo/paginas.ts), no de una lista aquí.
//
// 7-oct-2026: la primera tarjeta es el estudio de Pilates, que vive en la home
// (es la página de «software para estudios de Pilates»: no se duplica aquí), y
// cada tarjeta lleva la foto de su tipo de estudio cuando la hay.

const PATH = '/soluciones';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

/** La foto de cada tarjeta, si su tipo de estudio tiene una real (fotos.ts / fotos aportadas). */
const FOTO: Record<string, { src: string; alt: string; pos?: string }> = {
  '/soluciones/estudio-de-pilates-reformer': { src: '/landing/fotos/reformers-madera-tapizado-negro-plazas-640.webp', alt: 'Fila de reformers con tapizado negro en un estudio de Pilates' },
  '/soluciones/programa-de-gestion-para-estudio-de-pilates': { src: '/landing/fotos/sala-pilates-espejos-arco-anoche-560.webp', alt: 'Sala de un estudio de Pilates con espejos y un arco iluminado por la noche' },
  '/soluciones/estudio-de-yoga': { src: '/landing/fotos-aportadas/alumna-con-movil-y-esterilla-de-yoga-432.webp', alt: 'Alumna sonriendo con el móvil y una esterilla de yoga', pos: '50% 22%' },
  '/funcionalidades/multi-centro': { src: '/landing/fotos/sala-pilates-reformers-madera-cierre-768.webp', alt: 'Sala de un estudio de Pilates con una fila de reformers de madera clara' },
};

export default function SolucionesPage() {
  const soluciones = relacionadasDe(PATH);
  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Soluciones" />
      <SiteNav backHref="/" backLabel="Inicio" />

      <header style={{ padding: 'clamp(44px,6vw,80px) clamp(20px,4vw,44px) clamp(28px,4vw,44px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(36px,5.4vw,62px)', lineHeight: 1.02, letterSpacing: '-.038em', margin: '0 0 18px', maxWidth: '18ch' }}>
            <PildoraBusqueda>Software para cada tipo de estudio</PildoraBusqueda>
            Tentare, según tu estudio.
          </h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 640, margin: 0 }}>
            El mismo producto y el mismo precio público, contado desde lo que más le importa a cada estudio: un estudio de
            Pilates, uno de reformer, uno de yoga, varias sedes o quien viene de otro programa.
          </p>
        </div>
      </header>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,80px)' }}>
        <div className="solh-grid">
          <Link href="/" className="solh-card solh-card-ancha">
            <span className="lp-mono solh-eyebrow">La más buscada</span>
            <span className="solh-nombre">Estudio de Pilates</span>
            <span className="solh-resumen">Reservas y lista de espera, app con tu marca, bonos, cuotas y cobros automáticos: todo lo que necesita un estudio de Pilates, en un solo programa.</span>
            <span className="solh-ir">Software para estudios de Pilates <ArrowRight size={15} aria-hidden /></span>
          </Link>
          {soluciones.map((s) => {
            const f = FOTO[s.path];
            return (
              <Link key={s.path} href={s.path} className={f ? 'solh-card solh-card-foto' : 'solh-card'}>
                {f && (
                  <span className="solh-foto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.src} alt={f.alt} loading="lazy" decoding="async" style={{ objectPosition: f.pos ?? 'center' }} />
                  </span>
                )}
                <span className="solh-cuerpo">
                  <span className="solh-nombre">{s.etiqueta}</span>
                  <span className="solh-resumen">{s.resumen ?? s.descripcion}</span>
                  <span className="solh-ir">Ver la solución <ArrowRight size={15} aria-hidden /></span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(64px,8vw,110px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Pruébalo con tu estudio de verdad." body="7 días gratis, sin tarjeta y sin permanencia." cta="Probar 7 días gratis" />
        </div>
      </section>

      <SiteFooter />

      <style>{`
        .solh-grid { max-width: 1080px; margin: 0 auto; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; }
        .solh-card { display: flex; flex-direction: column; background: #fff; border: 1px solid #E7E7E0; border-radius: 22px; overflow: hidden;
          text-decoration: none; transition: transform var(--motion-normal) var(--motion-ease), box-shadow var(--motion-normal) var(--motion-ease); }
        .solh-card:hover { transform: translateY(-4px); box-shadow: 0 32px 60px -36px rgba(26,26,26,.35); }
        .solh-card-ancha { grid-column: 1 / -1; padding: clamp(26px,3.6vw,40px); background: ${ACC}; border-color: ${ACC}; }
        .solh-card-ancha .solh-nombre { color: #fff; font-size: clamp(24px,2.8vw,32px); }
        .solh-card-ancha .solh-resumen { color: #DDE0CB; max-width: 60ch; font-size: 16px; }
        .solh-card-ancha .solh-ir { color: #fff; }
        .solh-eyebrow { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #C9CDB3; margin-bottom: 10px; }
        .solh-foto { display: block; aspect-ratio: 16 / 9; overflow: hidden; background: #DCDBD2; }
        .solh-foto img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .6s var(--motion-ease); }
        .solh-card:hover .solh-foto img { transform: scale(1.03); }
        .solh-cuerpo { display: flex; flex-direction: column; padding: 22px 24px 24px; flex: 1; }
        .solh-card:not(.solh-card-foto):not(.solh-card-ancha) { padding: 22px 24px 24px; }
        .solh-nombre { display: block; font-size: 20px; font-weight: 800; letter-spacing: -.015em; color: #1A1A1A; margin-bottom: 8px; }
        .solh-resumen { display: block; font-size: 14.5px; line-height: 1.55; color: ${MUTED}; margin-bottom: 16px; }
        .solh-ir { margin-top: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 14.5px; font-weight: 700; color: ${ACC}; }
        @media (max-width: 760px) { .solh-grid { grid-template-columns: minmax(0,1fr); } }
        @media (prefers-reduced-motion: reduce) { .solh-card, .solh-foto img { transition: none; } }
      `}</style>
    </PageShell>
  );
}
