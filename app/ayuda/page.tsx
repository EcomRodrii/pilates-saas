'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { PageShell } from '@/components/recursos/PageShell';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { AyudaMarco } from '@/components/ayuda/AyudaMarco';
import { BannerEdicion } from '@/components/edicion/banner-edicion';
import { CATEGORIAS, articulosPublicadosDe, urlArticulo } from '@/lib/ayuda/registro';
import { buscarArticulos, categoriasSugeridas } from '@/lib/ayuda/busqueda';
import { crearRegistroDeBusquedas } from '@/lib/ayuda/registrar-busqueda';

// El Centro de Ayuda con la forma del de Shopify (22-nov-2026, medido en help.shopify.com): una barra mínima arriba
// (logo + «Ayuda»), el buscador ancho y centrado en mitad de mucho aire, y «Explorar por tema» en tres columnas donde
// cada tema es su título y tres enlaces a sus guías, sin tarjetas. «Chat humano» flotando abajo a la derecha.
// ⚠️ Las páginas de categoría y de artículo siguen con la isla de la web: el salto de cabecera es conocido y se cierra al migrarlas.

const POR_TEMA = 3;

export default function AyudaHomePage() {
  const [query, setQuery] = useState(() => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q') ?? ''));
  const q = query.trim();

  const resultados = useMemo(() => (q ? buscarArticulos(q) : []), [q]);
  const sugeridas = useMemo(() => (q && resultados.length === 0 ? categoriasSugeridas(q) : []), [q, resultados.length]);
  const temas = useMemo(() => CATEGORIAS.map((c) => ({ categoria: c, guias: articulosPublicadosDe(c.slug) })), []);

  // Lo que se busca y no está, anonimizado y contado 90 días (app/api/ayuda/busqueda): la lista de guías que faltan.
  const registro = useRef<ReturnType<typeof crearRegistroDeBusquedas> | null>(null);
  useEffect(() => {
    registro.current ??= crearRegistroDeBusquedas();
    registro.current.cambio(q, resultados.length);
    return () => registro.current?.cancelar();
  }, [q, resultados.length]);

  return (
    <PageShell>
      <OrganizationStructuredData />
      <AyudaMarco ancho={1024} portada>
            <h1 className="sr-only">Centro de Ayuda de Tentare</h1>
            <label className="ay-buscador">
              <Search size={16} aria-hidden="true" />
              <input
                autoFocus
                aria-label="Buscar en la ayuda de Tentare"
                placeholder="Haz una pregunta"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            {q ? (
              <div className="ay-resultados">
                <p className="ay-recuento">
                  {resultados.length > 0 ? `${resultados.length} resultado${resultados.length === 1 ? '' : 's'} para «${q}»` : `Sin resultados para «${q}»`}
                </p>
                {resultados.length > 0 ? (
                  <ul>
                    {resultados.map((r) => (
                      <li key={r.href}>
                        <Link href={r.href} className="ay-resultado">
                          <span>
                            <small>{r.categoriaTitulo}</small>
                            <b>{r.articulo.titulo}</b>
                            <em>{r.articulo.descripcion}</em>
                          </span>
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>
                    <p className="ay-sin">No hemos encontrado ningún artículo para «{q}». Quizá te interese:</p>
                    <ul className="ay-sugeridas">
                      {sugeridas.map((c) => (
                        <li key={c.slug}><Link href={`/ayuda/${c.slug}`}>{c.titulo}</Link></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <section aria-labelledby="ay-temas">
                <BannerEdicion className="ay-edicion" />
                <h2 id="ay-temas" className="ay-titulo-temas">Explorar por tema</h2>
                <div className="ay-temas">
                  {temas.map(({ categoria, guias }) => (
                    <div key={categoria.slug} className="ay-tema">
                      <h3><Link href={`/ayuda/${categoria.slug}`}>{categoria.titulo}</Link></h3>
                      {guias.length > 0 ? (
                        <ul>
                          {guias.slice(0, POR_TEMA).map((g) => (
                            <li key={g.slug}><Link href={urlArticulo(g)}>{g.titulo}</Link></li>
                          ))}
                        </ul>
                      ) : (
                        <p>En preparación</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="ay-contacto">
                  ¿No encuentras lo que buscas? Escríbenos a <a href="mailto:soporte@tentare.app">soporte@tentare.app</a>.
                </p>
              </section>
            )}
      </AyudaMarco>

      <style>{`
        .ay-buscador { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 16px; background: #fff; border: 1px solid #e3e3e3; border-radius: 12px; color: #616161; box-shadow: 0 1px 2px #00000008; transition: border-color .2s, box-shadow .2s; }
        .ay-buscador:focus-within { border-color: #303030; box-shadow: 0 0 0 3px #30303014; }
        .ay-buscador input { flex: 1; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; line-height: 20px; color: #303030; }
        .ay-buscador input::placeholder { color: #616161; }
        .ay-edicion { margin-top: 40px; }
        .ay-titulo-temas { margin: 56px 0 24px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
        .ay-temas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 40px 48px; }
        .ay-tema h3 { margin: 0 0 12px; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
        .ay-tema h3 a { color: inherit; text-decoration: none; }
        .ay-tema h3 a:hover { text-decoration: underline; }
        .ay-tema ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .ay-tema li a { font-size: 14px; line-height: 20px; color: #303030; text-decoration: none; }
        .ay-tema li a:hover { text-decoration: underline; }
        .ay-tema p { margin: 0; font-size: 14px; color: #8a8a8a; }
        .ay-contacto { margin: 56px 0 0; font-size: 14px; color: #616161; }
        .ay-contacto a { color: #1a1a1a; text-decoration: underline; }
        .ay-resultados { margin-top: 32px; }
        .ay-recuento { margin: 0 0 16px; font-size: 13px; color: #616161; }
        .ay-resultados ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .ay-resultado { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border: 1px solid #e3e3e3; border-radius: 12px; text-decoration: none; color: inherit; transition: background .2s cubic-bezier(.2,.8,0,1), border-color .2s; }
        .ay-resultado:hover { background: #fafafa; border-color: #cfcfcf; }
        .ay-resultado span { display: flex; flex-direction: column; gap: 4px; }
        .ay-resultado small { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #8a8a8a; }
        .ay-resultado b { font-size: 15px; font-weight: 600; }
        .ay-resultado em { font-size: 13.5px; font-style: normal; color: #616161; }
        .ay-sin { margin: 0 0 12px; font-size: 14px; color: #616161; }
        .ay-sugeridas { flex-direction: row !important; flex-wrap: wrap; }
        .ay-sugeridas a { display: block; padding: 10px 14px; border: 1px solid #e3e3e3; border-radius: 12px; font-size: 14px; font-weight: 500; color: #1a1a1a; text-decoration: none; }
        @media (max-width: 900px) { .ay-temas { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 600px) { .ay-temas { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .ay-resultado { transition: none; } }
      `}</style>
    </PageShell>
  );
}
