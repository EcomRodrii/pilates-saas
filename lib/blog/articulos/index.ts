// Registro de los artículos del blog personal del fundador (ver tipos.ts). El ORDEN del array no importa: el listado
// se ordena por fecha. ⚠️ SOLO SERVIDOR (y tests y scripts): importar esto mete el texto completo de los artículos en el
// bundle. Sin alias `@/`.

import type { ArticuloBlog, ArticuloBlogBorrador, ArticuloBlogPublicado } from '../tipos.ts';
import quienEs from './marcos-roca-rodriguez-quien-es-el-fundador-de-tentare.ts';
import porQue from './por-que-decidi-construir-tentare.ts';
import barcelona from './construir-una-startup-tecnologica-desde-barcelona.ts';
import retos from './los-retos-de-emprender-con-23-anos.ts';
import saas from './como-construir-un-producto-saas-desde-cero.ts';
import pilates from './tecnologia-y-digitalizacion-en-el-sector-del-pilates.ts';

export const ARTICULOS_BLOG_TODOS: readonly ArticuloBlog[] = [quienEs, porQue, barcelona, retos, saas, pilates];

const esPublicado = (a: ArticuloBlog): a is ArticuloBlogPublicado => a.estado === 'publicado';
const esBorrador = (a: ArticuloBlog): a is ArticuloBlogBorrador => a.estado === 'borrador';

/** Solo lo publicado, del más reciente al más antiguo (a igualdad de fecha, el destacado primero). */
export const ARTICULOS_BLOG: readonly ArticuloBlogPublicado[] = ARTICULOS_BLOG_TODOS.filter(esPublicado)
  .slice()
  .sort((a, b) => b.publicado.localeCompare(a.publicado) || Number(!!b.destacado) - Number(!!a.destacado));

export const BORRADORES_BLOG: readonly ArticuloBlogBorrador[] = ARTICULOS_BLOG_TODOS.filter(esBorrador);

export function articuloBlogPorSlug(slug: string): ArticuloBlogPublicado | undefined {
  return ARTICULOS_BLOG.find((a) => a.slug === slug);
}

export function destacadoBlog(): ArticuloBlogPublicado | undefined {
  return ARTICULOS_BLOG.find((a) => a.destacado) ?? ARTICULOS_BLOG[0];
}

/** Hasta `max` artículos para «Sigue leyendo»: primero los de su categoría, después el resto más reciente. Nunca él mismo. */
export function relacionadosBlog(slug: string, max = 3): ArticuloBlogPublicado[] {
  const a = articuloBlogPorSlug(slug);
  if (!a) return [];
  const otros = ARTICULOS_BLOG.filter((x) => x.slug !== slug);
  const mismos = otros.filter((x) => x.categoria === a.categoria);
  return [...mismos, ...otros.filter((x) => x.categoria !== a.categoria)].slice(0, max);
}
