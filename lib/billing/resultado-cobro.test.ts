import test from 'node:test';
import assert from 'node:assert/strict';
import { leerAvisoCobro, resultadoDeCobro } from './resultado-cobro.ts';

// El bug que estos tests fijan: la pantalla decía lo CONTRARIO de lo que había
// pasado. El cobro correcto avisaba de un problema inexistente y el cobro que
// dejó dinero cobrado sin registrar se anunciaba como éxito. Si alguien vuelve
// a invertirlo, aquí salta.
//
// ⚠️ No se puede probar por la vía de siempre (un e2e): `page.route` mockea la
// red, así que la suite nunca ve un 202 real. Por eso la decisión vive en un
// módulo puro en vez de deducirse dentro del componente.

test('un cobro cerrado se cuenta como ejecutado', () => {
  const r = resultadoDeCobro({ ok: true });
  assert.equal(r.resultado, 'EJECUTADO');
  assert.match(r.detalle, /aprobado y ejecutado/i);
});

test('cobrado pero sin persistir NO es un éxito: es lo único que exige mirar', () => {
  const r = resultadoDeCobro({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR', detalle: 'Revísalo manualmente.' });
  assert.equal(r.resultado, 'FALLIDO', 'este es el caso que se anunciaba como éxito');
  assert.equal(r.detalle, 'Revísalo manualmente.');
});

test('sin detalle del servidor, el texto sigue diciendo que el dinero SÍ se cobró', () => {
  // Lo que nunca puede pasar es que alguien lo lea como "no se cobró" y lo
  // vuelva a cobrar: el cargo ya está hecho y no se puede deshacer solo.
  const r = resultadoDeCobro({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' });
  assert.equal(r.resultado, 'FALLIDO');
  assert.match(r.detalle, /ejecutado en Stripe/i);
  assert.match(r.detalle, /antes de volver a cobrarlo/i);
});

test('leerAvisoCobro reconoce el 202 y deja pasar el 200', () => {
  // La raíz del bug: 202 entra en `res.ok`, así que sin mirar el cuerpo los dos
  // desenlaces son indistinguibles para el cliente.
  assert.equal(leerAvisoCobro({ ok: true, status: 'succeeded' }), null);
  const aviso = leerAvisoCobro({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR', error: 'No se pudo marcar.' });
  assert.equal(aviso?.aviso, 'COBRADO_SIN_PERSISTIR');
  assert.equal(aviso?.detalle, 'No se pudo marcar.');
});

test('leerAvisoCobro no se cae con un cuerpo raro, y ante la duda no inventa aviso', () => {
  for (const basura of [null, undefined, 'texto', 0, [], {}, { aviso: 'OTRA_COSA' }, { aviso: 123 }]) {
    assert.equal(leerAvisoCobro(basura), null, `no debería ver aviso en ${JSON.stringify(basura) ?? 'undefined'}`);
  }
});

test('con aviso pero sin `error` usable, se rellena con el texto por defecto', () => {
  for (const cuerpo of [{ aviso: 'COBRADO_SIN_PERSISTIR' }, { aviso: 'COBRADO_SIN_PERSISTIR', error: '' }, { aviso: 'COBRADO_SIN_PERSISTIR', error: 42 }]) {
    const r = leerAvisoCobro(cuerpo);
    assert.equal(r?.aviso, 'COBRADO_SIN_PERSISTIR');
    assert.match(r!.detalle, /ejecutado en Stripe/i, 'el detalle nunca puede quedar vacío');
  }
});
