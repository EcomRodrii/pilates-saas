import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PAGINAS } from '../../seo/paginas.ts';
import { ARTICULOS as AYUDA, CATEGORIAS, urlArticulo as urlAyuda } from '../../ayuda/registro.ts';
import { GUIAS } from '../guias.ts';
import { ARTICULOS } from './index.ts';
import { enlacesInternos, validarArticulo } from './validar.ts';
import { ARTICULOS_META } from './meta.ts';
import { metaDe } from './proyeccion.ts';

// Todo artículo registrado cumple las reglas de validar.ts, y el registro no
// se pisa consigo mismo ni con las guías antiguas.

const RUTAS = new Set([
  ...PAGINAS.map((p) => p.path),
  ...CATEGORIAS.map((c) => `/ayuda/${c.slug}`),
  ...AYUDA.filter((a) => a.estado === 'publicado').map((a) => urlAyuda(a)),
  '/ayuda', '/crear-estudio',
]);

test('cada artículo pasa el validador', () => {
  for (const a of ARTICULOS) {
    assert.deepEqual(validarArticulo(a, RUTAS), [], `${a.slug}`);
  }
});

test('slugs únicos, sin pisar una guía antigua ni una carpeta de app/recursos', () => {
  const slugs = ARTICULOS.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'slug repetido');
  const carpetas = new Set(readdirSync(new URL('../../../app/recursos/', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('[')).map((d) => d.name));
  for (const s of slugs) {
    assert.ok(!GUIAS.some((g) => g.slug === s), `${s} ya es una guía`);
    assert.ok(!carpetas.has(s), `${s} ya tiene carpeta propia en app/recursos`);
  }
});

test('dos artículos no atacan la misma consulta principal (canibalización)', () => {
  const vistas = new Map<string, string>();
  for (const a of ARTICULOS) {
    const clave = a.consultaPrincipal.toLowerCase().normalize('NFD').replace(/[̀-ͯ¿?¡!]/g, '').trim();
    assert.ok(!vistas.has(clave), `«${a.consultaPrincipal}»: ${vistas.get(clave)} y ${a.slug}`);
    vistas.set(clave, a.slug);
  }
});

test('las relacionadas son páginas del registro (no del centro de ayuda ni del alta)', () => {
  const registro = new Set(PAGINAS.map((p) => p.path));
  for (const a of ARTICULOS) {
    for (const r of a.relacionadas) assert.ok(registro.has(r), `${a.slug} → ${r}`);
  }
});

test('las plantillas enlazadas existen en public/', () => {
  for (const a of ARTICULOS) {
    for (const ruta of enlacesInternos(a).filter((r) => r.startsWith('/recursos/plantillas/'))) {
      assert.ok(existsSync(new URL(`../../../public${ruta}`, import.meta.url)), `${a.slug}: falta public${ruta}`);
    }
  }
});

test('meta.ts está al día con los artículos', () => {
  assert.deepEqual(
    ARTICULOS_META, ARTICULOS.map(metaDe),
    'lib/recursos/articulos/meta.ts desfasado: corre `node --experimental-strip-types scripts/generar-meta-articulos.mjs`',
  );
});

test('lo que llega al cliente no importa el texto de los artículos', () => {
  // index.ts importa el cuerpo entero de cada artículo (~300 KB). El registro
  // SEO lo usa la landing, y /recursos es una página de cliente: si alguno de
  // estos vuelve a importarlo, ese texto viaja en el JavaScript de la home y
  // del listado (pasó con el lote 1, 25-sep-2026).
  const RAIZ = join(import.meta.dirname, '..', '..', '..');
  const LIGEROS = ['lib/seo/paginas.ts', 'lib/recursos/schema.ts', 'app/recursos/page.tsx', 'components/landing/SeccionGuias.tsx'];
  for (const f of LIGEROS) {
    const src = readFileSync(join(RAIZ, f), 'utf8');
    assert.ok(!/from ['"](@\/lib\/recursos\/articulos|\.{1,2}\/[^'"]*articulos(\/index(\.ts)?)?)['"]/.test(src), `${f} importa lib/recursos/articulos entero: usa meta.ts y util.ts`);
  }
});
