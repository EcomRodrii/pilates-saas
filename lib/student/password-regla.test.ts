import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoPasswordInvalida, MINIMO_PASSWORD } from './password-regla.ts';

test('el mínimo es el REAL del proyecto, no uno inventado', () => {
  // `password_min_length` está en 8 en la configuración de Supabase Auth.
  // Decir 6 en pantalla y que el servidor exija 8 sería mandarla a fallar sin
  // explicarle por qué.
  assert.equal(MINIMO_PASSWORD, 8);
  assert.equal(motivoPasswordInvalida('1234567', '1234567', 'vieja')?.campo, 'nueva');
  assert.equal(motivoPasswordInvalida('12345678', '12345678', 'vieja'), null);
});

test('si las dos no coinciden, se señala LA REPETIDA', () => {
  // Culpar a la nueva mandaría a cambiar el campo que está bien.
  const m = motivoPasswordInvalida('unaBuena123', 'otraCosa456', 'vieja');
  assert.equal(m?.campo, 'repetida');
});

test('cambiar por la MISMA no es un cambio', () => {
  // El servidor lo acepta sin rechistar, así que sin esto se iría con un
  // «cambiada ✓» sin haber cambiado nada.
  const m = motivoPasswordInvalida('laMisma123', 'laMisma123', 'laMisma123');
  assert.equal(m?.campo, 'nueva');
  assert.match(m!.texto, /distinta/i);
});

test('el orden de las comprobaciones no deja pasar un caso por otro', () => {
  // Corta y repetida distinta: manda la longitud, que es lo que ella puede
  // arreglar primero.
  assert.equal(motivoPasswordInvalida('abc', 'xyz', 'vieja')?.campo, 'nueva');
});
