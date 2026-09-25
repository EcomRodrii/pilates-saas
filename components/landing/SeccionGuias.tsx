import Link from 'next/link';
import { ARTICULOS, urlArticulo } from '@/lib/recursos/articulos';

// Guías de /recursos en la portada. No vende: le da a quien todavía se está
// informando lo que busca (costes, requisitos, precios) y, de paso, es el
// enlace más fuerte que pueden tener esas guías, porque la portada es la
// página con más autoridad del dominio (25-sep, aprobado por el fundador).
//
// ⚠️ Componente de SERVIDOR que LandingCliente recibe como hueco (`guias`):
// importado desde el cliente, los 13 artículos —texto completo, fuentes y
// FAQ— acabarían en el JavaScript de la home.
//
// Título y descripción salen de cada artículo (su título SEO y su meta
// descripción), no se reescriben aquí: dos copias del mismo texto solo pueden
// desincronizarse.
const DESTACADAS = [
  'como-abrir-un-estudio-de-pilates',
  'cuanto-cuesta-abrir-un-estudio-de-pilates',
  'requisitos-para-abrir-un-estudio-de-pilates',
  'precio-clase-de-pilates',
  'rentabilidad-estudio-de-pilates',
  'mejor-software-para-estudios-de-pilates',
];

export function SeccionGuias() {
  const guias = DESTACADAS.flatMap((slug) => ARTICULOS.filter((a) => a.slug === slug));
  if (guias.length === 0) return null;

  return (
    <section id="guias" className="v5-guias" aria-labelledby="v5-guias-h">
      <div className="v5-guias-wrap">
        <h2 id="v5-guias-h" className="v5-guias-h2 lp-rv">Guías para abrir y llevar tu estudio</h2>
        <p className="v5-guias-lede lp-rv">Lo que cuesta, lo que pide la ley y cuánto cobrar, con las fuentes a la vista.</p>
        <ul className="v5-guias-rejilla lp-rv" style={{ ['--lp-r' as string]: 6 }}>
          {guias.map((a) => (
            <li key={a.slug}>
              <Link href={urlArticulo(a.slug)} className="v5-guia">
                <span className="v5-guia-seccion">{a.seccion}</span>
                <span className="v5-guia-t">{a.tituloSeo}</span>
                <span className="v5-guia-d">{a.descripcion}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/recursos" className="v5-guias-todas">Ver todas las guías →</Link>
      </div>

      <style>{`
        .v5-guias { padding: clamp(56px,6vw,96px) clamp(20px,4vw,48px); }
        .v5-guias-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-guias-h2 { font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em;
          margin: 0 0 14px; text-wrap: balance; }
        .v5-guias-lede { font-size: 17px; line-height: 1.55; color: #5A5A52; margin: 0 0 32px; max-width: 60ch; }
        .v5-guias-rejilla { list-style: none; margin: 0; padding: 0; display: grid;
          grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px; }
        .v5-guia { height: 100%; display: flex; flex-direction: column; gap: 8px; padding: 20px 22px;
          background: #FFFFFF; border: 1px solid #DEDED6; border-radius: 16px; text-decoration: none; color: inherit; }
        .v5-guia:hover { border-color: #343825; }
        .v5-guia:focus-visible { outline: 2px solid #343825; outline-offset: 2px; }
        .v5-guia-seccion { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #6E7650; }
        .v5-guia-t { font-size: 17px; font-weight: 700; line-height: 1.3; color: #1A1A1A; text-wrap: balance; }
        .v5-guia-d { font-size: 14.5px; line-height: 1.55; color: #5A5A52; }
        .v5-guias-todas { display: inline-block; margin-top: 22px; font-size: 15.5px; font-weight: 700; color: #343825;
          text-underline-offset: 3px; }
        .v5-guias-todas:focus-visible { outline: 2px solid #343825; outline-offset: 2px; border-radius: 4px; }
        @media (prefers-reduced-motion: no-preference) {
          .v5-guia { transition: border-color var(--motion-medium) var(--motion-ease); }
        }
        @media (max-width: 960px) { .v5-guias-rejilla { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (max-width: 620px) { .v5-guias-rejilla { grid-template-columns: minmax(0,1fr); } }
      `}</style>
    </section>
  );
}
