import Link from 'next/link';
import { ARTICULOS_META } from '@/lib/recursos/articulos/meta';
import { portadaArticulo } from '@/lib/recursos/articulos/portadas';
import { minutosLectura, urlArticulo } from '@/lib/recursos/articulos/util';
import { PortadaRecursos } from '@/components/recursos/PortadaRecursos';

// Guías de /recursos en la portada. No vende: le da a quien todavía se está
// informando lo que busca (costes, requisitos, precios) y, de paso, es el
// enlace más fuerte que pueden tener esas guías, porque la portada es la
// página con más autoridad del dominio (25-sep, aprobado por el fundador).
//
// Componente de servidor que LandingCliente recibe como hueco (`guias`), y
// solo con los metadatos de los artículos (meta.ts): su texto completo no debe
// llegar nunca al JavaScript de la home (e2e/portada-guias.spec.ts).
//
// Título y descripción salen de cada artículo (su título SEO y su meta
// descripción), no se reescriben aquí: dos copias del mismo texto solo pueden
// desincronizarse.
//
// Ronda 3 (19-oct-2026): pasa a ser una banda de «guías destacadas» como la de
// Bsport: tarjetas con foto (la portada de cada guía, ya recortada y servida en
// AVIF/WebP: nada nuevo que descargar), su categoría y los minutos de lectura
// (de las palabras reales del artículo: `minutosLectura`). Va sobre fondo oscuro
// con esquinas redondeadas, justo antes de la banda final. Sin foto inventada: si
// una guía no tiene portada, la tarjeta sale sin ella.
const DESTACADAS = [
  'como-abrir-un-estudio-de-pilates',
  'como-gestionar-un-estudio-de-pilates',
  'cuanto-cuesta-abrir-un-estudio-de-pilates',
  'requisitos-para-abrir-un-estudio-de-pilates',
  'rentabilidad-estudio-de-pilates',
  'mejor-software-para-estudios-de-pilates',
];

export function SeccionGuias() {
  const guias = DESTACADAS.flatMap((slug) => ARTICULOS_META.filter((a) => a.slug === slug));
  if (guias.length === 0) return null;

  return (
    <section id="guias" className="v5-guias" aria-labelledby="v5-guias-h">
      <div className="v5-guias-wrap">
        <h2 id="v5-guias-h" className="v5-guias-h2 lp-rv">Guías para abrir y llevar tu estudio</h2>
        <p className="v5-guias-lede lp-rv">Lo que cuesta, lo que pide la ley y cuánto cobrar, con las fuentes a la vista.</p>
        <ul className="v5-guias-rejilla lp-rv" style={{ ['--lp-r' as string]: 6 }}>
          {guias.map((a) => {
            const portada = portadaArticulo(a.slug);
            return (
              <li key={a.slug}>
                <Link href={urlArticulo(a.slug)} className="v5-guia">
                  {portada && (
                    <span className="v5-guia-foto">
                      <PortadaRecursos portada={portada} sizes="(max-width: 620px) 92vw, (max-width: 960px) 46vw, 380px" decorativa />
                    </span>
                  )}
                  <span className="v5-guia-cuerpo">
                    <span className="v5-guia-seccion">{a.seccion} · {minutosLectura(a.palabras)} min de lectura</span>
                    <span className="v5-guia-t">{a.tituloSeo}</span>
                    <span className="v5-guia-d">{a.descripcion}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/recursos" className="v5-guias-todas">Ver todas las guías →</Link>
      </div>

      <style>{`
        /* Banda oscura con esquinas redondeadas (ronda 3): cierra la página antes de
           la banda final y rompe la tirada de bloques claros. */
        .v5-guias { background: #131313; color: #fff; margin: clamp(24px,3vw,48px) clamp(8px,1.6vw,24px);
          padding: clamp(56px,7vw,104px) clamp(20px,4vw,48px); border-radius: clamp(28px,4vw,56px); }
        .v5-guias-wrap { max-width: 1240px; margin: 0 auto; }
        .v5-guias-h2 { font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em;
          margin: 0 0 14px; text-wrap: balance; color: #fff; }
        .v5-guias-lede { font-size: 17px; line-height: 1.55; color: #A6A69E; margin: 0 0 32px; max-width: 60ch; }
        .v5-guias-rejilla { list-style: none; margin: 0; padding: 0; display: grid;
          grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px; }
        .v5-guia { height: 100%; display: flex; flex-direction: column; text-decoration: none; color: inherit; overflow: hidden;
          background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.08); border-radius: 22px; }
        .v5-guia:hover { border-color: rgba(217,194,158,.5); }
        .v5-guia:focus-visible { outline: 2px solid #D9C29E; outline-offset: 2px; }
        /* La foto a todo el ancho de la tarjeta, 2:1 como sale de las portadas: el
           alto lo reserva aspect-ratio, así no hay desplazamiento al cargar. */
        .v5-guia-foto { display: block; aspect-ratio: 2 / 1; overflow: hidden; background: #1F1F1F; }
        .v5-guia-foto picture, .v5-guia-foto img { display: block; width: 100%; height: 100%; }
        .v5-guia-foto img { object-fit: cover; }
        .v5-guia-cuerpo { display: flex; flex-direction: column; gap: 8px; padding: 18px 22px 22px; }
        .v5-guia-seccion { font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #D9C29E; }
        .v5-guia-t { font-size: 18px; font-weight: 700; line-height: 1.28; color: #fff; text-wrap: balance; }
        .v5-guia-d { font-size: 14.5px; line-height: 1.55; color: #A6A69E; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .v5-guias-todas { display: inline-block; margin-top: 26px; font-size: 15.5px; font-weight: 700; color: #D9C29E;
          text-underline-offset: 3px; }
        .v5-guias-todas:hover { text-decoration: underline; }
        .v5-guias-todas:focus-visible { outline: 2px solid #D9C29E; outline-offset: 2px; border-radius: 4px; }
        @media (prefers-reduced-motion: no-preference) {
          .v5-guia { transition: border-color var(--motion-medium) var(--motion-ease); }
        }
        @media (max-width: 960px) { .v5-guias-rejilla { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (max-width: 620px) {
          .v5-guias { margin-inline: 8px; border-radius: 28px; }
          .v5-guias-rejilla { grid-template-columns: minmax(0,1fr); }
        }
      `}</style>
    </section>
  );
}
