import type { Metadata } from 'next';
import Link from 'next/link';
import { Retrato } from '@/components/blog/Retrato';
import { FilaArticulo, Ld, Migas } from '@/components/blog/piezas';
import { ARTICULOS_BLOG_META } from '@/lib/blog/meta';
import { AUTOR_BLOG, FECHA_PERFIL, LINKEDIN_PERSONAL, LINKEDIN_TENTARE, RUTA_AUTOR, RUTA_BLOG } from '@/lib/blog/autor';
import { alternatesBlog } from '@/lib/blog/seo';
import { migasBlogLd, MIGAS_AUTOR, MIGAS_BLOG, perfilLd } from '@/lib/blog/schema';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// La página de autor: lo que primero se busca al buscar a la persona. Solo hechos verificables (lib/blog/autor.ts):
// nada de experiencia, premios, financiación, facturación ni resultados que no consten.
const pagina = paginaDe(RUTA_AUTOR)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: alternatesBlog(RUTA_AUTOR),
  openGraph: {
    siteName: 'Tentare',
    type: 'profile',
    locale: 'es_ES',
    title: pagina.titulo,
    description: pagina.descripcion,
    url: urlDe(RUTA_AUTOR),
    firstName: 'Marcos',
    lastName: 'Roca Rodríguez',
    images: [{ url: AUTOR_BLOG.og.ruta, width: AUTOR_BLOG.og.ancho, height: AUTOR_BLOG.og.alto, alt: AUTOR_BLOG.foto.alt }],
  },
  twitter: { card: 'summary_large_image', title: pagina.titulo, description: pagina.descripcion, images: [AUTOR_BLOG.og.ruta] },
};

export default function AutorPage() {
  return (
    <>
      <Ld data={migasBlogLd([MIGAS_BLOG, MIGAS_AUTOR])} />
      <Ld data={perfilLd(FECHA_PERFIL)} />

      <header className="bl-cab">
        <div className="bl-ancho">
          <Migas migas={[{ nombre: 'Blog', ruta: RUTA_BLOG }, { nombre: AUTOR_BLOG.nombre }]} />
          <div className="bl-cab-rejilla">
            <div>
              <p className="bl-kicker">{AUTOR_BLOG.cargo}</p>
              <h1 className="bl-h1">{AUTOR_BLOG.nombre}</h1>
              <p className="bl-dek">
                Fundador de Tentare, un software de gestión para estudios de Pilates y yoga en España. Escribe sobre emprendimiento, tecnología y cómo se construye un producto desde cero.
              </p>
              <ul className="bl-datos">
                <li>{AUTOR_BLOG.ciudad}, {AUTOR_BLOG.pais}</li>
                <li>{AUTOR_BLOG.edad} años</li>
              </ul>
            </div>
            <figure className="bl-retrato">
              <Retrato sizes="(max-width: 860px) 22rem, 28rem" prioridad />
            </figure>
          </div>
        </div>
      </header>

      <main className="bl-ancho">
        <section className="bl-seccion" aria-labelledby="a-quien">
          <div className="bl-columnas">
            <h2 id="a-quien">Quién es</h2>
            <div className="bl-prosa">
              <p>
                <strong>{AUTOR_BLOG.nombre}</strong> tiene {AUTOR_BLOG.edad} años (a {AUTOR_BLOG.edadAl}) y trabaja desde {AUTOR_BLOG.ciudad}. Es el fundador de Tentare y quien la mantiene: su nombre consta como titular en el <Link href="/legal">aviso legal</Link>.
              </p>
              <p>
                Además de construir el producto, firma las <Link href="/recursos">guías de recursos</Link> de Tentare sobre cómo abrir y gestionar un estudio de Pilates. Cómo se escriben y se comprueban está contado en <Link href="/sobre-tentare#como-escribimos">Sobre Tentare</Link>.
              </p>
              <p>
                Este blog es su espacio personal: aquí cuenta cómo se construye Tentare y lo que va aprendiendo emprendiendo.
              </p>
            </div>
          </div>
        </section>

        <section className="bl-seccion" aria-labelledby="a-tentare">
          <div className="bl-columnas">
            <h2 id="a-tentare">Tentare</h2>
            <div>
              <div className="bl-prosa">
                <p>
                  Tentare es un software de gestión para estudios de Pilates y yoga en España: reservas, cobros, bonos y la gestión del equipo, en un solo panel y con una app con la marca de cada estudio para sus alumnas.
                </p>
              </div>
              <ul className="bl-datos-lista">
                <li><span>Precio</span>Público y con el IVA incluido. Se puede empezar gratis, sin tarjeta.</li>
                <li><span>Permanencia</span>Ninguna: se paga mes a mes y se pueden exportar los datos.</li>
                <li><span>Soporte</span>Una persona, por WhatsApp o por email, en español.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="bl-seccion" aria-labelledby="a-escribe">
          <div className="bl-columnas">
            <h2 id="a-escribe">De qué escribe</h2>
            <ul className="bl-especialidades">
              {AUTOR_BLOG.especialidades.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        </section>

        <section className="bl-seccion" aria-labelledby="a-articulos">
          <div className="bl-columnas">
            <h2 id="a-articulos">Artículos</h2>
            {ARTICULOS_BLOG_META.length > 0 ? (
              <ul className="bl-lista">
                {ARTICULOS_BLOG_META.map((a) => <li key={a.slug}><FilaArticulo a={a} /></li>)}
              </ul>
            ) : <p className="bl-prosa" style={{ margin: 0 }}>Todavía no hay artículos publicados.</p>}
          </div>
        </section>

        <section className="bl-seccion" aria-labelledby="a-enlaces">
          <div className="bl-columnas">
            <h2 id="a-enlaces">Enlaces</h2>
            <ul className="bl-enlaces">
              <li>
                <Link href="/">
                  <span>Tentare<small>La web de la empresa</small></span><span className="bl-flecha" aria-hidden="true">→</span>
                </Link>
              </li>
              <li>
                <Link href="/sobre-tentare">
                  <span>Sobre Tentare<small>Quién hay detrás y cómo se trabaja</small></span><span className="bl-flecha" aria-hidden="true">→</span>
                </Link>
              </li>
              {LINKEDIN_PERSONAL && (
                <li>
                  <a href={LINKEDIN_PERSONAL} target="_blank" rel="me noopener noreferrer">
                    <span>LinkedIn de {AUTOR_BLOG.nombreCorto}<small>Perfil personal</small></span><span className="bl-flecha" aria-hidden="true">↗</span>
                  </a>
                </li>
              )}
              <li>
                <a href={LINKEDIN_TENTARE} target="_blank" rel="noopener noreferrer">
                  <span>LinkedIn de Tentare<small>La página de la empresa</small></span><span className="bl-flecha" aria-hidden="true">↗</span>
                </a>
              </li>
              <li>
                <a href={`${RUTA_BLOG}/feed.xml`}>
                  <span>RSS del blog<small>Para seguir los artículos nuevos</small></span><span className="bl-flecha" aria-hidden="true">→</span>
                </a>
              </li>
            </ul>
          </div>
        </section>

        <footer className="bl-pie">
          <span><Link href={RUTA_BLOG}>← Volver al blog</Link></span>
        </footer>
      </main>
    </>
  );
}
