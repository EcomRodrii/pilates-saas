import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { respuestaTrasCancelar, trasGuardarReferencia } from './referencia-cobro-recibo.ts';
import type { EstadoPagoPOS } from './tipos.ts';

// «Vengo a pagar la cuota» con datáfono o Bizum: si la referencia del cobro no
// queda guardada (el recibo cambió, otro arranque ya guardó la suya, o el UPDATE
// dio error), el cobro en vuelo se cancela y se responde error.

test('⚠️ ninguna fila tocada al guardar la referencia → se cancela el cobro', () => {
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 0 }), 'CANCELAR');
});

test('⚠️ error al guardar la referencia → también se cancela (el sondeo diría «no llegó a iniciarse»)', () => {
  assert.equal(trasGuardarReferencia({ error: true, tocadas: 0 }), 'CANCELAR');
  assert.equal(trasGuardarReferencia({ error: true, tocadas: 1 }), 'CANCELAR');
});

test('fila tocada sin error → se sigue', () => {
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 1 }), 'SEGUIR');
});

test('recibo cambiado, tras cancelar: solo CANCELADO o EXPIRADO dicen que se ha cancelado (409)', () => {
  for (const estado of ['CANCELADO', 'EXPIRADO'] as EstadoPagoPOS[]) {
    const r = respuestaTrasCancelar(estado, 'CAMBIO');
    assert.equal(r.confirmado, true, estado);
    assert.equal(r.http, 409);
    assert.match(r.mensaje, /Hemos cancelado el cobro/);
  }
});

test('⚠️ error al guardar, cancelado de verdad → 503 y a reintentar', () => {
  for (const estado of ['CANCELADO', 'EXPIRADO'] as EstadoPagoPOS[]) {
    assert.deepEqual(respuestaTrasCancelar(estado, 'ERROR_AL_GUARDAR'),
      { confirmado: true, http: 503, mensaje: 'No se ha podido iniciar el cobro: vuelve a intentarlo.' });
  }
});

test('⚠️ tras cancelar: con el pago dentro no se dice que se canceló, y se avisa de no volver a cobrarlo', () => {
  for (const [motivo, http] of [['CAMBIO', 409], ['ERROR_AL_GUARDAR', 503]] as const) {
    const r = respuestaTrasCancelar('PAGADO', motivo);
    assert.equal(r.confirmado, false);
    assert.equal(r.http, http);
    assert.doesNotMatch(r.mensaje, /Hemos cancelado|vuelve a intentarlo/);
    assert.match(r.mensaje, /no lo vuelvas a cobrar/);
  }
});

test('⚠️ tras cancelar: sin confirmación del proveedor no se promete nada', () => {
  for (const motivo of ['CAMBIO', 'ERROR_AL_GUARDAR'] as const) {
    for (const estado of ['PENDIENTE', 'PROCESANDO', 'RECHAZADO', 'ERROR'] as EstadoPagoPOS[]) {
      const r = respuestaTrasCancelar(estado, motivo);
      assert.equal(r.confirmado, false, `${motivo} ${estado}`);
      assert.doesNotMatch(r.mensaje, /Hemos cancelado|vuelve a intentarlo/, `${motivo} ${estado}`);
      assert.match(r.mensaje, /no podemos confirmarlo/, `${motivo} ${estado}`);
    }
  }
  assert.doesNotMatch(respuestaTrasCancelar('PROCESANDO', 'ERROR_AL_GUARDAR').mensaje, /ha cambiado/, 'un error no es que el recibo cambiara');
});

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('⚠️ la ruta del mostrador guarda la referencia con CAS sobre estado y referencia leídos, y cancela antes de responder', () => {
  const fuente = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'app/api/pos/recibo/route.ts'), 'utf8'));
  const iniciar = fuente.indexOf('await prov.iniciar(');
  const update = fuente.indexOf('cobro_mostrador_pi: inicio.referencia', iniciar);
  const cas = fuente.indexOf(".eq('id', reciboId).eq('studio_id', sesion.studioId).eq('estado', recibo.estado);", update);
  const casRef = fuente.indexOf("? guardar.eq('cobro_mostrador_pi', recibo.cobro_mostrador_pi)\n      : guardar.is('cobro_mostrador_pi', null)", cas);
  const select = fuente.indexOf(").select('id');", casRef);
  const decision = fuente.indexOf("trasGuardarReferencia({ error: !!errRef, tocadas: tocadas?.length ?? 0 }) === 'CANCELAR'", select);
  const motivo = fuente.indexOf("const motivo = errRef ? 'ERROR_AL_GUARDAR' : 'CAMBIO';", decision);
  const cancelar = fuente.indexOf('await prov.cancelar(ctx.ctx, inicio.referencia, inicio.checkoutSessionId ?? null);', motivo);
  const consultar = fuente.indexOf('await prov.consultar(ctx.ctx, inicio.referencia);', cancelar);
  const respuesta = fuente.indexOf('respuestaTrasCancelar(tras.estado, motivo)', consultar);
  const error = fuente.indexOf('{ status: respuesta.http }', respuesta);
  const ok = fuente.indexOf('referencia: inicio.referencia,', error);
  assert.ok(iniciar > 0 && update > iniciar && cas > update && casRef > cas && select > casRef, 'UPDATE con CAS (estado + referencia) y conteo de filas');
  assert.ok(decision > select && motivo > decision && cancelar > motivo && consultar > cancelar && respuesta > consultar && error > respuesta,
    'cancelar → preguntar → error con el HTTP de la regla');
  assert.ok(ok > error, 'la respuesta de éxito va después del corte');
  // Solo ids a Sentry.
  assert.ok(fuente.includes('extra: { reciboId, studioId: sesion.studioId, referencia: inicio.referencia, pagoEstado: tras.estado, motivo }'));
});
