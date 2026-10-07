import { LogoTentare } from '@/components/marca/logo-tentare';
import Link from 'next/link';
import { PIE_PUBLICO } from '@/lib/seo/navegacion-publica';
import { TRIAL_DIAS } from '@/lib/billing/trial';

// Pie de todas las páginas públicas interiores. El árbol entero del sitio sale de
// lib/seo/navegacion-publica.ts (ver allí por qué dejó de ser una lista de tres
// enlaces por página). Los títulos de columna son párrafos, no h2: el pie no
// debe entrar en el esquema de encabezados de cada página.
export function SiteFooter() {
  return (
    <footer className="sf">
      <div className="sf-in">
        <div className="sf-cabeza">
          <Link href="/" aria-label="Tentare — inicio">
            {/* negativo: el pie va sobre tinta. */}
            <LogoTentare formato="horizontal" tinta="negativo" alto={26} />
          </Link>
          <p className="sf-lema">Software para estudios de Pilates y yoga. Reservas, app con tu marca, bonos y cobros, con precio público y sin permanencia.</p>
          <Link href="/crear-estudio" className="sf-cta">Probar {TRIAL_DIAS} días gratis</Link>
        </div>

        <nav className="sf-cols" aria-label="Mapa del sitio">
          {PIE_PUBLICO.map((col) => (
            <div key={col.titulo} className="sf-col">
              <p className="lp-mono sf-titulo">{col.titulo}</p>
              <ul>
                {col.enlaces.map((e) => (
                  <li key={e.href}><Link href={e.href}>{e.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <p className="lp-mono sf-base">© 2026 Tentare · Software de gestión para estudios de Pilates y yoga · Hecho en España</p>
      </div>

      <style>{`
        .sf { background: #0F0F0F; color: #A6A69E; padding: clamp(52px,7vw,84px) clamp(20px,4vw,44px) 32px; }
        .sf-in { max-width: 1180px; margin: 0 auto; }
        .sf-cabeza { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 28px;
          padding-bottom: clamp(32px,4vw,44px); border-bottom: 1px solid rgba(255,255,255,.08); }
        .sf-lema { margin: 0; max-width: 520px; font-size: 14.5px; line-height: 1.55; color: #A6A69E; }
        .sf-cta { justify-self: end; white-space: nowrap; font-size: 14.5px; font-weight: 700; color: #1A1A1A;
          background: #EEEEE8; padding: 12px 22px; border-radius: 999px; text-decoration: none;
          transition: transform var(--motion-normal) var(--motion-ease), background var(--motion-normal) var(--motion-ease); }
        .sf-cta:hover { background: #fff; transform: translateY(-1px); }
        .sf-cols { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 28px 24px;
          padding: clamp(32px,4vw,44px) 0; }
        .sf-titulo { margin: 0 0 14px; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #6E6E68; }
        .sf-col ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
        .sf-col a { font-size: 14px; line-height: 1.35; color: #D4D4CC; text-decoration: none; }
        .sf-col a:hover { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
        .sf-base { margin: 0; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.08); font-size: 12px; color: #6E6E68; }
        @media (max-width: 980px) {
          .sf-cabeza { grid-template-columns: 1fr; gap: 18px; }
          .sf-cta { justify-self: start; }
          .sf-cols { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }
        @media (max-width: 420px) { .sf-col a { font-size: 13.5px; } }
        @media (prefers-reduced-motion: reduce) { .sf-cta { transition: none; } }
      `}</style>
    </footer>
  );
}
