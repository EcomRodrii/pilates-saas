// ─────────────────────────────────────────────────────────────────────────────
// Los tres artículos que se enseñan al final de otro («Sigue leyendo»).
//
// Determinista a propósito (ni azar ni «hora del día»): el servidor y la
// hidratación tienen que pintar lo mismo, y la propietaria que vuelve a un
// artículo ve las mismas tres sugerencias. Orden de preferencia:
//   1. Las que el propio artículo declara en `relacionadas` (elegidas a mano,
//      en ese orden) y que son otros artículos del registro. Las rutas que no
//      son artículos (/precios, /soluciones…) no entran aquí.
//   2. Si faltan, el más reciente de la MISMA categoría.
//   3. Si aún faltan, el más reciente de todos.
// «Más reciente» = fecha de la última revisión (o de publicación); a igualdad,
// el slug en orden alfabético. Nunca el mismo artículo, nunca repetidos.
//
// Solo lee metadatos ligeros (meta.ts): el cuerpo de los artículos no viaja.
// Sin alias `@/`: lo prueban `node --test` y los scripts.
// ─────────────────────────────────────────────────────────────────────────────

import { fechaArticulo, urlArticulo, type ArticuloMeta } from './util.ts';

export const NUM_RELACIONADOS = 3;

/** Más reciente primero; a igualdad, por publicación y luego por slug. */
function masReciente(a: ArticuloMeta, b: ArticuloMeta): number {
  return fechaArticulo(b).localeCompare(fechaArticulo(a))
    || b.publicado.localeCompare(a.publicado)
    || a.slug.localeCompare(b.slug);
}

export function elegirRelacionados(slug: string, todos: readonly ArticuloMeta[], cuantos = NUM_RELACIONADOS): ArticuloMeta[] {
  const actual = todos.find((m) => m.slug === slug);
  if (!actual) return [];
  const otros = todos.filter((m) => m.slug !== slug);
  const elegidos: ArticuloMeta[] = [];
  const poner = (m: ArticuloMeta | undefined) => {
    if (m && elegidos.length < cuantos && !elegidos.includes(m)) elegidos.push(m);
  };

  for (const ruta of actual.relacionadas) poner(otros.find((m) => urlArticulo(m.slug) === ruta));
  for (const m of otros.filter((o) => o.categoria === actual.categoria).sort(masReciente)) poner(m);
  for (const m of [...otros].sort(masReciente)) poner(m);
  return elegidos;
}

/** Las rutas de `relacionadas` que NO son artículos del registro (producto, soluciones…). */
export function relacionadasDeProducto(actual: Pick<ArticuloMeta, 'relacionadas'>, todos: readonly ArticuloMeta[]): string[] {
  const rutasArticulo = new Set(todos.map((m) => urlArticulo(m.slug)));
  return actual.relacionadas.filter((r) => !rutasArticulo.has(r));
}
