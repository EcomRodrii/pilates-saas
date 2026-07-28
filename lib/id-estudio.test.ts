import test from 'node:test';
import assert from 'node:assert/strict';
import { idEstudioDe } from './id-estudio.ts';

// Contexto: el alta creaba el id con `Date.now()` + random, así que un segundo
// intento de LA MISMA propietaria nunca chocaba por clave primaria — chocaba por
// slug, y el reintento del 23505 lo rescataba generando "-2", "-3", "-4". En
// producción eso dejó a cinco propietarias con estudios duplicados; a una, con
// cuatro creados en 1,24 s.
//
// La idempotencia depende por completo de que este id sea determinista: si deja
// de serlo, el duplicado vuelve en silencio y sin que falle nada más.

test('el mismo alta da SIEMPRE el mismo id (es lo que hace idempotente el alta)', () => {
  const a = idEstudioDe('8cff8cd0-4bf7-472e-9463-63c4d44f5880', 'Cloe Pilates');
  const b = idEstudioDe('8cff8cd0-4bf7-472e-9463-63c4d44f5880', 'Cloe Pilates');
  assert.equal(a, b);
});

test('no depende de espacios ni mayúsculas: el doble envío suele venir igual pero no idéntico', () => {
  const base = idEstudioDe('uuid-1', 'Cloe Pilates');
  assert.equal(idEstudioDe('uuid-1', '  Cloe Pilates  '), base);
  assert.equal(idEstudioDe('uuid-1', 'cloe pilates'), base);
});

test('dos propietarias distintas con el MISMO nombre no comparten id', () => {
  // Este es el caso que el reintento del 23505 sí debe seguir cubriendo: dos
  // estudios "Pilates Barcelona" de dueñas distintas son dos negocios reales.
  const a = idEstudioDe('uuid-ana', 'Pilates Barcelona');
  const b = idEstudioDe('uuid-berta', 'Pilates Barcelona');
  assert.notEqual(a, b);
});

test('la misma propietaria con nombres distintos obtiene ids distintos', () => {
  // Una dueña puede tener varios negocios independientes (no sedes de cadena,
  // que van por /api/cadena/sedes). No se le puede bloquear el segundo.
  const a = idEstudioDe('uuid-ana', 'Cloe Pilates Eixample');
  const b = idEstudioDe('uuid-ana', 'Cloe Pilates Gràcia');
  assert.notEqual(a, b);
});

test('el id es apto para una columna text y no arrastra caracteres raros', () => {
  const id = idEstudioDe('uuid-ana', 'Pilates Ñoño & Cía — "Gràcia"');
  assert.match(id, /^studio-[0-9a-z]+$/);
});
