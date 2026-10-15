import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Las dos lecturas de la Caja (GET /api/pos/catalogo y GET /api/pos/caja) no tapan un
// fallo con una cifra (15-oct-2026, revisión de tentare-stripe en #2734). Antes, una
// consulta caída salía como `caja: null` («caja cerrada»: la hoja ofrecía abrir otra
// encima), como `esperado: Number(esperado ?? 0)` (un arqueo contra 0 €) o como
// `data ?? []` («Hoy 0,00 €», «sin productos»). Las rutas no se pueden importar desde
// node --test (alias `@/`, Next), así que se vigila su código, como
// `reservar-plaza-decide-contrato.test.ts`.

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

test('GET /api/pos/caja: cada lectura mira su error antes de contestar, y lo esperado no se inventa', () => {
  const caja = sinComentarios(leer('app/api/pos/caja/route.ts'));
  const get = caja.slice(caja.indexOf('export async function GET'), caja.indexOf('export async function POST'));
  for (const [error, quien] of [['errorCaja', 'la caja abierta'], ['errorSaldo', 'saldo_caja'], ['errorMovimientos', 'los movimientos']]) {
    assert.match(get, new RegExp(`error: ${error}`), `lee el error de ${quien}`);
    assert.match(get, new RegExp(`if \\(${error}`), `y contesta el fallo si lo hay (${quien})`);
  }
  // El fallo de leer la caja va ANTES de la respuesta de «caja cerrada».
  assert.ok(get.indexOf('if (errorCaja)') < get.indexOf('caja: null'), '«caja cerrada» solo si la consulta fue bien');
  assert.doesNotMatch(get, /esperado \?\? 0/, 'un esperado que no llega no es 0 €');
});

test('GET /api/pos/catalogo: una consulta caída es un fallo, no «sin productos», «caja cerrada» ni «Hoy 0 €»', () => {
  const cat = sinComentarios(leer('app/api/pos/catalogo/route.ts'));
  const corte = cat.indexOf('.find((r) => r.error)');
  assert.ok(corte > 0, 'mira el error de cada una de sus cinco consultas');
  assert.match(cat, /\[prodRes, planRes, studioRes, cajaRes, hoyRes\]\.find\(\(r\) => r\.error\)/);
  // Y lo mira ANTES de usar ningún dato.
  for (const uso of ['studioRes.data', 'hoyRes.data', 'prodRes.data', 'planRes.data', 'cajaRes.data']) {
    assert.ok(cat.indexOf(uso) > corte, `${uso} se usa después de comprobar los errores`);
  }
});

test('GET /api/pos/catalogo: el «hoy» del resumen es el de Madrid', () => {
  const cat = sinComentarios(leer('app/api/pos/catalogo/route.ts'));
  assert.match(cat, /inicioDelDiaEstudio\(hoyEnEstudio\(\)\)/);
  assert.doesNotMatch(cat, /setHours\(/);
});
