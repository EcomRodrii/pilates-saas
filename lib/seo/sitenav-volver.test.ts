import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Antes (1-oct-2026) este test vigilaba que el «volver» de la barra de las
// páginas públicas (`SiteNav`) no llevara a la misma página en la que estaba: en
// /recursos apuntaba a /recursos y no pasaba nada al pulsarlo.
//
// Desde la fase 2.1 (19-oct-2026) esa barra NO EXISTE: toda la web pública lleva
// la isla (components/web/IslaWeb.tsx), que no tiene «volver» (la miga de pan de
// cada página dice dónde estás), y el mismo pie (components/web/PieWeb.tsx). Lo
// que se vigila ahora es lo que aquel arreglo protegía de fondo: que no vuelva a
// haber una cabecera o un pie por tipo de página.
const RAIZ = join(import.meta.dirname, '..', '..');

function ficheros(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) ficheros(p, salida);
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) salida.push(p);
  }
  return salida;
}

const FUENTES = [...ficheros(join(RAIZ, 'app')), ...ficheros(join(RAIZ, 'components'))]
  .map((f) => ({ f: relative(RAIZ, f), s: readFileSync(f, 'utf8') }));

/** Quién monta la barra o el pie antiguos (import o etiqueta), sin contar comentarios. */
export function usaArmazonAntiguo(fuente: string): boolean {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return /<SiteNav\b|<SiteFooter\b|from ['"][^'"]*\/(SiteNav|SiteFooter)['"]/.test(sinComentarios);
}

test('la barra y el pie antiguos de las interiores ya no existen', () => {
  assert.equal(existsSync(join(RAIZ, 'components/recursos/SiteNav.tsx')), false);
  assert.equal(existsSync(join(RAIZ, 'components/recursos/SiteFooter.tsx')), false);
  assert.deepEqual(FUENTES.filter(({ s }) => usaArmazonAntiguo(s)).map(({ f }) => f), []);
});

test('quien monta la isla monta también el pie: un solo armazón, cabeza y pie juntos', () => {
  // La home es la excepción: la isla va dentro de SeccionHero (el envoltorio que
  // limita hasta dónde se queda pegada) y el pie, en LandingCliente.
  const conIsla = FUENTES.filter(({ f, s }) => /<IslaWeb\b/.test(s) && f !== 'components/landing/SeccionHero.tsx');
  assert.ok(conIsla.length >= 15, `solo ${conIsla.length} ficheros montan la isla: ¿cambió la forma de la etiqueta?`);
  assert.deepEqual(conIsla.filter(({ s }) => !/<PieWeb\b/.test(s)).map(({ f }) => f), []);
  const landing = FUENTES.find(({ f }) => f === 'components/landing/LandingCliente.tsx')!.s;
  assert.match(landing, /<PieWeb \/>/);
  // Y las legales, con el mismo armazón que el resto.
  const legal = FUENTES.find(({ f }) => f === 'app/(legal)/layout.tsx')!.s;
  assert.match(legal, /<IslaWeb \/>/);
  assert.match(legal, /<PieWeb \/>/);
});

test('CONTROL: el detector caza la barra antigua y no confunde la isla ni un comentario', () => {
  assert.equal(usaArmazonAntiguo("import { SiteNav } from '@/components/recursos/SiteNav';"), true);
  assert.equal(usaArmazonAntiguo('<SiteNav backHref="/" backLabel="Inicio" />'), true);
  assert.equal(usaArmazonAntiguo('<SiteFooter />'), true);
  assert.equal(usaArmazonAntiguo('<IslaWeb />\n<PieWeb />'), false);
  assert.equal(usaArmazonAntiguo('// antes era <SiteNav /> y ahora es la isla'), false);
});
