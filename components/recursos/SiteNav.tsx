import { LogoTentare } from '@/components/marca/logo-tentare';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ACC } from '@/components/landing/theme';

// Barra superior de las páginas públicas que no son la landing (/recursos,
// /comparativa, /glosario, /seguridad, /funcionalidades…).
//
// ⚠️ Tres elementos en una fila SIN ningún ajuste por ancho: a 390 px el enlace
// del medio se montaba encima del logo Y del botón, en todas esas páginas a la
// vez. Se veía en cualquier móvil. El enlace de vuelta es el que cede —es el
// menos crítico de los tres y, en las páginas de funcionalidad, la miga de pan
// del encabezado ya dice dónde estás—; el logo y la llamada a la acción se
// quedan siempre.
export function SiteNav({ backHref = '/recursos', backLabel = 'Centro de Recursos' }: { backHref?: string; backLabel?: string }) {
  return (
    <nav className="sitenav">
      <Link href="/" className="sitenav-logo">
        <LogoTentare formato="horizontal" alto={24} />
      </Link>
      <Link href={backHref} className="lp-mono sitenav-volver">
        <ChevronLeft size={14} aria-hidden />
        {backLabel}
      </Link>
      <Link href="/crear-estudio" className="sitenav-cta">Crear estudio</Link>

      <style>{`
        .sitenav { position: sticky; top: 0; z-index: 90; display: flex; align-items: center;
          justify-content: space-between; gap: 12px; padding: 14px clamp(16px,4vw,44px);
          background: rgba(238,238,232,.82); backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(26,26,26,.05); }
        .sitenav-logo { display: flex; align-items: center; flex: none; }
        .sitenav-volver { display: inline-flex; align-items: center; gap: 7px; min-width: 0;
          font-size: 12px; letter-spacing: .03em; color: #5A5A52; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; }
        .sitenav-volver:hover { color: #1A1A1A; }
        .sitenav-cta { flex: none; font-size: 14px; font-weight: 700; color: #fff; background: ${ACC};
          padding: 10px 18px; border-radius: 999px; white-space: nowrap;
          box-shadow: 0 10px 22px rgba(52,56,37,.28); transition: filter .2s; }
        .sitenav-cta:hover { filter: brightness(1.1); }
        @media (max-width: 620px) {
          .sitenav-volver { display: none; }
          .sitenav-cta { font-size: 13.5px; padding: 9px 15px; }
        }
        @media (prefers-reduced-motion: reduce) { .sitenav-cta { transition: none; } }
      `}</style>
    </nav>
  );
}
