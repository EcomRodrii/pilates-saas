// ─────────────────────────────────────────────────────────────────────────────
// Lo LIGERO de los artículos: el tipo de sus metadatos y los ayudantes que no
// necesitan el cuerpo. Es lo único de lib/recursos/articulos que puede llegar
// al código de CLIENTE (la home, /recursos): el texto completo de los artículos
// pesa ~300 KB y solo lo pinta el servidor (app/recursos/[slug]).
//
// Sin alias `@/`: lo leen `node --test`, el registro SEO y los scripts.
// ─────────────────────────────────────────────────────────────────────────────

import type { CategoriaRecursos } from '../guias.ts';

/** Lo que el listado, el registro SEO y el JSON-LD necesitan de un artículo. */
export interface ArticuloMeta {
  slug: string;
  titulo: string;
  tituloSeo: string;
  descripcion: string;
  resumen: string;
  categoria: CategoriaRecursos;
  seccion: string;
  publicado: string;
  actualizado?: string;
  relacionadas: string[];
  /** Palabras visibles, para los minutos de lectura. */
  palabras: number;
}

export const urlArticulo = (slug: string) => `/recursos/${slug}`;

/** La última fecha del contenido: la revisión si la hay, si no la publicación. */
export const fechaArticulo = (a: { publicado: string; actualizado?: string }) => a.actualizado ?? a.publicado;

/** Minutos de lectura a 220 palabras por minuto, redondeando hacia arriba. */
export function minutosLectura(palabras: number): number {
  return Math.max(1, Math.ceil(palabras / 220));
}
