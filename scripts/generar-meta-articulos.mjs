#!/usr/bin/env node
// Regenera lib/recursos/articulos/meta.ts a partir de los artículos.
//   node --experimental-strip-types scripts/generar-meta-articulos.mjs
// Córrelo tras añadir o cambiar un artículo: lib/recursos/articulos/articulos.test.ts
// falla si meta.ts no coincide con ellos.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTICULOS } from '../lib/recursos/articulos/index.ts';
import { metaDe } from '../lib/recursos/articulos/proyeccion.ts';

const destino = join(import.meta.dirname, '..', 'lib', 'recursos', 'articulos', 'meta.ts');
const meta = ARTICULOS.map(metaDe);
writeFileSync(destino, `// GENERADO por scripts/generar-meta-articulos.mjs a partir de los artículos: no editar a mano.
//
// Los metadatos de cada artículo SIN su cuerpo: lo que necesitan el registro
// SEO (lib/seo/paginas.ts), el listado /recursos, la portada y el JSON-LD del
// blog. Existe para que el código de cliente no arrastre el texto completo de
// los artículos (~300 KB): ver index.ts.
import type { ArticuloMeta } from './util.ts';

export const ARTICULOS_META: ArticuloMeta[] = ${JSON.stringify(meta, null, 2)};
`);
console.log(`meta.ts: ${meta.length} artículos`);
