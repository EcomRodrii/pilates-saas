// ─────────────────────────────────────────────────────────────────────────────
// Registro de los artículos de /recursos escritos como datos (ver tipos.ts).
//
// El ORDEN de este array es el del listado /recursos (van delante de las guías
// antiguas) y el del sitemap. Cada artículo vive en su propio fichero.
//
// Sin alias `@/`: lo leen `node --test`, el registro SEO y los scripts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Articulo } from './tipos.ts';
import comoAbrir from './como-abrir-un-estudio-de-pilates.ts';
import mejorSoftware from './mejor-software-para-estudios-de-pilates.ts';
import cuantoCuesta from './cuanto-cuesta-abrir-un-estudio-de-pilates.ts';
import precioClase from './precio-clase-de-pilates.ts';
import rentabilidad from './rentabilidad-estudio-de-pilates.ts';
import requisitos from './requisitos-para-abrir-un-estudio-de-pilates.ts';
import bonos from './bonos-de-pilates.ts';
import instructora from './cuanto-cobra-una-instructora-de-pilates.ts';
import iva from './iva-clases-de-pilates.ts';
import softwareGratis from './software-pilates-gratis.ts';
import plantillaAsistencia from './plantilla-control-de-asistencia-pilates.ts';
import franquicia from './franquicia-de-pilates.ts';
import nombres from './nombres-para-estudio-de-pilates.ts';

export const ARTICULOS: Articulo[] = [
  comoAbrir,
  mejorSoftware,
  cuantoCuesta,
  precioClase,
  rentabilidad,
  requisitos,
  bonos,
  instructora,
  iva,
  softwareGratis,
  plantillaAsistencia,
  franquicia,
  nombres,
];

export function articuloPorSlug(slug: string): Articulo | undefined {
  return ARTICULOS.find((a) => a.slug === slug);
}

export const urlArticulo = (slug: string) => `/recursos/${slug}`;

/** La última fecha del contenido: la revisión si la hay, si no la publicación. */
export const fechaArticulo = (a: Articulo) => a.actualizado ?? a.publicado;

/** Minutos de lectura a 220 palabras por minuto, redondeando hacia arriba. */
export function minutosLectura(palabras: number): number {
  return Math.max(1, Math.ceil(palabras / 220));
}

export type { Articulo };
