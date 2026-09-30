import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esDePago, evaluarSalud, urlErroresSentry, type SenalesEstudio } from './salud-estudio.ts';

const AHORA = new Date('2026-09-30T12:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();
const sano: SenalesEstudio = { estadoSuscripcion: 'active', ultimoAccesoDuena: hace(1), reservas7d: 30, clasesProximas7d: 12, cobrosFallidos30d: 0 };

test('un estudio que lo usa y paga está bien, sin avisos', () => {
  assert.deepEqual(evaluarSalud(sano, AHORA), { nivel: 'bien', avisos: [], diasSinEntrar: 1 });
});

test('el impago a Tentare es riesgo aunque todo lo demás vaya bien', () => {
  const s = evaluarSalud({ ...sano, estadoSuscripcion: 'past_due' }, AHORA);
  assert.equal(s.nivel, 'riesgo');
  assert.deepEqual(s.avisos, ['Su pago a Tentare ha fallado']);
});

test('la dueña sin entrar: atención a la semana, riesgo a las dos, y nunca es riesgo', () => {
  assert.equal(evaluarSalud({ ...sano, ultimoAccesoDuena: hace(8) }, AHORA).nivel, 'atencion');
  assert.equal(evaluarSalud({ ...sano, ultimoAccesoDuena: hace(8) }, AHORA).avisos[0], 'La dueña no entra desde hace 8 días');
  assert.equal(evaluarSalud({ ...sano, ultimoAccesoDuena: hace(15) }, AHORA).nivel, 'riesgo');
  assert.equal(evaluarSalud({ ...sano, ultimoAccesoDuena: null }, AHORA).nivel, 'riesgo');
});

test('sin clases próximas, sin reservas o con cobros fallidos: atención, con el motivo', () => {
  const s = evaluarSalud({ ...sano, clasesProximas7d: 0, reservas7d: 0, cobrosFallidos30d: 2 }, AHORA);
  assert.equal(s.nivel, 'atencion');
  assert.deepEqual(s.avisos, ['Sin clases en los próximos 7 días', 'Ninguna reserva en los últimos 7 días', '2 cobros fallidos a sus alumnas (30 días)']);
  assert.equal(evaluarSalud({ ...sano, cobrosFallidos30d: 1 }, AHORA).avisos[0], '1 cobro fallido a sus alumnas (30 días)');
});

test('una consulta que falla no se lee como cero', () => {
  const s = evaluarSalud({ ...sano, reservas7d: null }, AHORA);
  assert.equal(s.nivel, 'atencion');
  assert.deepEqual(s.avisos, ['No se han podido leer todos los datos: revisa la ficha']);
});

test('de pago = con suscripción de Stripe; el acceso dado a mano no cuenta', () => {
  assert.equal(esDePago('sub_123'), true);
  assert.equal(esDePago(null), false);
  assert.equal(esDePago(''), false);
});

test('el enlace a Sentry filtra por la etiqueta del estudio, o no existe', () => {
  assert.equal(urlErroresSentry('mi-org', 'studio-x'), 'https://mi-org.sentry.io/issues/?query=studio_id%3Astudio-x&statsPeriod=14d');
  assert.equal(urlErroresSentry(undefined, 'studio-x'), null);
});
