import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuerpoNudgeCandidata, cuerpoAlertaPropietaria } from './mensajes.ts';

test('nudge a la candidata: primer nombre + clase + enlace', () => {
  const s = cuerpoNudgeCandidata({ nombre: 'Ana María Ruiz', claseNombre: 'Reformer', cuando: 'lun 20 · 18:00', url: 'https://x.app/a/tok' });
  assert.match(s, /Ana/);         // solo el primer nombre
  assert.doesNotMatch(s, /Ruiz/); // no el apellido
  assert.match(s, /Reformer/);
  assert.match(s, /https:\/\/x\.app\/a\/tok/);
});

test('alerta agotada: urgente + enlace al panel', () => {
  const s = cuerpoAlertaPropietaria({ claseNombre: 'Mat', cuando: 'mar 21 · 10:00', tipo: 'agotada', urlPanel: 'https://x.app/sustituciones' });
  assert.match(s, /Nadie/);
  assert.match(s, /Mat/);
  assert.match(s, /https:\/\/x\.app\/sustituciones/);
});

test('alerta sin_respuesta: nombra a la candidata', () => {
  const s = cuerpoAlertaPropietaria({ claseNombre: 'Yoga', cuando: 'mié · 09:00', tipo: 'sin_respuesta', candidataNombre: 'Berta', urlPanel: 'https://x.app/sustituciones' });
  assert.match(s, /Berta/);
  assert.match(s, /Yoga/);
});
