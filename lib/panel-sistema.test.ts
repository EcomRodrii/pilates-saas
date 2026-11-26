import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// El sistema de diseño y de movimiento del panel tiene UNA fuente: app/estilos/panel-sistema.css.
const leer = (f: string) => readFileSync(f, 'utf8');
const SISTEMA = leer('app/estilos/panel-sistema.css');
const GLOBALS = leer('app/globals.css');

const ficheros = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? ficheros(p) : /\.(tsx|css)$/.test(n) ? [p] : [];
});

test('las curvas del sistema no se vuelven a escribir a mano: se usa su variable', () => {
  const curvas = [...SISTEMA.matchAll(/--pn-ease[a-z-]*: (cubic-bezier\([^)]*\));/g)].map(m => m[1].replace(/\s/g, ''));
  assert.ok(curvas.length >= 6, 'el fichero del sistema ya no declara las curvas');
  const fuera: string[] = [];
  // El panel: sus reglas y sus componentes (sin los comentarios, que pueden citar el valor medido). La web, el acceso y
  // el widget incrustado no cargan necesariamente este fichero y quedan fuera.
  const panel = ['layout', 'dashboard', 'asistente', 'ui', 'configuracion', 'productos'].flatMap(d => ficheros(join('components', d)));
  for (const f of ['app/globals.css', ...panel]) {
    for (const m of leer(f).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '').matchAll(/cubic-bezier\([^)\]]*\)/g)) {
      const normal = m[0].replace(/\s/g, '').replace(/([(,])\./g, '$10.');
      if (curvas.includes(normal)) fuera.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(fuera, []);
});

test('toda variable --pn-* que se usa está declarada', () => {
  const declaradas = new Set([...SISTEMA.matchAll(/(--pn-[a-z0-9-]+):/g)].map(m => m[1]));
  const usadas = new Set<string>();
  for (const f of ['app/globals.css', 'app/estilos/panel-sistema.css', ...ficheros('components'), ...ficheros('app/(dashboard)')]) {
    for (const m of leer(f).matchAll(/(?:var\(|\()(--pn-[a-z0-9-]+)/g)) usadas.add(m[1]);
  }
  assert.deepEqual([...usadas].filter(v => !declaradas.has(v)), []);
});

test('lo que pinta se queda dentro del marco nuevo; fuera de él solo hay movimiento', () => {
  assert.ok(GLOBALS.includes('@import "./estilos/panel-sistema.css";'));
  const sin = SISTEMA.replace(/\/\*[\s\S]*?\*\//g, '');
  const root = sin.match(/:root\s*\{([\s\S]*?)\}/)![1];
  for (const m of root.matchAll(/(--[a-z0-9-]+):/g)) assert.match(m[1], /^--pn-(dur|ease)/, `${m[1]} cambiaría fuera del panel`);
  for (const m of sin.matchAll(/(?:^|\}|\{)\s*([^{}@]+?)\s*\{/g)) {
    for (const sel of m[1].split(/,(?![^(]*\))/).map(x => x.trim()).filter(Boolean)) {
      if (sel === ':root' || sel === 'from' || /^\d+%$/.test(sel)) continue; // pasos de un @keyframes
      assert.ok(sel.startsWith('.panel-app[data-shell-nuevo]'), `selector fuera del marco nuevo: ${sel}`);
    }
  }
});

test('las animaciones del sistema respetan «reducir movimiento» y no dejan un transform aplicado', () => {
  const [antes, movimiento] = SISTEMA.split('@media (prefers-reduced-motion: no-preference)');
  assert.ok(movimiento, 'falta el bloque con preferencia de movimiento');
  assert.ok(!/animation:\s*pn-/.test(antes), 'una animación del sistema fuera del bloque que respeta la preferencia');
  for (const m of movimiento.matchAll(/animation: pn-[^;]+;/g)) assert.match(m[0], /backwards;$/);
  assert.ok(!/@keyframes pn-[\s\S]*?transform:/.test(SISTEMA), 'usa translate/scale, que se suman a la colocación');
});

// El minificador de producción (Lightning CSS) funde `translate`/`scale`/`rotate` con `transform` cuando van en la misma
// regla y puede perder una: en local se ve bien y en producción no (la bola de los interruptores salía fuera de su pista).
test('ninguna regla mezcla translate, scale o rotate con transform', () => {
  const malas: string[] = [];
  for (const f of [...ficheros('app'), ...ficheros('components'), ...ficheros('brand')].filter(x => x.endsWith('.css'))) {
    const css = leer(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/\{([^{}]*)\}/g)) {
      const props = m[1].split(';').map(d => d.split(':')[0].trim());
      if (props.includes('transform') && props.some(p => p === 'translate' || p === 'scale' || p === 'rotate')) malas.push(`${f}: ${m[1].trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(malas, []);
});
