import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGINAS, paginaDe, type PaginaSeo } from './paginas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Título y descripción de las páginas COMERCIALES (Ronda 1 de la revisión de la
// landing, 19-oct-2026): la home, /funcionalidades y sus 17, /soluciones y sus 4,
// /comparativa y sus 13, /precios, /glosario y el índice de /recursos.
//
// Lo que fija, y por qué:
//  · que ninguna tenga el título o la descripción vacíos (el buscador se inventa
//    uno, y suele ser peor),
//  · que quepan: título ≤ 64 (Google recorta hacia los 60) y descripción ≤ 160,
//  · que las páginas de producto que valen igual para el yoga no digan solo
//    «Pilates» (decisión del fundador: el producto es de Pilates y yoga),
//  · y que la página LEA el registro: tener el texto escrito en el page.tsx y en
//    `lib/seo/paginas.ts` es lo que dejó títulos desincronizados otras veces.
//
// Las comparativas «¿X merece la pena? …» llevan descripciones largas a
// propósito (el dato del rival más lo de Tentare) y no llevan «| Tentare» (ver el
// comentario de su plantilla en paginas.ts): se miden con su propio techo.
// ─────────────────────────────────────────────────────────────────────────────

const TITULO_MAX = 64;
const DESCRIPCION_MIN = 100;
const DESCRIPCION_MAX = 160;
const DESCRIPCION_MAX_COMPARATIVA = 200;

function esComercial(p: PaginaSeo): boolean {
  const ruta = p.path;
  return (
    ruta === '/' ||
    ruta === '/precios' ||
    ruta === '/glosario' ||
    ruta === '/recursos' ||
    ruta === '/funcionalidades' || ruta.startsWith('/funcionalidades/') ||
    ruta === '/soluciones' || ruta.startsWith('/soluciones/') ||
    ruta === '/comparativa' || ruta.startsWith('/comparativa/')
  );
}

const esDeComparativa = (p: PaginaSeo) => p.path.startsWith('/comparativa/');

/** Devuelve los problemas de una página; vacío = bien. */
export function problemasDeMetadatos(p: Pick<PaginaSeo, 'path' | 'titulo' | 'descripcion'>): string[] {
  const fallos: string[] = [];
  const { path, titulo, descripcion } = p;
  const comparativa = path.startsWith('/comparativa/');

  if (!titulo || titulo.trim() === '') fallos.push('title vacío');
  if (!descripcion || descripcion.trim() === '') fallos.push('description vacía');
  if (titulo && titulo !== titulo.trim()) fallos.push('title con espacios sobrantes');
  if (descripcion && descripcion !== descripcion.trim()) fallos.push('description con espacios sobrantes');
  if (titulo && titulo.length > TITULO_MAX) fallos.push(`title de ${titulo.length} caracteres (máx. ${TITULO_MAX})`);
  const tope = comparativa ? DESCRIPCION_MAX_COMPARATIVA : DESCRIPCION_MAX;
  if (descripcion && descripcion.length > tope) fallos.push(`description de ${descripcion.length} caracteres (máx. ${tope})`);
  if (descripcion && descripcion.length < DESCRIPCION_MIN) fallos.push(`description de ${descripcion.length} caracteres (mín. ${DESCRIPCION_MIN})`);
  return fallos;
}

/** Las páginas de producto que valen igual para yoga no pueden decir solo «Pilates». */
export function problemaPilatesSinYoga(p: Pick<PaginaSeo, 'path' | 'titulo'>): string | null {
  const esProducto =
    p.path === '/precios' || p.path === '/funcionalidades' || p.path === '/recursos' || p.path === '/glosario' ||
    p.path.startsWith('/funcionalidades/');
  if (!esProducto) return null;
  const dicePilates = /pilates/i.test(p.titulo);
  const diceYoga = /yoga/i.test(p.titulo);
  // «por reformer» es una máquina de Pilates: ese título habla de lo suyo.
  const esDeReformer = /reformer/i.test(p.titulo);
  if (dicePilates && !diceYoga && !esDeReformer) return `el title dice Pilates y no yoga: «${p.titulo}»`;
  return null;
}

const COMERCIALES = PAGINAS.filter(esComercial);

test('hay páginas comerciales que medir (y son las que deben ser)', () => {
  const rutas = new Set(COMERCIALES.map((p) => p.path));
  for (const esperada of ['/', '/precios', '/glosario', '/recursos', '/funcionalidades', '/soluciones', '/comparativa']) {
    assert.ok(rutas.has(esperada), `falta ${esperada} entre las comerciales`);
  }
  assert.equal(COMERCIALES.filter((p) => p.path.startsWith('/funcionalidades/')).length, 17);
  assert.equal(COMERCIALES.filter((p) => p.path.startsWith('/soluciones/')).length, 4);
  assert.equal(COMERCIALES.filter(esDeComparativa).length, 13);
});

test('toda página comercial tiene title y description, dentro de largos', () => {
  const todos = COMERCIALES.map((p) => ({ path: p.path, fallos: problemasDeMetadatos(p) })).filter((x) => x.fallos.length > 0);
  assert.deepEqual(todos, [], `Metadatos fuera de regla:\n${todos.map((x) => `  ${x.path}: ${x.fallos.join('; ')}`).join('\n')}`);
});

