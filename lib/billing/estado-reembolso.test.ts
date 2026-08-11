import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoReembolso, textoEspera, MINUTOS_HASTA_SOSPECHAR } from './estado-reembolso.ts';

const AHORA = new Date('2026-08-11T12:00:00Z');

test('un recibo cobrado y sin devolución pedida no dice nada', () => {
  assert.equal(estadoReembolso({ estado: 'COBRADO' }, AHORA), null);
});

test('recién pedida: en camino', () => {
  const e = estadoReembolso({ estado: 'COBRADO', reembolsoSolicitadoEn: '2026-08-11T11:59:30Z' }, AHORA);
  assert.equal(e?.fase, 'EN_CAMINO');
  assert.equal(e?.etiqueta, 'Devolviendo…');
});

test('pasado el margen sin confirmar: atascada, y dice cuánto lleva', () => {
  const e = estadoReembolso({ estado: 'COBRADO', reembolsoSolicitadoEn: '2026-08-11T11:53:00Z' }, AHORA);
  assert.equal(e?.fase, 'ATASCADA');
  assert.match(e!.detalle, /7 minutos/);
  // Lo importante del mensaje: que el dinero PUEDE haber salido. Si sugiere
  // que no pasó nada, la propietaria le da otra vez y devuelve dos veces.
  assert.match(e!.detalle, /puede haber salido/);
  assert.match(e!.detalle, /Stripe/);
});

test('justo en el umbral ya cuenta como atascada', () => {
  const justo = new Date(AHORA.getTime() - MINUTOS_HASTA_SOSPECHAR * 60000).toISOString();
  assert.equal(estadoReembolso({ estado: 'COBRADO', reembolsoSolicitadoEn: justo }, AHORA)?.fase, 'ATASCADA');
});

test('un minuto antes del umbral todavía es normal', () => {
  const casi = new Date(AHORA.getTime() - (MINUTOS_HASTA_SOSPECHAR - 1) * 60000).toISOString();
  assert.equal(estadoReembolso({ estado: 'COBRADO', reembolsoSolicitadoEn: casi }, AHORA)?.fase, 'EN_CAMINO');
});

test('devuelta: avisa de que el dinero AÚN no está en el banco de la clienta', () => {
  // "Devuelto" a secas hace pensar que la socia ya lo tiene, y escribe
  // preguntando dónde está su dinero.
  const e = estadoReembolso({ estado: 'DEVUELTO', fechaDevolucion: '2026-08-11T11:00:00Z' }, AHORA);
  assert.equal(e?.fase, 'DEVUELTA');
  assert.match(e!.detalle, /5 y 10 días/);
});

test('una devolución hecha desde Stripe también explica el plazo del banco', () => {
  // Sin `reembolsoSolicitadoEn` (no se pidió desde Tentare). La duda de la
  // socia es idéntica, así que la respuesta también.
  const e = estadoReembolso({ estado: 'DEVUELTO' }, AHORA);
  assert.equal(e?.fase, 'DEVUELTA');
});

test('DEVUELTO gana a "pedida hace rato": no se avisa de atasco de algo ya cerrado', () => {
  const e = estadoReembolso(
    { estado: 'DEVUELTO', reembolsoSolicitadoEn: '2026-08-01T10:00:00Z' }, AHORA);
  assert.equal(e?.fase, 'DEVUELTA');
});

test('textoEspera pasa a horas y a días, en singular y plural', () => {
  assert.equal(textoEspera(1), '1 minuto');
  assert.equal(textoEspera(45), '45 minutos');
  assert.equal(textoEspera(60), '1 hora');
  assert.equal(textoEspera(200), '3 horas');
  assert.equal(textoEspera(1440), '1 día');
  assert.equal(textoEspera(4320), '3 días');
});
