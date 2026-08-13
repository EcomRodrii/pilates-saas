import Link from 'next/link';
import { funcionalidades } from '@/lib/seo/paginas';

// Vitrina de funcionalidades de la home, v2: cada tarjeta lleva una viñeta
// ilustrada a dos tintas (oliva #343825 + arena #D9C29E) y tres áreas van
// destacadas a doble ancho con lámina oscura. Título y resumen siguen
// saliendo del registro (`lib/seo/paginas.ts`); las destacadas amplían el
// copy aquí porque la tarjeta grande pide una frase más larga.
//
// Conserva id="funcionalidades" (ancla del nav) y aria-labelledby.

const DESTACADAS: Record<string, { chip: string; copy: string }> = {
  '/funcionalidades/reservas-online': {
    chip: 'Lo que más se usa',
    copy: 'Reservan solas desde el móvil, con las reglas que tú pongas — antelación, límites por bono y confirmación al momento.',
  },
  '/funcionalidades/cobros-recurrentes': {
    chip: 'Sin perseguir a nadie',
    copy: 'Cobra solo, reintenta lo que falla y avisa cuando toca — recibo a recibo, sin hojas de cálculo.',
  },
  '/funcionalidades/app-para-alumnas': {
    chip: 'Tu marca, no la nuestra',
    copy: 'Tu estudio en su móvil, con tu nombre, tu icono y tus colores — reservas, bonos y avisos en un toque.',
  },
};

// Viñetas para lámina clara (86px). Trazo oliva, relleno héroe arena,
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
};

// Viñetas para lámina oscura (118px): trazo crema #EDE8D8, base #4A4F33,
// héroe arena, secundarios #9BA083.
const ICONOS_DESTACADA: Record<string, React.ReactNode> = {
  '/funcionalidades/reservas-online': (
    <>
      <rect x="12" y="6" width="20" height="37" rx="5" fill="#4A4F33" />
      <path d="M19 38.5h10" stroke="#9BA083" />
      <path d="M16.5 13.5h7" stroke="#9BA083" />
      <rect x="16.5" y="18.5" width="15" height="7" rx="2.5" fill="#31351F" stroke="#9BA083" />
      <path d="M20 22h8" stroke="#D9C29E" />
      <circle cx="34.5" cy="15" r="8.5" fill="#D9C29E" stroke="#343825" />
      <path d="m30.8 15 2.6 2.6 4.6-5" stroke="#343825" />
      <path d="M6.5 10.5c1.6-2.4 3.9-4.2 6.5-5.2" stroke="#9BA083" strokeDasharray="0.1 4.6" />
      <path d="M5 33.5h4M3.5 28.5h5.5" stroke="#9BA083" />
      <path d="m40 33.5 3 7-4.6-1.4-1.8 3.4-2-8.4Z" fill="#D9C29E" stroke="#343825" strokeWidth={1.7} />
    </>
  ),
  '/funcionalidades/cobros-recurrentes': (
    <>
      <circle cx="24" cy="24" r="12" fill="#D9C29E" stroke="#343825" />
      <circle cx="24" cy="24" r="8.6" fill="none" stroke="#343825" strokeWidth={1.4} strokeDasharray="0.1 3.4" />
      <path d="M28.3 20.4a5.4 5.4 0 1 0 0 7.2M18 22.6h7M18 25.4h6" stroke="#343825" />
      <path d="M42 24a18 18 0 0 0-31-12.4" />
      <path d="M11.5 5.5v6.5H18" />
      <path d="M6 24a18 18 0 0 0 31 12.4" />
      <path d="M36.5 42.5V36H30" />
      <rect x="37" y="6" width="8" height="6" rx="2" fill="#4A4F33" stroke="#9BA083" />
      <path d="M37 8.4h8" stroke="#9BA083" strokeWidth={1.5} />
      <path d="M4.5 38.5h4M3 34h4" stroke="#9BA083" />
    </>
  ),
  '/funcionalidades/app-para-alumnas': (
    <>
      <rect x="13" y="5" width="22" height="38" rx="5.5" fill="#4A4F33" />
      <path d="M21 38.5h6" stroke="#9BA083" />
      <rect x="18.5" y="12.5" width="11" height="11" rx="3.5" fill="#D9C29E" stroke="#343825" />
      <path d="M24 16v4M22 18h4" stroke="#343825" />
      <path d="M18.5 28.5h11M18.5 32.5h7" stroke="#9BA083" />
      <path d="m40.5 5.5 1.6 3.2 3.2 1.6-3.2 1.6-1.6 3.2-1.6-3.2-3.2-1.6 3.2-1.6Z" fill="#D9C29E" stroke="#343825" strokeWidth={1.6} />
      <path d="M6 14.5h4.5M4.5 19.5h6" stroke="#9BA083" />
      <circle cx="8" cy="35" r="2.4" fill="none" stroke="#9BA083" />
    </>
  ),
};

