import type { Metadata } from 'next';
import Link from 'next/link';
import { Retrato } from '@/components/blog/Retrato';
import { FilaArticulo, Ld, Migas } from '@/components/blog/piezas';
import { ARTICULOS_BLOG_META } from '@/lib/blog/meta';
import { AUTOR_BLOG, RUTA_AUTOR, RUTA_BLOG } from '@/lib/blog/autor';
import { CATEGORIAS_BLOG } from '@/lib/blog/categorias';
import { alternatesBlog } from '@/lib/blog/seo';
import { blogLd, migasBlogLd, MIGAS_BLOG } from '@/lib/blog/schema';
import { fechaArticuloBlog, fechaLargaBlog, urlArticuloBlog } from '@/lib/blog/util';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// El listado del blog personal del fundador (/blog). Se indexa SOLO si hay algo publicado: un listado vacío sería una
// página fina que Google leería como tal (cuando haya el primer artículo, deja de llevar noindex sola).
const pagina = paginaDe(RUTA_BLOG)!;
const hayArticulos = ARTICULOS_BLOG_META.length > 0;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: alternatesBlog(RUTA_BLOG),
  robots: hayArticulos ? undefined : { index: false, follow: true },
  openGraph: {
    siteName: 'Tentare',
    type: 'website',
    locale: 'es_ES',
    title: pagina.titulo,
    description: pagina.descripcion,
    url: urlDe(RUTA_BLOG),
    images: [{ url: AUTOR_BLOG.og.ruta, width: AUTOR_BLOG.og.ancho, height: AUTOR_BLOG.og.alto, alt: AUTOR_BLOG.foto.alt }],
  },
  twitter: { card: 'summary_large_image', title: pagina.titulo, description: pagina.descripcion, images: [AUTOR_BLOG.og.ruta] },
};

export default function BlogPage() {
  const destacado = ARTICULOS_BLOG_META.find((a) => a.destacado) ?? ARTICULOS_BLOG_META[0];
  const resto = ARTICULOS_BLOG_META.filter((a) => a !== destacado);
  const conArticulos = new Set(ARTICULOS_BLOG_META.map((a) => a.categoria));

  return (
    <>
      <Ld data={migasBlogLd([MIGAS_BLOG])} />
      <Ld data={blogLd(ARTICULOS_BLOG_META)} />

      <header className="bl-cab">
        <div className="bl-ancho">
          <Migas migas={[{ nombre: 'Blog' }]} />
          <div className="bl-cab-rejilla">
            <div>
              <p className="bl-kicker">Fundador de Tentare</p>
              <h1 className="bl-h1">Blog de {AUTOR_BLOG.nombre}</h1>
              <p className="bl-dek">
                El blog del fundador de Tentare. Emprendimiento, tecnología, startups y cómo se construye un software para estudios de Pilates y yoga desde Barcelona.
              </p>
              <ul className="bl-datos">
                <li><Link href={RUTA_AUTOR}>Sobre el autor</Link></li>
                <li><a href={`${RUTA_BLOG}/feed.xml`}>RSS</a></li>
              </ul>
            </div>
            <figure className="bl-retrato">
              <Retrato sizes="(max-width: 860px) 22rem, 28rem" prioridad />
            </figure>
          </div>
        </div>
      </header>

      <main className="bl-ancho">
        {destacado ? (
          <section className="bl-seccion" aria-labelledby="bl-destacado-t">
            <h2 id="bl-destacado-t">Para empezar</h2>
            <Link href={urlArticuloBlog(destacado.slug)} className="bl-destacado">
              <span className="bl-cat">{CATEGORIAS_BLOG.find((c) => c.slug === destacado.categoria)?.nombre}</span>
              <h3>{destacado.titulo}</h3>
              <p>{destacado.entradilla}</p>
              <span className="bl-meta">
                <time dateTime={fechaArticuloBlog(destacado)}>{fechaLargaBlog(destacado.publicado)}</time> · {destacado.minutos} min de lectura
              </span>
            </Link>
          </section>
        ) : (
          <section className="bl-seccion">
            <p className="bl-prosa" style={{ margin: 0 }}>Todavía no hay artículos publicados.</p>
          </section>
        )}

        {resto.length > 0 && (
          <section className="bl-seccion" aria-labelledby="bl-todos-t">
            <h2 id="bl-todos-t">Todos los artículos</h2>
            <ul className="bl-lista">
              {resto.map((a) => <li key={a.slug}><FilaArticulo a={a} /></li>)}
            </ul>
          </section>
        )}

        <section className="bl-seccion" aria-labelledby="bl-temas-t">
          <div className="bl-columnas">
            <h2 id="bl-temas-t">De qué se escribe</h2>
            <ul className="bl-temas">
              {CATEGORIAS_BLOG.map((c) => {
                const primero = ARTICULOS_BLOG_META.find((a) => a.categoria === c.slug);
                return (
                  <li key={c.slug} title={c.descripcion}>
                    {conArticulos.has(c.slug) && primero
                      ? <Link href={`${RUTA_BLOG}#articulo-${primero.slug}`}>{c.nombre}</Link>
                      : <span className="bl-tema-sin">{c.nombre}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <footer className="bl-pie">
          <span>Escrito por <Link href={RUTA_AUTOR}>{AUTOR_BLOG.nombre}</Link>, fundador de <Link href="/">Tentare</Link>.</span>
          <span><a href={`${RUTA_BLOG}/feed.xml`}>Suscribirse por RSS</a></span>
        </footer>
      </main>
    </>
  );
}
