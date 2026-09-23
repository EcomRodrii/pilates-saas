import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { funcionalidades } from '@/lib/seo/paginas';
import { SALIDAS } from './enlaces';

// Vitrina de funcionalidades de la home: un enlace por área, cada uno con su
// viñeta a dos tintas (oliva #343825 + arena #D9C29E). Título y resumen salen
// del registro (`lib/seo/paginas.ts`), así que un área nueva entra sola.
//
// Desde el rediseño del 23-sep es una FILA de enlaces, no una rejilla de 17
// tarjetas con resumen: la home vende la transformación y los bloques de arriba
// ya cuentan lo importante. Los 17 enlaces se quedan (son la puerta de la home
// al árbol de /funcionalidades, lo que el SEO necesita); el resumen de cada uno
// vive en su página.
//
// Conserva id="funcionalidades" (ancla del nav) y aria-labelledby.

// Viñetas (dibujadas a 48 y pintadas a 40 px). Trazo oliva, relleno héroe arena,
// secundarios #B9BFA3 y blanco. viewBox 48, strokeWidth 2, remates redondos.
const ICONOS: Record<string, React.ReactNode> = {
  '/funcionalidades/lista-de-espera': (
    <>
      <rect x="6" y="6.5" width="27" height="9" rx="4.5" fill="#D9C29E" />
      <circle cx="11.5" cy="11" r="2.2" fill="#343825" stroke="none" />
      <path d="M16.5 11h11" stroke="#343825" />
      <rect x="6" y="19.5" width="27" height="9" rx="4.5" fill="#fff" />
      <circle cx="11.5" cy="24" r="2.2" fill="#B9BFA3" stroke="none" />
      <path d="M16.5 24h8" stroke="#B9BFA3" />
      <rect x="6" y="32.5" width="27" height="9" rx="4.5" fill="#fff" />
      <circle cx="11.5" cy="37" r="2.2" fill="#B9BFA3" stroke="none" />
      <path d="M16.5 37h10" stroke="#B9BFA3" />
      <path d="M41 34.5V14" />
      <path d="m36.5 18.5 4.5-4.5 4.5 4.5" />
      <circle cx="41" cy="41" r="2" fill="#343825" stroke="none" />
    </>
  ),
  '/funcionalidades/calendario-y-salas': (
    <>
      <path d="M15 4v6M33 4v6" />
      <rect x="6" y="7" width="36" height="35" rx="5" fill="#fff" />
      <path d="M6 16h36" />
      <rect x="11.5" y="21" width="10" height="7.5" rx="2" fill="#D9C29E" stroke="none" />
      <path d="M14 24.7h5" stroke="#343825" strokeWidth={1.6} />
      <rect x="26.5" y="30.5" width="10" height="7.5" rx="2" fill="#D9C29E" stroke="none" />
      <path d="M29 34.2h5" stroke="#343825" strokeWidth={1.6} />
      <circle cx="27" cy="24.7" r="1.5" fill="#B9BFA3" stroke="none" />
      <circle cx="33" cy="24.7" r="1.5" fill="#B9BFA3" stroke="none" />
      <circle cx="15" cy="34.2" r="1.5" fill="#B9BFA3" stroke="none" />
      <circle cx="21" cy="34.2" r="1.5" fill="#B9BFA3" stroke="none" />
    </>
  ),
  '/funcionalidades/gestion-de-instructoras': (
    <>
      <circle cx="32.5" cy="14.5" r="5.5" fill="#D9C29E" />
      <path d="M42.5 35v-2c0-4.2-3-7.8-7-8.7" />
      <circle cx="17.5" cy="16" r="7" fill="#fff" />
      <path d="M5.5 40v-2c0-5 4-9 9-9h6c5 0 9 4 9 9v2" fill="#fff" />
      <rect x="33" y="38" width="12" height="8" rx="3" fill="#D9C29E" />
      <path d="M36.7 42h4.6" stroke="#343825" />
      <path d="M5 22.5h4M3 17.5h4.5" stroke="#B9BFA3" />
    </>
  ),
  '/funcionalidades/sustituciones': (
    <>
      <circle cx="13" cy="13" r="7" fill="#fff" />
      <circle cx="17.8" cy="7.8" r="3.4" fill="#fff" strokeWidth={1.7} />
      <path d="M16.6 7.8h2.4M17.8 6.6v2.4" strokeWidth={1.7} />
      <circle cx="35" cy="35" r="7" fill="#D9C29E" />
      <path d="m31.8 35 2.4 2.4 4-4.4" />
      <path d="M25 8h10a5 5 0 0 1 5 5v6" />
      <path d="m36.5 15.5 3.5 4 3.5-4" />
      <path d="M23 40H13a5 5 0 0 1-5-5v-6" />
      <path d="m4.5 32.5 3.5-4 3.5 4" />
    </>
  ),
  '/funcionalidades/bonos-y-membresias': (
    <>
      <path d="M4 17a4 4 0 0 0 0 8v7a4 4 0 0 0 4 4h30a4 4 0 0 0 4-4v-7a4 4 0 0 1 0-8v-3a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4Z" fill="#fff" />
      <path d="M31 12v3.5M31 21v4M31 29.5V34" strokeDasharray="0.1 5.4" />
      <rect x="9.5" y="19" width="9" height="9" rx="2.5" fill="#D9C29E" stroke="none" />
      <path d="m11.8 23.5 1.7 1.7 3.2-3.4" stroke="#343825" />
      <rect x="21" y="19" width="6.5" height="9" rx="2.5" fill="none" stroke="#B9BFA3" strokeDasharray="0.1 4" />
      <path d="M36 21.5v5M38.5 24h-5" stroke="#B9BFA3" />
    </>
  ),
  '/funcionalidades/facturacion': (
    <>
      <path d="M10 8a4 4 0 0 1 4-4h13l11 11v25a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4Z" fill="#fff" />
      <path d="M27 4v7a4 4 0 0 0 4 4h7" />
      <path d="M16 20h10M16 26h12M16 32h6" stroke="#B9BFA3" />
      <circle cx="31" cy="33.5" r="7" fill="#D9C29E" />
      <path d="m28 33.5 2.2 2.2 4-4.4" />
      <path d="m27 39.5-1.8 4M35 39.5l1.8 4" strokeWidth={1.7} />
    </>
  ),
  '/funcionalidades/ficha-de-clienta': (
    <>
      <rect x="4" y="10" width="40" height="28" rx="4.5" fill="#fff" />
      <circle cx="15" cy="20.5" r="4.8" fill="#D9C29E" />
      <path d="M8.5 32.5c1-3.6 3.5-5.5 6.5-5.5s5.5 1.9 6.5 5.5" />
      <path d="M27 17.5h12M27 22.5h9" stroke="#B9BFA3" />
      <path d="M27 28.5h2l1.5-3 2 5 1.5-2h3" strokeWidth={1.7} />
      <path d="M35.5 31v6M32.5 34h6" strokeWidth={1.9} />
    </>
  ),
  '/funcionalidades/automatizaciones-y-avisos': (
    <>
      <path d="M26 5 12.5 27h8.5L19.5 43 33 21h-8.5L26 5Z" fill="#D9C29E" />
      <circle cx="9" cy="10" r="2.6" fill="#fff" />
      <circle cx="40" cy="13" r="2.6" fill="#fff" />
      <circle cx="41" cy="36" r="2.6" fill="#fff" />
      <path d="M11.3 11.6 17 16M37.8 14.5 31 19M39 34.6l-6.5-3.4" stroke="#B9BFA3" strokeDasharray="0.1 3.6" />
    </>
  ),
  '/funcionalidades/informes-y-rentabilidad': (
    <>
      <path d="M7 6v33a3 3 0 0 0 3 3h31" />
      <rect x="13" y="27" width="7" height="9" rx="2" fill="#fff" />
      <rect x="24" y="19" width="7" height="17" rx="2" fill="#fff" />
      <rect x="35" y="10" width="7" height="26" rx="2" fill="#D9C29E" />
      <path d="M13.5 20.5 22 15l8-3.5 8-4.5" stroke="#B9BFA3" strokeDasharray="0.1 4" />
      <circle cx="38.5" cy="6.5" r="2.4" fill="#D9C29E" />
    </>
  ),
  '/funcionalidades/cancelaciones-y-politicas': (
    <>
      <path d="M15 4v6M33 4v6" />
      <rect x="6" y="7" width="36" height="35" rx="5" fill="#fff" />
      <path d="M6 16h36" />
      <circle cx="19" cy="28.5" r="7.5" fill="#D9C29E" />
      <path d="m16.2 25.7 5.6 5.6M21.8 25.7l-5.6 5.6" />
      <path d="M30 24.5c4 0 6.5 2.5 6.5 6.5" strokeDasharray="0.1 4" />
      <path d="m34.2 33.5 2.3-2.5 2.5 2.3" strokeWidth={1.8} />
    </>
  ),
  '/funcionalidades/control-de-asistencia': (
    <>
      <rect x="8" y="7" width="32" height="36" rx="4.5" fill="#fff" />
      <rect x="18" y="3.5" width="12" height="7" rx="2.5" fill="#D9C29E" />
      <circle cx="16.5" cy="20" r="2.4" fill="#D9C29E" strokeWidth={1.6} />
      <path d="m22 19 2 2 3.6-4" />
      <path d="M31.5 20.5h4" stroke="#B9BFA3" />
      <circle cx="16.5" cy="31" r="2.4" fill="#fff" strokeWidth={1.6} />
      <path d="m23 28.5 4.5 4.5M27.5 28.5 23 33" />
      <path d="M31.5 31.5h4" stroke="#B9BFA3" />
    </>
  ),
  '/funcionalidades/multi-centro': (
    <>
      <path d="M4 42h40" />
      <rect x="7" y="16" width="16" height="26" rx="2.5" fill="#fff" />
      <rect x="27" y="9" width="14" height="33" rx="2.5" fill="#D9C29E" />
      <path d="M11.5 22h3M11.5 28h3M18 22h1.5M18 28h1.5" stroke="#B9BFA3" />
      <path d="M31.5 15.5h5M31.5 21.5h5M31.5 27.5h5" />
      <path d="M32.5 42v-6h3v6" />
      <path d="M15 16v-4.5a9 9 0 0 1 9-4.5 9 9 0 0 1 10 2" stroke="#B9BFA3" strokeDasharray="0.1 4" />
    </>
  ),
  // Las tres que eran «destacadas» (lámina oscura), pasadas a la paleta clara:
  // base #4A4F33 → blanco, secundarios #9BA083 → #B9BFA3.
  '/funcionalidades/reservas-online': (
    <>
      <rect x="12" y="6" width="20" height="37" rx="5" fill="#fff" />
      <path d="M19 38.5h10" stroke="#B9BFA3" />
      <path d="M16.5 13.5h7" stroke="#B9BFA3" />
      <rect x="16.5" y="18.5" width="15" height="7" rx="2.5" fill="#F1F2EA" stroke="#B9BFA3" />
      <path d="M20 22h8" stroke="#343825" />
      <circle cx="34.5" cy="15" r="8.5" fill="#D9C29E" stroke="#343825" />
      <path d="m30.8 15 2.6 2.6 4.6-5" stroke="#343825" />
      <path d="M5 33.5h4M3.5 28.5h5.5" stroke="#B9BFA3" />
      <path d="m40 33.5 3 7-4.6-1.4-1.8 3.4-2-8.4Z" fill="#D9C29E" stroke="#343825" strokeWidth={1.7} />
    </>
  ),
  '/funcionalidades/cobros-recurrentes': (
    <>
      <circle cx="24" cy="24" r="12" fill="#D9C29E" stroke="#343825" />
      <path d="M28.3 20.4a5.4 5.4 0 1 0 0 7.2M18 22.6h7M18 25.4h6" stroke="#343825" />
      <path d="M42 24a18 18 0 0 0-31-12.4" />
      <path d="M11.5 5.5v6.5H18" />
      <path d="M6 24a18 18 0 0 0 31 12.4" />
      <path d="M36.5 42.5V36H30" />
      <rect x="37" y="6" width="8" height="6" rx="2" fill="#fff" stroke="#B9BFA3" />
      <path d="M4.5 38.5h4M3 34h4" stroke="#B9BFA3" />
    </>
  ),
  '/funcionalidades/app-para-alumnas': (
    <>
      <rect x="13" y="5" width="22" height="38" rx="5.5" fill="#fff" />
      <path d="M21 38.5h6" stroke="#B9BFA3" />
      <rect x="18.5" y="12.5" width="11" height="11" rx="3.5" fill="#D9C29E" stroke="#343825" />
      <path d="M24 16v4M22 18h4" stroke="#343825" />
      <path d="M18.5 28.5h11M18.5 32.5h7" stroke="#B9BFA3" />
      <path d="m40.5 5.5 1.6 3.2 3.2 1.6-3.2 1.6-1.6 3.2-1.6-3.2-3.2-1.6 3.2-1.6Z" fill="#D9C29E" stroke="#343825" strokeWidth={1.6} />
      <path d="M6 14.5h4.5M4.5 19.5h6" stroke="#B9BFA3" />
    </>
  ),
  // Estas dos entraron en el registro sin viñeta (#2126) y su lámina salía vacía.
  '/funcionalidades/clases-recurrentes': (
    <>
      <path d="M14 4v6M28 4v6" />
      <rect x="5" y="7" width="32" height="30" rx="5" fill="#fff" />
      <path d="M5 16h32" />
      <rect x="10.5" y="21" width="9" height="7" rx="2" fill="#D9C29E" stroke="none" />
      <path d="M13 24.5h4" stroke="#343825" strokeWidth={1.6} />
      <path d="M24 24.5h7" stroke="#B9BFA3" />
      <circle cx="35.5" cy="35.5" r="8" fill="#F1F2EA" />
      <path d="M39.4 33a4.4 4.4 0 1 0 .4 3.6" />
      <path d="M40 29.8v3.6h-3.6" />
    </>
  ),
  '/funcionalidades/plazas-fijas': (
    <>
      <path d="M7 7.5h34" stroke="#B9BFA3" />
      <rect x="6" y="13" width="16" height="12" rx="3" fill="#fff" />
      <rect x="26" y="13" width="16" height="12" rx="3" fill="#D9C29E" />
      <path d="m30.5 19 2.5 2.5 4.5-4.5" stroke="#343825" />
      <rect x="6" y="30" width="16" height="12" rx="3" fill="#fff" />
      <rect x="26" y="30" width="16" height="12" rx="3" fill="#fff" />
      <circle cx="14" cy="36" r="1.8" fill="#B9BFA3" stroke="none" />
      <circle cx="34" cy="36" r="1.8" fill="#B9BFA3" stroke="none" />
    </>
  ),
};

