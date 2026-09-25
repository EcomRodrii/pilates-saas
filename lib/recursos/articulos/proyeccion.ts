// De un artículo completo, sus metadatos ligeros (util.ts → ArticuloMeta).
// Lo usan el generador de meta.ts y el test que comprueba que no se ha
// quedado atrás; nunca el código de cliente.
import type { Articulo } from './tipos.ts';
import type { ArticuloMeta } from './util.ts';
import { contarPalabras } from './validar.ts';

export function metaDe(a: Articulo): ArticuloMeta {
  const m: ArticuloMeta = {
    slug: a.slug,
    titulo: a.titulo,
    tituloSeo: a.tituloSeo,
    descripcion: a.descripcion,
    resumen: a.resumen,
    categoria: a.categoria,
    seccion: a.seccion,
    publicado: a.publicado,
    relacionadas: a.relacionadas,
    palabras: contarPalabras(a),
  };
  if (a.actualizado) m.actualizado = a.actualizado;
  return m;
}
