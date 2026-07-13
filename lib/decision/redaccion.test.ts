import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRespuestaIA, type RedaccionOutput, type ContextoValidacion } from './redaccion.ts';

function fallback(): RedaccionOutput {
  return {
    saludo: 'Buenos días, Marco. Hoy está todo bastante tranquilo.',
    items: new Map([
      ['a', { titulo: 'Noto a Laura viniendo menos de lo habitual', motivo: 'Lleva 18 días sin aparecer.' }],
      ['b', { titulo: 'Se quedaron 2 pagos sin completar', motivo: 'Son 180€ pendientes de cobrar.' }],
    ]),
  };
}

test('validarRespuestaIA: JSON válido con ids conocidos reemplaza el texto del motor', () => {
  const raw = JSON.stringify({
    saludo: 'Buenos días, Marco. Solo 2 cosas hoy.',
    items: [
      { id: 'a', titulo: 'Noto a Laura a punto de irse', motivo: 'Venía 3x/semana y lleva 18 días sin aparecer.' },
    ],
  });
  const r = validarRespuestaIA(raw, fallback());
  assert.equal(r.saludo, 'Buenos días, Marco. Solo 2 cosas hoy.');
  assert.equal(r.items.get('a')?.titulo, 'Noto a Laura a punto de irse');
  // 'b' no vino en la respuesta → conserva el texto del motor.
  assert.equal(r.items.get('b')?.titulo, 'Se quedaron 2 pagos sin completar');
});

test('validarRespuestaIA: JSON inválido → fallback completo (nunca bloquea el análisis)', () => {
  const r = validarRespuestaIA('esto no es JSON', fallback());
  assert.deepEqual(r, fallback());
});

test('validarRespuestaIA: id desconocido se ignora sin afectar a los demás', () => {
  const raw = JSON.stringify({ items: [{ id: 'fantasma', titulo: 'X', motivo: 'Y' }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.equal(r.items.has('fantasma'), false);
  assert.equal(r.items.size, 2);
});

test('validarRespuestaIA: título > 80 caracteres se rechaza, conserva el del motor', () => {
  const tituloLargo = 'X'.repeat(81);
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: tituloLargo, motivo: 'ok' }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.notEqual(r.items.get('a')?.titulo, tituloLargo);
});

test('validarRespuestaIA: motivo > 240 caracteres se rechaza, conserva el del motor', () => {
  const motivoLargo = 'X'.repeat(241);
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: 'ok', motivo: motivoLargo }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.notEqual(r.items.get('a')?.motivo, motivoLargo);
});

test('validarRespuestaIA: item con tipos incorrectos (no string) se ignora', () => {
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: 123, motivo: 'ok' }] });
  const r = validarRespuestaIA(raw, fallback());
  assert.equal(r.items.get('a')?.titulo, 'Noto a Laura viniendo menos de lo habitual');
});

test('validarRespuestaIA: saludo vacío o ausente conserva el saludo base', () => {
  const r = validarRespuestaIA(JSON.stringify({ items: [] }), fallback());
  assert.equal(r.saludo, fallback().saludo);
});

// ─── A-20: la IA no puede inventar cifras fuera de datosUsados ──────────────────

function contexto(): ContextoValidacion {
  return {
    saludoBase: 'Buenos días, Marco. Hoy está todo bastante tranquilo.',
    datosPorId: new Map<string, Record<string, string | number | boolean>>([
      ['a', { nombre: 'Laura', diasSinVenir: 18, frecuenciaHabitual: 3, valorMensual: 89 }],
      ['b', { n: 2, total: 180, diasMedio: 3 }],
    ]),
  };
}

test('A-20: cifras presentes en datosUsados se aceptan', () => {
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: 'Laura lleva 18 días fuera', motivo: 'Venía 3 veces por semana, son 89€ al mes.' }] });
  const r = validarRespuestaIA(raw, fallback(), contexto());
  assert.equal(r.items.get('a')?.titulo, 'Laura lleva 18 días fuera');
});

test('A-20: un importe inventado (no está en datosUsados) se rechaza → texto del motor', () => {
  const raw = JSON.stringify({ items: [{ id: 'b', titulo: 'Se quedaron 2 pagos', motivo: 'Son 500€ que deberían estar en tu cuenta.' }] });
  const r = validarRespuestaIA(raw, fallback(), contexto());
  // 500 no está en datosUsados de 'b' ({n:2,total:180,diasMedio:3}) ni en su texto de motor → se conserva el fallback.
  assert.equal(r.items.get('b')?.motivo, 'Son 180€ pendientes de cobrar.');
});

test('A-20: un porcentaje inventado en el título se rechaza', () => {
  const raw = JSON.stringify({ items: [{ id: 'a', titulo: 'Laura con 40% de riesgo', motivo: 'Lleva 18 días sin venir.' }] });
  const r = validarRespuestaIA(raw, fallback(), contexto());
  assert.equal(r.items.get('a')?.titulo, 'Noto a Laura viniendo menos de lo habitual');
});

test('A-20: la IA puede reutilizar las cifras que el motor ya rendía en su fallback', () => {
  // 180 no está en datosUsados de 'b' como tal token separado, pero sí en el texto del motor ("180€").
  const raw = JSON.stringify({ items: [{ id: 'b', titulo: 'Dos pagos sueltos', motivo: 'Son 180€, cosa de tarjetas.' }] });
  const r = validarRespuestaIA(raw, fallback(), contexto());
  assert.equal(r.items.get('b')?.motivo, 'Son 180€, cosa de tarjetas.');
});

test('A-20: un número inventado en el saludo se rechaza → saludo base', () => {
  const raw = JSON.stringify({ saludo: 'Buenos días, Marco. Tienes 7 cosas urgentes.', items: [] });
  const r = validarRespuestaIA(raw, fallback(), contexto());
  assert.equal(r.saludo, fallback().saludo);
});
