// Búsqueda real del Centro de Ayuda: sobre el registro (lib/ayuda/registro.ts),
// no un input decorativo. Sin backend ni índice externo — con el volumen de
// artículos de un Help Center de un solo producto, un filtro en memoria sobre
// título + descripción + términos + categoría es suficiente y no añade
// infraestructura nueva. Si el catálogo crece mucho, esto es lo primero que
// se cambiaría por una función de Postgres (ts_vector), sin tocar quien lo llama.

import { ARTICULOS, articuloDe, CATEGORIAS, categoriaDe, type ArticuloAyuda, urlArticulo } from './registro.ts';

export interface ResultadoBusqueda {
  articulo: ArticuloAyuda;
  categoriaTitulo: string;
  href: string;
}

function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Busca en artículos publicados. Vacío o solo espacios → todos los artículos, en orden del registro. */
export function buscarArticulos(query: string): ResultadoBusqueda[] {
  const q = normaliza(query.trim());
  const candidatos = ARTICULOS.filter((a) => a.estado === 'publicado');

  const filtrados = q === '' ? candidatos : candidatos.filter((a) => {
    const categoria = categoriaDe(a.categoria);
    const haystack = normaliza([a.titulo, a.descripcion, ...(a.terminos ?? []), categoria?.titulo ?? ''].join(' '));
    return haystack.includes(q);
  });

  return filtrados.map((articulo) => ({
    articulo,
    categoriaTitulo: categoriaDe(articulo.categoria)?.titulo ?? articulo.categoria,
    href: urlArticulo(articulo),
  }));
}

/** Sugerencias cuando la búsqueda no da resultados: las categorías cuyo nombre roza la consulta, si no ninguna. */
export function categoriasSugeridas(query: string, max = 3) {
  const q = normaliza(query.trim());
  if (q === '') return [];
  const porRelevancia = CATEGORIAS
    .map((c) => ({ c, hit: normaliza(`${c.titulo} ${c.descripcion}`).includes(q) }))
    .filter((x) => x.hit)
    .map((x) => x.c);
  return porRelevancia.length > 0 ? porRelevancia.slice(0, max) : CATEGORIAS.slice(0, max);
}

export { articuloDe };
