import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { respuestaTrasCancelar, trasGuardarReferencia } from './referencia-cobro-recibo.ts';
import type { EstadoPagoPOS } from './tipos.ts';

// «Vengo a pagar la cuota» con datáfono o Bizum: si al guardar la referencia del
// cobro el recibo ya no está (borrado o cambiado de estado), el cobro en vuelo se
// cancela y se responde error, en vez de seguir contra un recibo que no existe.

test('⚠️ ninguna fila tocada al guardar la referencia → se cancela el cobro', () => {
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 0 }), 'CANCELAR');
});

test('fila tocada → se sigue; con error del UPDATE también (no se sabe si llegó y el webhook lo cierra)', () => {
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 1 }), 'SEGUIR');
  assert.equal(trasGuardarReferencia({ error: true, tocadas: 0 }), 'SEGUIR');
});

test('tras cancelar: solo CANCELADO o EXPIRADO dicen que se ha cancelado', () => {
  for (const estado of ['CANCELADO', 'EXPIRADO'] as EstadoPagoPOS[]) {
    const r = respuestaTrasCancelar(estado);
    assert.equal(r.confirmado, true, estado);
    assert.match(r.mensaje, /Hemos cancelado el cobro/);
  }
});

test('⚠️ tras cancelar: con el pago dentro no se dice que se canceló, y se avisa de no volver a cobrarlo', () => {
  const r = respuestaTrasCancelar('PAGADO');
  assert.equal(r.confirmado, false);
  assert.doesNotMatch(r.mensaje, /Hemos cancelado/);
  assert.match(r.mensaje, /no lo vuelvas a cobrar/);
});

test('⚠️ tras cancelar: sin confirmación del proveedor no se promete nada', () => {
  for (const estado of ['PENDIENTE', 'PROCESANDO', 'RECHAZADO', 'ERROR'] as EstadoPagoPOS[]) {
    const r = respuestaTrasCancelar(estado);
    assert.equal(r.confirmado, false, estado);
    assert.doesNotMatch(r.mensaje, /Hemos cancelado/, estado);
    assert.match(r.mensaje, /no podemos confirmarlo/, estado);
  }
});

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('⚠️ la ruta del mostrador cuenta filas al guardar la referencia y cancela antes de responder', () => {
  const fuente = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'app/api/pos/recibo/route.ts'), 'utf8'));
  const iniciar = fuente.indexOf('await prov.iniciar(');
  const update = fuente.indexOf('cobro_mostrador_pi: inicio.referencia', iniciar);
  const cas = fuente.indexOf(".eq('id', reciboId).eq('studio_id', sesion.studioId).eq('estado', recibo.estado)", update);
  const select = fuente.indexOf(".select('id');", cas);
  const decision = fuente.indexOf("trasGuardarReferencia({ error: !!errRef, tocadas: tocadas?.length ?? 0 }) === 'CANCELAR'", select);
  const cancelar = fuente.indexOf('await prov.cancelar(ctx.ctx, inicio.referencia, inicio.checkoutSessionId ?? null);', decision);
  const consultar = fuente.indexOf('await prov.consultar(ctx.ctx, inicio.referencia);', cancelar);
  const error = fuente.indexOf('{ status: 409 }', consultar);
  const ok = fuente.indexOf('referencia: inicio.referencia,', error);
  assert.ok(iniciar > 0 && update > iniciar && cas > update && select > cas, 'UPDATE con CAS y conteo de filas');
  assert.ok(decision > select && cancelar > decision && consultar > cancelar && error > consultar, 'cancelar → preguntar → 409');
  assert.ok(ok > error, 'la respuesta de éxito va después del corte');
  // Solo ids a Sentry.
  assert.ok(fuente.includes('extra: { reciboId, studioId: sesion.studioId, referencia: inicio.referencia, pagoEstado: tras.estado }'));
});
