// ─────────────────────────────────────────────────────────────────────────────
// Registro de los artículos de /recursos escritos como datos (ver tipos.ts).
//
// El ORDEN de este array es el del listado /recursos (van delante de las guías
// antiguas) y el del sitemap. Cada artículo vive en su propio fichero.
//
// ⚠️ SOLO SERVIDOR (y tests y scripts): importar este fichero mete el texto
// completo de todos los artículos en el bundle. El código de cliente y el
// registro SEO usan meta.ts (generado: `node --experimental-strip-types
// scripts/generar-meta-articulos.mjs` tras añadir o cambiar un artículo; un
// test falla si no se ha regenerado).
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
import bsportVsTimp from './bsport-vs-timp.ts';
import abrirYoga from './como-abrir-un-estudio-de-yoga.ts';
import politicaCancelacion from './politica-de-cancelacion-de-clases.ts';
import serInstructora from './como-ser-instructora-de-pilates.ts';

export const ARTICULOS: Articulo[] = [
  comoAbrir,
  abrirYoga,
  mejorSoftware,
  bsportVsTimp,
  cuantoCuesta,
  precioClase,
  rentabilidad,
  requisitos,
  bonos,
  politicaCancelacion,
  instructora,
  serInstructora,
  iva,
  softwareGratis,
  plantillaAsistencia,
  franquicia,
  nombres,
];

export function articuloPorSlug(slug: string): Articulo | undefined {
  return ARTICULOS.find((a) => a.slug === slug);
}

// Los ayudantes ligeros viven en util.ts para que el cliente pueda usarlos sin
// arrastrar este fichero, que importa el texto entero de cada artículo.
export { urlArticulo, fechaArticulo, minutosLectura } from './util.ts';

export type { Articulo };
