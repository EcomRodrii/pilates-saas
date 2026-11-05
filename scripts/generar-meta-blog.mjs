#!/usr/bin/env node
// Regenera lib/blog/meta.ts a partir de los artículos publicados del blog personal.
//   node --experimental-strip-types scripts/generar-meta-blog.mjs
// Córrelo tras publicar o cambiar un artículo: lib/blog/blog.test.ts falla si meta.ts no coincide con ellos.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTICULOS_BLOG } from '../lib/blog/articulos/index.ts';
import { metaBlogDe } from '../lib/blog/util.ts';

const destino = join(import.meta.dirname, '..', 'lib', 'blog', 'meta.ts');
const meta = ARTICULOS_BLOG.map(metaBlogDe);
writeFileSync(destino, `// GENERADO por scripts/generar-meta-blog.mjs a partir de los artículos publicados: no editar a mano.
//
// Los metadatos de cada artículo SIN su cuerpo: lo que necesitan el registro SEO (lib/seo/paginas.ts), el listado /blog
// y el RSS. Existe para que el código de cliente no arrastre el texto completo de los artículos: ver articulos/index.ts.
// Solo los PUBLICADOS: un borrador no sale aquí ni, por tanto, en el sitemap.
import type { ArticuloBlogMeta } from './util.ts';

export const ARTICULOS_BLOG_META: ArticuloBlogMeta[] = ${JSON.stringify(meta, null, 2)};
`);
console.log(`meta.ts: ${meta.length} artículos publicados`);
