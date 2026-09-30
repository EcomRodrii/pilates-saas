import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// `recibos.fecha_cobro` es `date`, no `timestamptz`, y la fecha de la factura
// sale de ella. Con un ISO en UTC un cobro a la 01:30 de Madrid se fechaba el
// día anterior (y a caballo de un trimestre, el trimestre equivocado).
//
// Antes el cobro en lote llevaba en el navegador su propia copia con
// `new Date().toISOString()`. Ahora el cobro a mano lo hace el servidor
// (`confirmarCobro`), que fecha con `hoyEnEstudio`; el navegador solo pinta.
// Este test fija las dos puntas: que el servidor fecha bien y que el panel no
// vuelve a fechar por su cuenta. Es un test sobre el texto de los ficheros
// porque el contexto de React y las rutas no cargan en `node --test`.
const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const ctx = leer('../studio-context.tsx');

test('el servidor fecha el cobro con el día del estudio, no con un ISO en UTC', () => {
  const srv = leer('../billing/confirmar-cobro.ts');
  assert.match(srv, /const hoy = hoyEnEstudio\(/, 'confirmarCobro tiene que fechar con hoyEnEstudio()');
  assert.doesNotMatch(srv, /fecha_cobro:\s*ahoraISO/, 'fecha_cobro es `date`: un ISO en UTC la adelanta o la atrasa un día');
});

test('el panel no fecha cobros por su cuenta: pinta con el día del estudio lo que el servidor confirmó', () => {
  const i = ctx.indexOf('async function reflejarCobrosConfirmados(');
  assert.ok(i > 0, 'no se encontró reflejarCobrosConfirmados');
  const cuerpo = ctx.slice(i, ctx.indexOf('\n  }\n', i)).split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  assert.match(cuerpo, /const fechaCobro = hoyEnEstudio\(\)/);
  assert.doesNotMatch(cuerpo, /new Date\(\)\.toISOString\(\)/);
});

test('cobrarTodosPendientes y marcarCobrado ya no escriben COBRADO desde el navegador', () => {
  for (const nombre of ['marcarCobrado', 'cobrarTodosPendientes']) {
    const i = ctx.indexOf(`async function ${nombre}(`);
    assert.ok(i > 0, `no se encontró ${nombre}`);
    const cuerpo = ctx.slice(i, ctx.indexOf('\n  }\n', i));
    assert.doesNotMatch(cuerpo, /dbMarcarCobrado|dbUpdateRecibosBatch|estado: 'COBRADO'/, `${nombre} escribe COBRADO desde el navegador`);
  }
});
