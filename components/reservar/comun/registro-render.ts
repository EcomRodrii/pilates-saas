import type { ComponentType } from 'react';
import type { BloqueHome, BloqueTipoCatalogo } from '@/lib/portal-home-bloques';

// El registro de RENDER: qué componente pinta cada bloque del catálogo.
//
// Va aparte del registro de metadatos (`REGISTRO_BLOQUES`, en
// lib/portal-home-bloques.ts) por una razón concreta y no por gusto: aquel
// módulo es PURO —sin React, sin zod— porque lo importan las tres vistas del
// portal y no puede arrastrar peso. Un mapa de componentes React ahí dentro
// rompería eso.
//
// Son dos tablas con la MISMA clave, y esa es justo la parte frágil: un
// bloque con metadatos y sin componente se pinta en blanco, y uno con
// componente y sin metadatos no se puede ni nombrar en el rail.
//
// ⚠️ Aquí ponía «hay un test que exige que los dos conjuntos de claves sean
// idénticos». Ese test NO existe — y un comentario que promete una red que no
// está es peor que no decir nada, porque el siguiente que toque esto se creerá
// cubierto. Lo que sí hay es más fuerte: los DOS registros son
// `Record<Clave…, …>` sobre el mismo tipo derivado de `BloqueHome['kind']`, así
// que es el compilador el que obliga a cubrirlos todos. Si alguna vez uno de
// los dos deja de ser un `Record` completo, entonces sí hará falta el test.

/** Props comunes a todo bloque del catálogo. */
export interface PropsBloqueRender {
  bloque: Exclude<BloqueHome, { kind: 'sistema' }>;
  slug: string;
}

/**
 * Cada componente declara su `kind` concreto (`Extract<BloqueHome, { kind:
 * 'faq' }>`), que es más estrecho que la unión — así dentro de él
 * `bloque.config` está bien tipado sin ningún `as`. Al meterlos en un mapa
 * indexado por `kind` esa relación se pierde para TS, que solo ve "una
 * función que acepta la unión entera".
 *
 * Este helper concentra ESA conversión en un único sitio explicado, en vez de
 * repartir un `as` por cada entrada del mapa. Lo que garantiza que el
 * componente recibe el `kind` que espera no es el tipo aquí, es que
 * `BloqueHomeRender` lo busca por `bloque.kind` — la clave con la que se
 * registró.
 */
function paraKind<K extends BloqueTipoCatalogo>(
  componente: ComponentType<{ bloque: Extract<BloqueHome, { kind: K }>; slug: string }>,
): ComponentType<PropsBloqueRender> {
  return componente as ComponentType<PropsBloqueRender>;
}

export { paraKind };
