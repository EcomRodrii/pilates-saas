import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoDelCobro, ORDEN_MOTIVOS, TEXTO_MOTIVO, tipoDePlanPorSuscripcion } from './motivo-cobro.ts';
import { idsDe } from '../billing/ids-compra.ts';

const tipoDe = tipoDePlanPorSuscripcion(
  [
    { id: 'sus-m', planId: 'pl-m' }, { id: 'sus-b', planId: 'pl-b' }, { id: 'sus-p', planId: 'pl-p' },
    { id: 'sus-huerfana', planId: 'pl-borrado' },
  ],
  [{ id: 'pl-m', tipo: 'MENSUAL' }, { id: 'pl-b', tipo: 'BONO' }, { id: 'pl-p', tipo: 'PUNTUAL' }],
);

test('por el plan de su suscripción: cuota, bono o clase suelta', () => {
  assert.equal(motivoDelCobro({ id: 'rec-1', suscripcionId: 'sus-m' }, tipoDe), 'CUOTA');
  assert.equal(motivoDelCobro({ id: 'rec-renov-sus-b-2026-10', suscripcionId: 'sus-b' }, tipoDe), 'BONO');
  assert.equal(motivoDelCobro({ id: 'rec-web-abc', suscripcionId: 'sus-p' }, tipoDe), 'CLASE_SUELTA');
});

test('el id del recibo manda antes que su suscripción: caja, cita, suelta, penalización y matrícula', () => {
  // Un ticket del TPV que vendió un bono es Caja entero (decisión F4).
  assert.equal(motivoDelCobro({ id: 'rec-pos-v1', suscripcionId: 'sus-b' }, tipoDe), 'CAJA');
  assert.equal(motivoDelCobro({ id: 'rec-cita-c1', suscripcionId: null }, tipoDe), 'SESION_PRIVADA');
  assert.equal(motivoDelCobro({ id: 'rec-suelta-res-1', suscripcionId: 'sus-m' }, tipoDe), 'CLASE_SUELTA');
  assert.equal(motivoDelCobro({ id: 'rec-penaliz-pen-1', suscripcionId: 'sus-m' }, tipoDe), 'OTROS');
  // La matrícula de una compra online comparte sufijo con el recibo del plan: el prefijo es el de `idsDe`.
  const ids = idsDe('cs_test_a1b2c3');
  assert.equal(motivoDelCobro({ id: ids.reciboMatriculaId, suscripcionId: null }, tipoDe), 'OTROS');
  assert.equal(motivoDelCobro({ id: ids.reciboId, suscripcionId: 'sus-b' }, tipoDe), 'BONO');
});

test('sin plan que se sepa, a «Otros»; y nunca por el concepto', () => {
  assert.equal(motivoDelCobro({ id: 'rec-x', suscripcionId: null }, tipoDe), 'OTROS');
  assert.equal(motivoDelCobro({ id: 'rec-x', suscripcionId: 'sus-huerfana' }, tipoDe), 'OTROS');
  assert.equal(motivoDelCobro({ id: 'rec-x', suscripcionId: 'sus-no-existe' }, tipoDe), 'OTROS');
  // El concepto no es un campo de la regla: «Bono 10» escrito a mano sin plan sigue siendo «Otros».
  assert.equal(motivoDelCobro({ id: 'rec-x', suscripcionId: null, concepto: 'Bono 10 clases' } as { id: string; suscripcionId: null }, tipoDe), 'OTROS');
});

test('seis motivos, cada uno con su rótulo', () => {
  assert.deepEqual([...ORDEN_MOTIVOS], ['CUOTA', 'BONO', 'CLASE_SUELTA', 'SESION_PRIVADA', 'CAJA', 'OTROS']);
  assert.equal(TEXTO_MOTIVO.CAJA, 'Caja (TPV)');
});
