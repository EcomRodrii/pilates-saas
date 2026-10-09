import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerSesionDeRegalo, metadataDeRegalo, esSesionDeRegalo, type DatosSesionRegalo } from './sesion.ts';

const base: DatosSesionRegalo = {
  studioId: 'studio-x', importeEur: 50, caducidadMeses: 12, compradorNombre: 'Ana',
  compradorEmail: 'ana@example.com', destinatarioNombre: 'Bea', destinatarioEmail: 'bea@example.com', mensaje: 'Disfruta',
};
const pagado = { amountTotal: 5000, currency: 'eur', pagado: true };

test('ida y vuelta: lo que se escribe en la metadata es lo que se lee', () => {
  const m = metadataDeRegalo(base);
  assert.equal(esSesionDeRegalo(m), true);
  const r = leerSesionDeRegalo(m, pagado);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.datos, base);
});

test('no acuña saldo si el cobro no cuadra con la metadata', () => {
  const m = metadataDeRegalo(base);
  assert.deepEqual(leerSesionDeRegalo(m, { ...pagado, amountTotal: 500 }), { ok: false, motivo: 'importe-no-coincide' });
  assert.deepEqual(leerSesionDeRegalo(m, { ...pagado, currency: 'usd' }), { ok: false, motivo: 'importe-no-coincide' });
  assert.deepEqual(leerSesionDeRegalo(m, { ...pagado, amountTotal: null }), { ok: false, motivo: 'importe-no-coincide' });
  assert.deepEqual(leerSesionDeRegalo(m, { ...pagado, pagado: false }), { ok: false, motivo: 'sin-pagar' });
});

test('rechaza metadata mal formada', () => {
  const m = metadataDeRegalo(base);
  assert.equal(leerSesionDeRegalo({ ...m, importeEur: '-5' }, pagado).ok, false);
  assert.equal(leerSesionDeRegalo({ ...m, importeEur: '50.5' }, pagado).ok, false);
  assert.equal(leerSesionDeRegalo({ ...m, caducidadMeses: '0' }, pagado).ok, false);
  assert.equal(leerSesionDeRegalo({ ...m, destinatarioEmail: 'nope' }, pagado).ok, false);
  assert.equal(leerSesionDeRegalo({ ...m, studioId: '' }, pagado).ok, false);
  assert.equal(leerSesionDeRegalo({ ...m, origen: 'otro' }, pagado).ok, false);
  assert.equal(leerSesionDeRegalo(null, pagado).ok, false);
  assert.equal(esSesionDeRegalo({ origen: 'tarjeta_recibo' }), false);
});