test('las páginas de producto que valen para yoga no dicen solo Pilates', () => {
  const fallos = COMERCIALES.map((p) => problemaPilatesSinYoga(p)).filter((x): x is string => x !== null);
  assert.deepEqual(fallos, []);
});

test('los títulos de producto llevan la marca al final, igual en todos', () => {
  const sinMarca = COMERCIALES
    .filter((p) => p.path === '/' || p.path === '/precios' || p.path === '/glosario' || p.path === '/recursos' || p.path === '/funcionalidades' || p.path.startsWith('/funcionalidades/'))
    .filter((p) => !p.titulo.endsWith(' | Tentare'))
    .map((p) => p.path);
  assert.deepEqual(sinMarca, []);
});

test('las páginas de conversión terminan la descripción en la acción real', () => {
  // «Empieza gratis»: es lo que dice el botón de la propia web (CTA_ALTA) y es
  // verdad (Founding Studio es gratis y se empieza sin tarjeta). Solo donde la
  // página existe para que alguien empiece; las de detalle de función describen
  // lo que hacen y no llevan llamada.
  for (const path of ['/', '/precios', '/funcionalidades/reservas-online', '/soluciones/estudio-de-yoga', '/soluciones/estudio-de-pilates-reformer', '/soluciones/programa-de-gestion-para-estudio-de-pilates']) {
    const p = paginaDe(path)!;
    assert.match(p.descripcion, /Empieza gratis(, sin tarjeta)?\.$/, `${path}: ${p.descripcion}`);
  }
});

test('CONTROL: el validador caza lo que debe cazar (sin esto, el test de arriba sería hueco)', () => {
  assert.deepEqual(problemasDeMetadatos({ path: '/x', titulo: 'Título correcto | Tentare', descripcion: 'a'.repeat(120) }), []);
  assert.ok(problemasDeMetadatos({ path: '/x', titulo: '', descripcion: 'a'.repeat(120) }).some((f) => f.includes('title vacío')));
  assert.ok(problemasDeMetadatos({ path: '/x', titulo: 'T', descripcion: '   ' }).some((f) => f.includes('description vacía')));
  assert.ok(problemasDeMetadatos({ path: '/x', titulo: 'T'.repeat(80), descripcion: 'a'.repeat(120) }).some((f) => f.includes('title de 80')));
  assert.ok(problemasDeMetadatos({ path: '/x', titulo: 'T', descripcion: 'a'.repeat(170) }).some((f) => f.includes('description de 170')));
  assert.ok(problemasDeMetadatos({ path: '/x', titulo: 'T', descripcion: 'a'.repeat(40) }).some((f) => f.includes('mín.')));
  // La comparativa tiene su propio techo: 170 le vale, 210 no.
  assert.deepEqual(problemasDeMetadatos({ path: '/comparativa/tentare-vs-x', titulo: 'T', descripcion: 'a'.repeat(170) }), []);
  assert.ok(problemasDeMetadatos({ path: '/comparativa/tentare-vs-x', titulo: 'T', descripcion: 'a'.repeat(210) }).length > 0);
  // Pilates sin yoga, sí; con yoga o de reformer, no.
  assert.ok(problemaPilatesSinYoga({ path: '/funcionalidades/x', titulo: 'Reservas para estudios de Pilates | Tentare' }));
  assert.equal(problemaPilatesSinYoga({ path: '/funcionalidades/x', titulo: 'Reservas para Pilates y yoga | Tentare' }), null);
  assert.equal(problemaPilatesSinYoga({ path: '/funcionalidades/x', titulo: 'Aforo por reformer | Tentare' }), null);
});

// ─── La página lee el registro ───────────────────────────────────────────────

function ficheroDe(path: string): string {
  if (path === '/') return join(process.cwd(), 'app', 'page.tsx');
  // El índice de /recursos es un componente de cliente y no puede exportar
  // metadata: la lleva su layout.
  if (path === '/recursos') return join(process.cwd(), 'app', 'recursos', 'layout.tsx');
  return join(process.cwd(), 'app', ...path.split('/').filter(Boolean), 'page.tsx');
}

/** ¿El fichero saca su title y description del registro, sin copia escrita a mano? */
export function leeDelRegistro(fuente: string): boolean {
  return /paginaDe\(/.test(fuente) && /title:\s*pagina\.titulo/.test(fuente) && /description:\s*pagina\.descripcion/.test(fuente);
}

test('cada página comercial toma title y description del registro, no de una copia', () => {
  const copias: string[] = [];
  for (const p of COMERCIALES) {
    const fichero = ficheroDe(p.path);
    assert.ok(existsSync(fichero), `no existe ${fichero}`);
    if (!leeDelRegistro(readFileSync(fichero, 'utf8'))) copias.push(p.path);
  }
  assert.deepEqual(copias, [], `Estas páginas llevan su title/description escrito aparte: ${copias.join(', ')}`);
});

test('CONTROL: una página con el title escrito a mano se detecta', () => {
  assert.equal(leeDelRegistro("export const metadata = { title: 'Algo | Tentare', description: 'Otra cosa' };"), false);
  assert.equal(
    leeDelRegistro("const pagina = paginaDe('/x')!;\nexport const metadata = { title: pagina.titulo, description: pagina.descripcion };"),
    true,
  );
});
