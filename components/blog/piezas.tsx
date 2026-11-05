import Link from 'next/link';
import { TextoMarcado } from '@/components/recursos/TextoMarcado';
import { LEGAL } from '@/lib/legal-info';
import { AUTOR_BLOG, RUTA_AUTOR } from '@/lib/blog/autor';
import { categoriaBlog } from '@/lib/blog/categorias';
import type { BloqueBlog } from '@/lib/blog/tipos';
import { fechaLargaBlog, fechaArticuloBlog, urlArticuloBlog, type ArticuloBlogMeta } from '@/lib/blog/util';
import { Avatar } from './Retrato';

export function Ld({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

/** Migas visibles; la última no es un enlace. Las mismas que las del BreadcrumbList del JSON-LD. */
export function Migas({ migas }: { migas: readonly { nombre: string; ruta?: string }[] }) {
  return (
    <nav aria-label="Migas de pan" className="bl-migas">
      <ol>
        <li><Link href="/">Inicio</Link></li>
        {migas.map((m, i) => (
          <li key={m.nombre} {...(i === migas.length - 1 ? { 'aria-current': 'page' as const } : {})}>
            {m.ruta && i < migas.length - 1 ? <Link href={m.ruta}>{m.nombre}</Link> : <span>{m.nombre}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function BloqueBlogVista({ b }: { b: BloqueBlog }) {
  switch (b.t) {
    case 'p':
      return <p><TextoMarcado texto={b.texto} /></p>;
    case 'lista': {
      const Lista = b.ordenada ? 'ol' : 'ul';
      return <Lista>{b.items.map((it) => <li key={it}><TextoMarcado texto={it} /></li>)}</Lista>;
    }
    case 'cita':
      return <blockquote><TextoMarcado texto={b.texto} /></blockquote>;
    case 'nota':
      return <aside className="bl-nota"><p><strong>{b.titulo}</strong><TextoMarcado texto={b.texto} /></p></aside>;
  }
}

/** La fila de un artículo en los listados: fecha a la izquierda, categoría, título y resumen. Sin tarjeta. */
export function FilaArticulo({ a }: { a: ArticuloBlogMeta }) {
  const cat = categoriaBlog(a.categoria);
  const fecha = fechaArticuloBlog(a);
  return (
    <Link href={urlArticuloBlog(a.slug)} className="bl-fila" id={`articulo-${a.slug}`}>
      <time dateTime={fecha}>{fechaLargaBlog(a.publicado)}</time>
      <div>
        <span className="bl-cat">{cat?.nombre}</span>
        <h3>{a.titulo}</h3>
        <p>{a.resumen}</p>
        <span className="bl-meta">{a.minutos} min de lectura</span>
      </div>
    </Link>
  );
}

/** El autor en una línea con su avatar. */
export function FirmaAutor({ aparte }: { aparte?: React.ReactNode }) {
  return (
    <div className="bl-firma">
      <Avatar />
      <p className="bl-firma-texto" style={{ margin: 0 }}>
        <Link href={RUTA_AUTOR} rel="author">{AUTOR_BLOG.nombre}</Link>
        <span>{AUTOR_BLOG.cargo}{aparte ? <> · {aparte}</> : null}</span>
      </p>
    </div>
  );
}

/** Compartir con enlaces normales, sin JavaScript (el portapapeles en iOS es poco fiable). */
export function Compartir({ ruta, titulo }: { ruta: string; titulo: string }) {
  const url = encodeURIComponent(`${LEGAL.url}${ruta}`);
  const texto = encodeURIComponent(titulo);
  const enlaces = [
    { nombre: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}` },
    { nombre: 'X', href: `https://twitter.com/intent/tweet?text=${texto}&url=${url}` },
    { nombre: 'WhatsApp', href: `https://wa.me/?text=${texto}%20${url}` },
    { nombre: 'Correo', href: `mailto:?subject=${texto}&body=${url}` },
  ];
  return (
    <div className="bl-compartir">
      <span>Compartir</span>
      {enlaces.map((e) => (
        <a key={e.nombre} href={e.href} target={e.nombre === 'Correo' ? undefined : '_blank'} rel="noopener noreferrer" aria-label={`Compartir en ${e.nombre}`}>
          {e.nombre}
        </a>
      ))}
    </div>
  );
}