function Vineta({ path }: { path: string }) {
  return (
    <svg
      width={40}
      height={40}
      viewBox="0 0 48 48"
      fill="none"
      stroke="#343825"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONOS[path]}
    </svg>
  );
}

export function SeccionFuncionalidades() {
  const items = funcionalidades();

  return (
    <section id="funcionalidades" className="fn2" aria-labelledby="fn2-h">
      <div className="fn2-wrap">
        <div className="fn2-cabecera lp-rv">
          <h2 id="fn2-h" className="fn2-h2">Y todo lo demás que necesita un estudio de Pilates.</h2>
          <Link href={SALIDAS.funcionalidades.href} className="fn2-salida">
            {SALIDAS.funcionalidades.label} <ArrowRight size={15} aria-hidden />
          </Link>
        </div>
        <ul className="fn2-lista">
          {items.map((p, n) => (
            // La animación va en el <li> y no en el enlace: el enlace sube en :hover.
            <li key={p.path} className="lp-rv" style={{ ['--lp-r' as string]: (n % 6) * 3 }}>
              <Link href={p.path} className="fn2-chip">
                <span className={`fn2-plate ${n % 2 === 0 ? 'fn2-plate--arena' : 'fn2-plate--salvia'}`}><Vineta path={p.path} /></span>
                <span className="fn2-tit">{p.etiqueta}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <style>{`
        .fn2 { padding: clamp(64px,7vw,96px) clamp(20px,4vw,48px); }
        .fn2-wrap { max-width: 1240px; margin: 0 auto; }
        .fn2-cabecera { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
          gap: 12px 32px; margin-bottom: 28px; }
        .fn2-h2 { font-size: clamp(24px,2.8vw,36px); font-weight: 800; line-height: 1.08; letter-spacing: -.035em;
          margin: 0; max-width: 24ch; text-wrap: balance; }

        .fn2-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
        .fn2-chip { display: inline-flex; align-items: center; gap: 10px; padding: 6px 16px 6px 6px; border-radius: 999px;
          background: #fff; border: 1px solid #E7E7E0; color: inherit; text-decoration: none;
          transition: transform .24s cubic-bezier(.2,.7,0,1), box-shadow .24s, border-color .24s; }
        .fn2-chip:hover { transform: translateY(-2px); box-shadow: 0 16px 32px -22px rgba(26,26,26,.35); border-color: #D9D9CE; }
        .fn2-chip:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }

        .fn2-plate { flex: none; width: 34px; height: 34px; border-radius: 999px; display: flex; align-items: center; justify-content: center; }
        .fn2-plate--arena { background: linear-gradient(135deg,#F5EDDD,#EFE3CC); }
        .fn2-plate--salvia { background: linear-gradient(135deg,#EFF1E4,#E7EAD6); }
        .fn2-plate svg { width: 24px; height: 24px; }
        .fn2-tit { font-size: 14.5px; font-weight: 700; letter-spacing: -.005em; color: #1A1A1A; white-space: nowrap; }

        .fn2-salida { display: inline-flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700; color: #343825; }
        .fn2-salida:hover { text-decoration: underline; text-underline-offset: 4px; }

        /* En el móvil, las 17 en una tira de dos filas que se desliza en
           horizontal, a sangre: en varias filas eran casi una pantalla entera. */
        @media (max-width: 640px) {
          .fn2-lista { display: grid; grid-template-rows: repeat(2,auto); grid-auto-flow: column; gap: 8px;
            overflow-x: auto; margin: 0 -20px; padding: 2px 20px 8px; scroll-snap-type: x proximity;
            scrollbar-width: none; -webkit-mask: linear-gradient(90deg,transparent,#000 20px,#000 calc(100% - 28px),transparent);
            mask: linear-gradient(90deg,transparent,#000 20px,#000 calc(100% - 28px),transparent); }
          .fn2-lista::-webkit-scrollbar { display: none; }
          .fn2-lista li { scroll-snap-align: start; }
          .fn2-chip { padding: 5px 13px 5px 5px; gap: 8px; }
          .fn2-plate { width: 30px; height: 30px; }
          .fn2-plate svg { width: 21px; height: 21px; }
          .fn2-tit { font-size: 13.5px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fn2-chip { transition: none; }
        }
      `}</style>
    </section>
  );
}
