// Artículos del blog personal del fundador, escritos como DATOS (mismo enfoque que lib/recursos/articulos, pero
// separado a propósito: aquí firma una persona y no se aplican las reglas de las guías corporativas, que exigen
// fuente en cada cifra y vigilan el catálogo de afirmaciones de producto).
//
// Dos estados:
//  · `publicado`: sale en /blog, tiene su página, entra en el sitemap y en el RSS.
//  · `borrador`: NO tiene ruta, ni sitemap, ni RSS. Lleva un guion y las preguntas que hay que contestar antes de
//    escribirlo, porque un artículo en primera persona sobre cómo y por qué se fundó algo solo lo puede escribir quien
//    lo vivió. Nunca se publican experiencias que no consten.
//
// ⚠️ No hay «programado»: esta infraestructura son ficheros que viajan con un despliegue, así que no hay un reloj que
// publique solo. Publicar es cambiar `estado` a `publicado` y desplegar.
//
// Texto con marcado mínimo (components/recursos/TextoMarcado): **negrita** y [enlace](/ruta) o [enlace](https://…).
// Sin alias `@/`.

import type { CategoriaBlog } from './categorias.ts';

export type BloqueBlog =
  | { t: 'p'; texto: string }
  | { t: 'lista'; items: string[]; ordenada?: boolean }
  /** Frase destacada: una idea del texto, sin atribuirla a nadie más. */
  | { t: 'cita'; texto: string }
  | { t: 'nota'; titulo: string; texto: string };

export interface SeccionBlog {
  /** Ancla en kebab-case. Sale en el índice de contenidos. */
  id: string;
  /** El <h2>. */
  titulo: string;
  bloques: BloqueBlog[];
}

interface BaseBlog {
  /** kebab-case: la URL es /blog/marcos-roca/<slug>. */
  slug: string;
  titulo: string;
  categoria: CategoriaBlog;
}

export interface ArticuloBlogPublicado extends BaseBlog {
  estado: 'publicado';
  /** El <title>, SIN « | Tentare» (se añade solo). */
  tituloSeo: string;
  /** Meta description: 110-170 caracteres. */
  descripcion: string;
  /** Texto de la tarjeta del listado: 1-2 frases. */
  resumen: string;
  /** AAAA-MM-DD. */
  publicado: string;
  /** AAAA-MM-DD, solo si se revisó después de publicarlo. */
  actualizado?: string;
  /** Sale arriba del listado /blog. */
  destacado?: boolean;
  /** Entradilla bajo el título: 1-3 frases. */
  entradilla: string;
  secciones: SeccionBlog[];
  faq?: { q: string; a: string }[];
  /** Rutas internas relacionadas (tienen que existir en el registro SEO). */
  enlaces?: string[];
}

export interface ArticuloBlogBorrador extends BaseBlog {
  estado: 'borrador';
  /** El orden en que se contaría. */
  guion: string[];
  /** Lo que solo el fundador sabe y hay que contestar antes de escribir. */
  preguntas: string[];
}

export type ArticuloBlog = ArticuloBlogPublicado | ArticuloBlogBorrador;
