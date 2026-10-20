import Link from 'next/link';
import { ARTICULOS_META } from '@/lib/recursos/articulos/meta';
import { portadaArticulo } from '@/lib/recursos/articulos/portadas';
import { minutosLectura, urlArticulo } from '@/lib/recursos/articulos/util';
import { PortadaRecursos } from '@/components/recursos/PortadaRecursos';

// Recursos editoriales (fase 2.2): tres guías destacadas con su foto, como la
// banda de guías de bsport y los «Explore more resources» de Mariana Tek.
//
// ⚠️ Solo con los METADATOS de los artículos (meta.ts): su texto completo no
// debe llegar nunca al JavaScript de la home (lo vigilan
// lib/recursos/articulos/articulos.test.ts y e2e/portada-guias.spec.ts).
// Título y descripción salen de cada artículo, sin reescribirlos aquí.
const DESTACADAS = [
  'como-abrir-un-estudio-de-pilates',
  'como-gestionar-un-estudio-de-pilates',
  'cuanto-cuesta-abrir-un-estudio-de-pilates',
];

export function GuiasHome() {
  const guias = DESTACADAS.flatMap((slug) => ARTICULOS_META.filter((a) => a.slug === slug));
  if (guias.length === 0) return null;

  return (
    <section id="guias" className="wh-seccion wh-guias" aria-labelledby="wh-guias-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera wh-cabecera-fila lp-rv">
          <div>
            <h2 id="wh-guias-h" className="wh-h2">Guías para abrir y llevar tu estudio</h2>
            <p className="wh-lead">Lo que cuesta, lo que pide la ley y cuánto cobrar, con las fuentes a la vista.</p>
          </div>
          <Link href="/recursos" className="wh-enlace-flecha">Ver todas las guías <span aria-hidden="true">→</span></Link>
        </div>
        <ul className="wh-guias-rejilla">
          {guias.map((a) => {
            const portada = portadaArticulo(a.slug);
            return (
              <li key={a.slug} className="lp-rv">
                <Link href={urlArticulo(a.slug)} className="wh-guia">
                  {portada && (
                    <span className="wh-guia-foto wh-foto">
                      <PortadaRecursos portada={portada} sizes="(max-width: 860px) 92vw, 400px" decorativa />
                    </span>
                  )}
                  <span className="wh-guia-seccion">{a.seccion} · {minutosLectura(a.palabras)} min de lectura</span>
                  <span className="wh-guia-t">{a.tituloSeo}</span>
                  <span className="wh-guia-d">{a.descripcion}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
