import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/blog/Retrato';
import { BloqueBlogVista, Compartir, FilaArticulo, FirmaAutor, Ld, Migas } from '@/components/blog/piezas';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { faqPageLd } from '@/lib/seo/faq-jsonld';
import { ARTICULOS_BLOG, articuloBlogPorSlug, relacionadosBlog } from '@/lib/blog/articulos';
import { AUTOR_BLOG, RUTA_AUTOR, RUTA_BLOG } from '@/lib/blog/autor';
import { categoriaBlog } from '@/lib/blog/categorias';
import { articuloBlogLd, migasBlogLd, MIGAS_AUTOR, MIGAS_BLOG } from '@/lib/blog/schema';
import { alternatesBlog } from '@/lib/blog/seo';
import { contarPalabrasBlog, fechaArticuloBlog, fechaLargaBlog, metaBlogDe, textoDeSecciones, urlArticuloBlog } from '@/lib/blog/util';
import { urlDe } from '@/lib/seo/paginas';

// Un artículo del blog personal (lib/blog/articulos). Solo llegan los PUBLICADOS: cualquier otro slug —un borrador
// incluido— es un 404 (`dynamicParams = false`).
export const dynamicParams = false;

export function generateStaticParams() {
  return ARTICULOS_BLOG.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = articuloBlogPorSlug(slug);
  if (!a) return {};
  const ruta = urlArticuloBlog(a.slug);
  const titulo = `${a.tituloSeo} | Tentare`;
  return {
    title: titulo,
    description: a.descripcion,
    alternates: alternatesBlog(ruta),
    authors: [{ name: AUTOR_BLOG.nombre, url: urlDe(RUTA_AUTOR) }],
    openGraph: {
      siteName: 'Tentare',
      type: 'article',
      locale: 'es_ES',
      title: a.titulo,
      description: a.descripcion,
      url: urlDe(ruta),
      publishedTime: a.publicado,
      modifiedTime: fechaArticuloBlog(a),
      authors: [urlDe(RUTA_AUTOR)],
      section: categoriaBlog(a.categoria)?.nombre,
    },
    twitter: { card: 'summary_large_image', title: a.titulo, description: a.descripcion },
  };
}

export default async function ArticuloBlogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articuloBlogPorSlug(slug);
  if (!a) notFound();

  const meta = metaBlogDe(a);
  const ruta = urlArticuloBlog(a.slug);
  const cat = categoriaBlog(a.categoria);
  const palabras = contarPalabrasBlog(textoDeSecciones(a.secciones));
  const relacionados = relacionadosBlog(a.slug, 3).map(metaBlogDe);

  return (
    <>
      <Ld data={migasBlogLd([MIGAS_BLOG, MIGAS_AUTOR, { nombre: a.titulo, ruta }])} />
      <Ld data={articuloBlogLd(meta, palabras)} />
      {a.faq && a.faq.length > 0 && <Ld data={faqPageLd(a.faq)} />}

      <header className="bl-art-cab">
        <div className="bl-lectura">
          <Migas migas={[{ nombre: 'Blog', ruta: RUTA_BLOG }, { nombre: AUTOR_BLOG.nombre, ruta: RUTA_AUTOR }, { nombre: a.titulo }]} />
          <p className="bl-kicker">{cat?.nombre}</p>
          <h1 className="bl-h1">{a.titulo}</h1>
          <p className="bl-dek">{a.entradilla}</p>
          <div className="bl-art-meta">
            <FirmaAutor />
            <ul className="bl-datos">
              <li><time dateTime={a.publicado}>{fechaLargaBlog(a.publicado)}</time></li>
              {a.actualizado && <li>Actualizado el <time dateTime={a.actualizado}>{fechaLargaBlog(a.actualizado)}</time></li>}
              <li>{meta.minutos} min de lectura</li>
            </ul>
          </div>
          {a.secciones.length >= 3 && (
            <details className="bl-toc" open>
              <summary>Índice</summary>
              <ol>
                {a.secciones.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.titulo}</a></li>)}
              </ol>
            </details>
          )}
        </div>
      </header>

      <main>
        <article className="bl-lectura bl-cuerpo">
          {a.secciones.map((s) => (
            <section key={s.id} aria-labelledby={s.id}>
              <h2 id={s.id}>{s.titulo}</h2>
              {s.bloques.map((b, i) => <BloqueBlogVista key={i} b={b} />)}
            </section>
          ))}

          {a.faq && a.faq.length > 0 && (
            <section className="bl-bloque" aria-labelledby="bl-faq">
              <h2 id="bl-faq">Preguntas frecuentes</h2>
              <ArticleFaq items={a.faq} />
            </section>
          )}

          <section className="bl-bloque" aria-label="Compartir este artículo">
            <Compartir ruta={ruta} titulo={a.titulo} />
          </section>

          <section className="bl-bloque" aria-labelledby="bl-autor">
            <h2 id="bl-autor">Sobre el autor</h2>
            <div className="bl-autor-caja">
              <Avatar />
              <div>
                <p className="bl-nombre">{AUTOR_BLOG.nombre}</p>
                <p>
                  Fundador de Tentare, un software de gestión para estudios de Pilates y yoga en España. Trabaja desde {AUTOR_BLOG.ciudad}.
                </p>
                <Link href={RUTA_AUTOR}>Más sobre {AUTOR_BLOG.nombreCorto} →</Link>
              </div>
            </div>
          </section>

          {relacionados.length > 0 && (
            <section className="bl-bloque" aria-labelledby="bl-sigue">
              <h2 id="bl-sigue">Sigue leyendo</h2>
              <ul className="bl-lista">
                {relacionados.map((r) => <li key={r.slug}><FilaArticulo a={r} /></li>)}
              </ul>
            </section>
          )}
        </article>

        <div className="bl-lectura">
          <footer className="bl-pie">
            <span><Link href={RUTA_BLOG}>← Todos los artículos</Link></span>
            <span><a href={`${RUTA_BLOG}/feed.xml`}>Suscribirse por RSS</a></span>
          </footer>
        </div>
      </main>
    </>
  );
}
