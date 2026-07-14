import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirEvento, analyticsHabilitado, type EventoAnalitica } from './analytics-eventos.ts';

// El contrato importante de esta capa es PII-SAFE + forma estable de evento.

test('analyticsHabilitado() refleja POSTHOG_KEY', () => {
  const prev = process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_KEY;
  assert.equal(analyticsHabilitado(), false);
  process.env.POSTHOG_KEY = 'phc_x';
  assert.equal(analyticsHabilitado(), true);
  if (prev === undefined) delete process.env.POSTHOG_KEY; else process.env.POSTHOG_KEY = prev;
});

test('distinct_id es SIEMPRE el studioId (tenant), no una persona', () => {
  const ev = construirEvento('studio-42', { nombre: 'pago_completado', props: { importe_centimos: 8500, via: 'checkout' } });
  assert.equal(ev.distinct_id, 'studio-42');
  assert.equal(ev.event, 'pago_completado');
});

test('las properties llevan solo datos de negocio (+ $lib), nada de PII', () => {
  const ev = construirEvento('studio-1', { nombre: 'pago_completado', props: { importe_centimos: 1200, via: 'terminal' } });
  const claves = Object.keys(ev.properties).sort();
  assert.deepEqual(claves, ['$lib', 'importe_centimos', 'via']);
  // Ninguna clave de PII conocida debe aparecer.
  for (const pii of ['nombre', 'email', 'telefono', 'nif', 'socio', 'socioId', 'condicion', 'salud']) {
    assert.equal(pii in ev.properties, false, `no debe filtrar ${pii}`);
  }
});

test('el payload NO incluye api_key (lo añade el emisor)', () => {
  const ev = construirEvento('studio-1', { nombre: 'suscripcion_cambiada', props: { plan: 'ESTUDIO', estado: 'active' } });
  assert.equal('api_key' in ev, false);
  assert.deepEqual(ev.properties, { plan: 'ESTUDIO', estado: 'active', $lib: 'tentare-server' });
});

test('timestamp: se incluye solo si se pasa', () => {
  const sin = construirEvento('s', { nombre: 'pago_completado', props: { importe_centimos: 1, via: 'off_session' } });
  assert.equal('timestamp' in sin, false);
  const con = construirEvento('s', { nombre: 'pago_completado', props: { importe_centimos: 1, via: 'off_session' } }, '2026-07-14T00:00:00.000Z');
  assert.equal(con.timestamp, '2026-07-14T00:00:00.000Z');
});

// Nota de tipos: el union EventoAnalitica es la barrera real anti-PII; esto solo
// documenta que un evento válido compila con la forma esperada.
const _muestra: EventoAnalitica = { nombre: 'pago_completado', props: { importe_centimos: 0, via: 'checkout' } };
void _muestra;
