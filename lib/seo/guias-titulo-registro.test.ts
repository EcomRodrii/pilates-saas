import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIAS } from '../recursos/guias.ts';
import { paginaDe } from './paginas.ts';

// Las guías con carpeta propia (app/recursos/<slug>) servían un <title> distinto
// del registro, que es el que alimenta el sitemap, las migas y llms.txt
// (auditoría de la fase 1, 19-oct-2026). Ahora la página lo lee del registro.

const RAIZ = join(import.meta.dirname, '..', '..');

for (const g of GUIAS) {
  test(`${g.slug}: el registro lleva su título y su descripción SEO`, () => {
    const p = paginaDe(`/recursos/${g.slug}`);
    assert.ok(p, 'la guía debe estar en el registro');
    assert.equal(p.titulo, g.tituloSeo);
    assert.equal(p.descripcion, g.descripcionSeo);
    assert.ok(g.tituloSeo.length <= 64, `título de ${g.tituloSeo.length} caracteres: el buscador lo corta`);
    assert.ok(g.descripcionSeo.length <= 160, `descripción de ${g.descripcionSeo.length} caracteres`);
  });

  test(`${g.slug}: la página lee título y descripción del registro`, () => {
    const s = readFileSync(join(RAIZ, 'app', 'recursos', g.slug, 'page.tsx'), 'utf8');
    assert.match(s, /paginaDe\('\/recursos\//, 'la página debe leer paginaDe()');
    assert.match(s, /title: SEO\.titulo/);
    assert.match(s, /description: SEO\.descripcion/);
  });
}
