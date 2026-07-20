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

test('alerta de baja (asistido): dice quién y pide el visto bueno', () => {
  const s = cuerpoAlertaPropietaria({
    claseNombre: 'Reformer', cuando: 'jue 23 · 18:00', tipo: 'baja',
    candidataNombre: 'Meri', urlPanel: 'https://x.app/sustituciones',
  });
  assert.match(s, /Meri/);
  assert.match(s, /Reformer/);
  assert.match(s, /visto bueno/);
  assert.match(s, /https:\/\/x\.app\/sustituciones/);
});

test('alerta de baja (autónomo): tranquiliza, no pide acción', () => {
  const s = cuerpoAlertaPropietaria({
    claseNombre: 'Reformer', cuando: 'jue 23 · 18:00', tipo: 'baja',
    candidataNombre: 'Meri', urlPanel: 'https://x.app/sustituciones', yaContactando: true,
  });
  assert.match(s, /buscando sustituta/);
  assert.doesNotMatch(s, /visto bueno/);
});

test('alerta de baja sin nombre: no imprime "undefined"', () => {
  const s = cuerpoAlertaPropietaria({
    claseNombre: 'Mat', cuando: 'vie · 09:00', tipo: 'baja', urlPanel: 'https://x.app/s',
  });
  assert.doesNotMatch(s, /undefined/);
  assert.match(s, /instructora/i);
});
