import Link from 'next/link';
import { minutosLectura, urlArticulo, type ArticuloMeta } from '@/lib/recursos/articulos/util';

// «Sigue leyendo» al final de un artículo de /recursos: tres tarjetas sencillas
// (categoría en texto, título y minutos de lectura) sobre el fondo de la página.
// Sin colores por categoría ni letra de máquina de escribir (#2458, 1-oct-2026):
// la categoría es una línea de texto gris, igual para todas. La elección es de
// lib/recursos/articulos/relacionados.ts (determinista). Los estilos
// (`.art-rel*`) viven en ArticleShell, junto a los del resto del artículo.

export function ArticulosRelacionados({
  articulos,
  deProducto,
}: {
  articulos: ArticuloMeta[];
  /** Páginas de producto que el artículo también enlaza (precios, soluciones…). */
  deProducto: { href: string; etiqueta: string }[];
}) {
  if (articulos.length === 0 && deProducto.length === 0) return null;
  return (
    <section aria-labelledby="sigue-leyendo" className="art-rel">
      <h2 id="sigue-leyendo">Sigue leyendo</h2>
      {articulos.length > 0 && (
        <ul className="art-rel-lista">
          {articulos.map((m) => (
            <li key={m.slug}>
              <Link href={urlArticulo(m.slug)} className="art-rel-tarjeta">
                <span className="art-rel-cat">{m.seccion}</span>
                <span className="art-rel-titulo">{m.titulo}</span>
                <span className="art-rel-min">{minutosLectura(m.palabras)} min de lectura</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="art-rel-mas">
        {deProducto.length > 0 && (
          <>
            En Tentare:{' '}
            {deProducto.map((p, i) => (
              <span key={p.href}>
                {i > 0 && ' · '}
                <Link href={p.href}>{p.etiqueta}</Link>
              </span>
            ))}
            <br />
          </>
        )}
        <Link href="/recursos">Ver todas las guías para tu estudio →</Link>
      </p>
    </section>
  );
}
