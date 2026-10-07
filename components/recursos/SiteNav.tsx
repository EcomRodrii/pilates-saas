import { LogoTentare } from '@/components/marca/logo-tentare';
import Link from 'next/link';
import { ChevronLeft, Menu } from 'lucide-react';
import { ACC } from '@/components/landing/theme';
import { MedicionPaginasPublicas } from '@/components/seo/MedicionPaginasPublicas';
import { MENU_PUBLICO } from '@/lib/seo/navegacion-publica';

// Barra superior de las páginas públicas que no son la landing (/recursos,
// /comparativa, /glosario, /seguridad, /funcionalidades…).
//
// ⚠️ A 390 px no caben logo, «volver», menú y botón en una fila: el «volver» se
// montaba encima del logo y del botón en todas esas páginas a la vez. El que
// cede es el «volver» (en las funcionalidades la miga de pan ya dice dónde
// estás) y el menú pasa a un desplegable; el logo y la llamada se quedan.
//
// El menú (7-oct-2026) sale de lib/seo/navegacion-publica.ts: antes la barra
// solo tenía «volver», y quien entraba desde Google en una comparativa o una
// guía no tenía cómo ir a las soluciones, a los precios o a las funcionalidades
// sin pasar por la home. El desplegable del móvil es un <details>: funciona sin
// JavaScript y se cierra solo al navegar.
export function SiteNav({ backHref = '/recursos', backLabel = 'Centro de Recursos' }: { backHref?: string; backLabel?: string }) {
  return (
    <>
    {/* Toda página pública con esta barra mide qué la trae al alta (no es la landing). */}
    <MedicionPaginasPublicas />
    <nav className="sitenav" aria-label="Navegación del sitio">
      <div className="sitenav-izq">
        <Link href="/" className="sitenav-logo" aria-label="Tentare — inicio">
          <LogoTentare formato="horizontal" alto={24} />
        </Link>
        <Link href={backHref} className="lp-mono sitenav-volver">
          <ChevronLeft size={14} aria-hidden />
          {backLabel}
        </Link>
      </div>
      <ul className="sitenav-menu">
        {MENU_PUBLICO.map((e) => (
          <li key={e.href}><Link href={e.href}>{e.label}</Link></li>
        ))}
      </ul>
      <div className="sitenav-der">
        <Link href="/crear-estudio" className="sitenav-cta">Probar gratis</Link>
        <details className="sitenav-mas">
          <summary aria-label="Abrir el menú"><Menu size={18} aria-hidden /></summary>
          <div className="sitenav-panel">
            {MENU_PUBLICO.map((e) => (
              <Link key={e.href} href={e.href}>{e.label}</Link>
            ))}
            <Link href="/sobre-tentare">Sobre Tentare</Link>
          </div>
        </details>
      </div>

      <style>{`
        .sitenav { position: sticky; top: 0; z-index: 90; display: flex; align-items: center;
          justify-content: space-between; gap: 12px; padding: 12px clamp(16px,4vw,44px);
          background: rgba(238,238,232,.84); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(26,26,26,.06); }
        .sitenav-izq, .sitenav-der { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .sitenav-logo { display: flex; align-items: center; flex: none; }
        .sitenav-volver { display: inline-flex; align-items: center; gap: 7px; min-width: 0;
          font-size: 12.5px; font-weight: 600; letter-spacing: .03em; color: #1A1A1A; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; padding: 7px 13px; border-radius: 999px;
          border: 1px solid rgba(26,26,26,.12); background: rgba(255,255,255,.6); }
        .sitenav-volver:hover { background: #fff; }
        .sitenav-menu { display: flex; align-items: center; gap: 2px; list-style: none; margin: 0; padding: 0; }
        .sitenav-menu a { display: block; padding: 8px 13px; border-radius: 999px; font-size: 14px; font-weight: 600;
          color: #2A2A25; text-decoration: none; transition: background var(--motion-fast) var(--motion-ease); }
        .sitenav-menu a:hover { background: rgba(255,255,255,.75); }
        .sitenav-cta { flex: none; font-size: 14px; font-weight: 700; color: #fff; background: ${ACC};
          padding: 10px 18px; border-radius: 999px; white-space: nowrap; text-decoration: none;
          box-shadow: 0 10px 22px rgba(52,56,37,.28); transition: filter .2s; }
        .sitenav-cta:hover { filter: brightness(1.1); }
        .sitenav-mas { display: none; position: relative; }
        .sitenav-mas summary { list-style: none; display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 999px; cursor: pointer; color: #1A1A1A;
          border: 1px solid rgba(26,26,26,.12); background: rgba(255,255,255,.7); }
        .sitenav-mas summary::-webkit-details-marker { display: none; }
        .sitenav-panel { position: absolute; right: 0; top: calc(100% + 10px); min-width: 220px; display: grid;
          padding: 8px; border-radius: 18px; background: #fff; border: 1px solid #E7E7E0;
          box-shadow: 0 30px 60px -28px rgba(26,26,26,.35); }
        .sitenav-panel a { padding: 12px 14px; border-radius: 12px; font-size: 15px; font-weight: 600; color: #1A1A1A; text-decoration: none; }
        .sitenav-panel a:hover { background: #F5F5F1; }
        @media (max-width: 1180px) { .sitenav-volver { display: none; } }
        @media (max-width: 920px) {
          .sitenav-menu { display: none; }
          .sitenav-mas { display: block; }
        }
        @media (max-width: 620px) { .sitenav-cta { font-size: 13.5px; padding: 9px 15px; } }
        @media (prefers-reduced-motion: reduce) { .sitenav-cta, .sitenav-menu a { transition: none; } }
      `}</style>
    </nav>
    </>
  );
}
