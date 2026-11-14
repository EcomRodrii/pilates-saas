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

/**
 * Busca en artículos publicados. Vacío o solo espacios → todos los artículos, en orden del registro.
 *
 * Cada PALABRA de la consulta tiene que aparecer en algún sitio de la guía, en cualquier orden: «bono caducidad» encuentra «Caducidad y
 * pausa de un bono». Antes la consulta entera tenía que aparecer seguida, y una frase de dos palabras casi nunca coincidía con nada
 * (los resultados vacíos son justo lo que Academy mide, así que no pueden ser vacíos por culpa del buscador). Las coincidencias en el
 * título van primero, luego las de los sinónimos y por último las de la descripción; a igualdad, el orden del registro.
 */
export function buscarArticulos(query: string): ResultadoBusqueda[] {
  const palabras = normaliza(query.trim()).split(/\s+/).filter(Boolean);
  const candidatos = ARTICULOS.filter((a) => a.estado === 'publicado');

  const puntuados = candidatos.map((articulo, orden) => {
    if (palabras.length === 0) return { articulo, orden, puntos: 0, ok: true };
    const categoria = categoriaDe(articulo.categoria);
    const titulo = normaliza(articulo.titulo);
    const terminos = normaliza((articulo.terminos ?? []).join(' '));
    const resto = normaliza([articulo.descripcion, categoria?.titulo ?? ''].join(' '));
    let puntos = 0;
    for (const p of palabras) {
      if (titulo.includes(p)) puntos += 3;
      else if (terminos.includes(p)) puntos += 2;
      else if (resto.includes(p)) puntos += 1;
      else return { articulo, orden, puntos: 0, ok: false };
    }
    return { articulo, orden, puntos, ok: true };
  });

  return puntuados
    .filter((x) => x.ok)
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden)
    .map(({ articulo }) => ({
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