function Vineta({ path, destacada }: { path: string; destacada?: boolean }) {
  return (
    <svg
      width={destacada ? 118 : 86}
      height={destacada ? 118 : 86}
      viewBox="0 0 48 48"
      fill="none"
      stroke={destacada ? '#EDE8D8' : '#343825'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {destacada ? ICONOS_DESTACADA[path] : ICONOS[path]}
    </svg>
  );
}

const Flecha = (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

export function SeccionFuncionalidades() {
  const items = funcionalidades();
  let claras = 0; // alterna arena/salvia solo entre las tarjetas normales

  return (
    <section id="funcionalidades" className="fn2" aria-labelledby="fn2-h">
      <div className="fn2-wrap">
        <div className="fn2-cabecera">
          <p className="fn2-eyebrow">Funcionalidades</p>
          <h2 id="fn2-h" className="fn2-h2">Todo lo que necesita un estudio de Pilates. En un panel.</h2>
          <p className="fn2-lead">Quince áreas, cada una con su propia página — sin genérico, sin relleno.</p>
        </div>
        <div className="fn2-grid">
          {items.map((p) => {
            const dest = DESTACADAS[p.path];
            if (dest) {
              return (
                <Link key={p.path} href={p.path} className="fn2-card fn2-dest">
                  <span className="fn2-plate fn2-plate--oscura"><Vineta path={p.path} destacada /></span>
                  <span className="fn2-body">
                    <span className="fn2-chip">{dest.chip}</span>
                    <span className="fn2-tit fn2-tit--g">{p.etiqueta}</span>
                    <span className="fn2-desc">{dest.copy}</span>
                    <span className="fn2-cta">Ver cómo funciona{Flecha}</span>
                  </span>
                </Link>
              );
            }
            const tono = claras++ % 2 === 0 ? 'fn2-plate--arena' : 'fn2-plate--salvia';
            return (
              <Link key={p.path} href={p.path} className="fn2-card">
                <span className={`fn2-plate ${tono}`}><Vineta path={p.path} /></span>
                <span className="fn2-tit">{p.etiqueta}</span>
                <span className="fn2-desc">{p.resumen}</span>
                <span className="fn2-cta">Ver cómo funciona{Flecha}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <style>{`
        .fn2 { padding: clamp(72px,11vw,120px) clamp(20px,4vw,48px); }
        .fn2-wrap { max-width: 1240px; margin: 0 auto; }
        .fn2-cabecera { max-width: 640px; margin-bottom: 48px; }
        .fn2-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; color: #8E8E86; margin: 0 0 18px; text-transform: uppercase; }
        .fn2-h2 { font-size: clamp(28px,4.4vw,48px); font-weight: 800; line-height: 1.03; letter-spacing: -.04em; margin: 0 0 14px; text-wrap: balance; }
        .fn2-lead { font-size: 16px; line-height: 1.5; color: #5A5A52; margin: 0; }

        .fn2-grid { display: grid; grid-template-columns: repeat(3,1fr); grid-auto-flow: dense; gap: 16px; }
        .fn2-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 20px; padding: 10px 10px 22px;
          display: flex; flex-direction: column; color: inherit; text-decoration: none;
          transition: transform .26s cubic-bezier(.2,.7,0,1), box-shadow .26s, border-color .26s; }
        .fn2-card:hover { transform: translateY(-5px); box-shadow: 0 32px 58px -28px rgba(26,26,26,.32); border-color: #D9D9CE; }

        .fn2-plate { height: 128px; border-radius: 13px; display: flex; align-items: center; justify-content: center; }
        .fn2-plate--arena { background: linear-gradient(135deg,#F5EDDD,#EFE3CC); }
        .fn2-plate--salvia { background: linear-gradient(135deg,#EFF1E4,#E7EAD6); }
        .fn2-plate--oscura { background: linear-gradient(140deg,#3C4129,#282C1B); }
        .fn2-plate svg { transition: transform .45s cubic-bezier(.34,1.56,.64,1); }
        .fn2-card:hover .fn2-plate svg { transform: translateY(-5px) scale(1.08) rotate(-2deg); }

        .fn2-tit { font-size: 16.5px; font-weight: 800; letter-spacing: -.015em; color: #1A1A1A; margin: 17px 14px 0; }
        .fn2-desc { font-size: 13.5px; line-height: 1.55; color: #5A5A52; margin: 6px 14px 0; flex: 1; }
        .fn2-cta { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 700; color: #343825; margin: 15px 14px 0; }
        .fn2-cta svg { transition: transform .25s ease; }
        .fn2-card:hover .fn2-cta svg { transform: translateX(5px); }

        .fn2-dest { grid-column: span 2; flex-direction: row; gap: 4px; padding: 10px; }
        .fn2-dest .fn2-plate { width: 44%; height: auto; flex-shrink: 0; }
        .fn2-body { flex: 1; display: flex; flex-direction: column; padding: 16px 14px 12px 18px; }
        .fn2-body .fn2-tit, .fn2-body .fn2-desc, .fn2-body .fn2-cta { margin-left: 0; margin-right: 0; }
        .fn2-chip { display: inline-flex; align-self: flex-start; font-size: 10.5px; font-weight: 800; letter-spacing: .12em;
          text-transform: uppercase; color: #343825; background: #F1F2EA; border-radius: 999px; padding: 5px 11px; }
        .fn2-tit--g { font-size: 20px; letter-spacing: -.02em; margin-top: 13px; }
        .fn2-body .fn2-desc { font-size: 14px; line-height: 1.6; margin-top: 7px; }
        .fn2-body .fn2-cta { font-size: 14px; margin-top: 14px; }

        @media (max-width: 980px) { .fn2-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 640px) {
          .fn2-grid { grid-template-columns: 1fr; }
          .fn2-dest { grid-column: span 1; flex-direction: column; }
          .fn2-dest .fn2-plate { width: 100%; height: 150px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .fn2-card, .fn2-plate svg, .fn2-cta svg { transition: none; }
        }
      `}</style>
    </section>
  );
}
