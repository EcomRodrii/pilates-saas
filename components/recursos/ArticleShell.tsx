'use client';

import Link from 'next/link';
import { ACC } from '@/components/landing/theme';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { SiteNav } from './SiteNav';
import { SiteFooter } from './SiteFooter';
import { mesCorto } from '@/lib/recursos/guias';

export type TocItem = { id: string; label: string };

export function ArticleShell({
  category,
  title,
  intro,
  readTime,
  actualizado,
  backHref,
  backLabel,
  children,
}: {
  category: string;
  /** Ya no se pinta: se mantiene para no romper a quien lo pasa. */
  kind?: string;
  /** Ya no se pinta (1-oct-2026, el fundador: «quita los fondos de colores»). */
  coverGradient?: string;
  title: string;
  intro: string;
  readTime: string;
  /**
   * Última fecha del contenido (AAAA-MM-DD). Las guías de /recursos la pasan
   * desde su registro (lib/recursos/guias.ts), la misma que su JSON-LD. Sin
   * ella se queda el texto que llevaba antes (la comparativa de Glofox).
   */
  actualizado?: string;
  /** Ya no se pinta un índice lateral; los anclajes de cada sección siguen. */
  toc?: TocItem[];
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  // Diseño editorial (1-oct-2026). El fundador: los fondos de colores por
  // categoría y la estructura de «web hecha con IA» (cabecera de color con
  // destello, etiquetas en máquina de escribir, índice lateral fijo, cajas de
  // colores) fuera. Ahora es un artículo de blog normal: título y autor sobre el
  // fondo de la página, la foto y una sola columna de texto.
  return (
    <>
      {/* Todas las páginas que usan este armazón (9 guías de /recursos + la
          comparativa larga de Glofox) llevaban Article/Breadcrumb propios pero
          ninguna Organization/WebSite — auditoría SEO 2026-08-18. Un único
          punto, no 10 imports repetidos. */}
      <OrganizationStructuredData />
      <SiteNav {...(backHref ? { backHref, backLabel } : {})} />

      <header className="art-head">
        <p className="art-kicker"><Link href="/recursos">{category}</Link></p>
        <h1>{title}</h1>
        <p className="art-dek">{intro}</p>
        {/* Autor visible con nombre real (no "Equipo Tentare") — señal de
            E-E-A-T explícita, auditoría GEO 2026-08-20. Mismo nombre que ya
            consta en /legal (Marcos Roca Rodríguez), en su forma pública. */}
        <p className="art-byline">
          Por <strong>Marcos Roca</strong>, fundador de Tentare · {readTime} · Actualizado {actualizado ? mesCorto(actualizado) : 'jul 2026'}
        </p>
      </header>

      <article className="art-body">{children}</article>

      <SiteFooter />

      <style>{`
        .art-head { max-width: 720px; margin: 0 auto; padding: clamp(40px,6vw,72px) clamp(20px,4vw,24px) 8px; }
        .art-kicker { margin: 0 0 14px; font-size: 14px; font-weight: 600; }
        .art-kicker a { color: ${ACC}; text-decoration: none; }
        .art-kicker a:hover { text-decoration: underline; text-underline-offset: 3px; }
        .art-head h1 { font-weight: 800; font-size: clamp(30px,4.6vw,46px); line-height: 1.08; letter-spacing: -.03em; color: #1A1A1A; margin: 0 0 18px; }
        .art-dek { font-size: clamp(18px,1.7vw,20px); line-height: 1.55; color: #4A4A44; margin: 0 0 22px; }
        .art-byline { font-size: 14px; color: #6B6B63; margin: 0; padding-bottom: 28px; border-bottom: 1px solid #E1E1D9; }
        .art-byline strong { color: #1A1A1A; font-weight: 600; }
        .art-body { max-width: 720px; margin: 0 auto; padding: 28px clamp(20px,4vw,24px) clamp(60px,8vw,96px); }
        .art-body h2 { font-weight: 800; font-size: clamp(24px,3vw,30px); line-height: 1.15; letter-spacing: -.025em; color: #1A1A1A; margin: 48px 0 14px; scroll-margin-top: 96px; }
        .art-body h3 { font-weight: 700; font-size: 19px; letter-spacing: -.01em; margin: 28px 0 8px; }
        .art-body p { font-size: 18px; line-height: 1.7; color: #33332D; margin: 0 0 20px; }
        .art-body li { font-size: 18px; line-height: 1.65; color: #33332D; }
        .art-body strong { color: #1A1A1A; font-weight: 700; }
        .art-body a { color: ${ACC}; text-decoration: underline; text-underline-offset: 3px; }
        .art-lead { font-size: 20px !important; line-height: 1.6 !important; color: #1A1A1A !important; }
        .art-cta2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .art-related-card { transition: transform .2s, box-shadow .2s; }
        .art-related-card:hover { transform: translateY(-4px); box-shadow: 0 26px 50px -30px rgba(26,26,26,.3); }
        @media (max-width: 900px) { .art-cta2 { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
