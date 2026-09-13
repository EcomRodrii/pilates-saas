import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test ESTRUCTURAL: ni el panel ni el contexto se pueden importar desde el
// runner (resuelven el alias `@/`). Mismo idioma que los otros de esta familia.
//
// El bug: `cobrarYEmail` hacía
//
//     const factura = facturas.find(f => f.reciboId === reciboId);
//
// JUSTO DESPUÉS de `await marcarCobrado(...)`. Esa función sella la factura y
// la mete con `setFacturas`, pero React todavía no ha re-renderizado: `facturas`
// seguía siendo el array del render ANTERIOR, sin la factura recién emitida.
// Así que `numeroFactura` salía `undefined` y la socia recibía su justificante
// SIN número de factura, segundos después de haberse emitido.
//
// No es un fallo de esa línea: es que el llamador estaba adivinando un dato que
// solo conoce con certeza quien lo creó. Por eso `marcarCobrado` lo devuelve.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

/** El cuerpo SIN comentarios: si no, la propia nota que explica el bug —que
 *  cita la línea vieja— haría fallar el test que la vigila. */
function cuerpoCobrarYEmail(): string {
  const s = leer('components/cobros/panel-pendientes.tsx');
  const i = s.indexOf('async function cobrarYEmail(');
  assert.ok(i > 0, 'no se encontró cobrarYEmail');
  return s.slice(i, s.indexOf('\n  }\n', i))
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
}

// Desde que /api/emails/send arma el justificante desde la BD (el importe y el
// concepto ya no se aceptan del cliente), el número tampoco viaja desde el
// panel: el servidor lo lee de `facturas` por `recibo_id`. Llega porque el
// email se dispara DESPUÉS de `await marcarCobrado(...)`, que ya ha sellado.
test('el número de factura sale de la factura emitida, no del estado del panel', () => {
  const cuerpo = cuerpoCobrarYEmail();
  assert.match(cuerpo, /reciboId/,
    'El panel dice qué recibo; el servidor arma el justificante desde él.');
  assert.doesNotMatch(cuerpo, /facturas\.find\(/,
    'Buscar en `facturas` justo tras el await lee el render anterior: la factura '
    + 'recién emitida todavía no está, y el email sale sin número.');
  assert.doesNotMatch(cuerpo, /numeroFactura/,
    'Un número mandado desde el panel sería texto libre en un justificante de pago.');
  const ruta = leer('app/api/emails/send/route.ts');
  assert.match(ruta, /from\('facturas'\)[\s\S]{0,120}\.eq\('recibo_id', reciboId\)/,
    'El servidor tiene que leer el número de la factura de ESE recibo.');
});

test('marcarCobrado devuelve el número que acaba de emitir', () => {
  const ctx = leer('lib/studio-context.tsx');
  const i = ctx.indexOf('async function marcarCobrado(');
  const cuerpo = ctx.slice(i, ctx.indexOf('\n  }\n', ctx.indexOf('finally', i)));
  assert.match(cuerpo, /numeroFacturaEmitida = fac\.numeroCompleto/,
    'Si no se captura al crearla, el llamador no tiene de dónde sacarla.');
  assert.match(cuerpo, /numeroFactura: numeroFacturaEmitida/,
    'Y hay que devolverlo en AMBAS salidas: el cobro puede registrarse aunque '
    + 'el sellado falle, y al revés.');
});
