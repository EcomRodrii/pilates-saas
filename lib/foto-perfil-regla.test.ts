import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoFotoInvalida, TIPOS_FOTO_PERFIL, FOTO_PERFIL_MAX_BYTES } from './foto-perfil-regla.ts';

test('acepta los formatos que el bucket declara, y solo esos', () => {
  for (const t of TIPOS_FOTO_PERFIL) assert.equal(motivoFotoInvalida(t, 1000), null, t);
  // Un formato que el bucket rechaza tiene que caer AQUÍ, con un mensaje que
  // se entienda: si llega, el rechazo viene de Storage y no dice nada útil.
  for (const t of ['image/heic', 'image/gif', 'application/pdf', 'text/html', '']) {
    assert.ok(motivoFotoInvalida(t, 1000), t);
  }
});

test('el tope de tamaño es el del bucket, ni uno más', () => {
  assert.equal(motivoFotoInvalida('image/jpeg', FOTO_PERFIL_MAX_BYTES), null);
  assert.ok(motivoFotoInvalida('image/jpeg', FOTO_PERFIL_MAX_BYTES + 1));
});

test('la regla vive en UN sitio: cliente y servidor no pueden divergir', () => {
  // Este módulo no importa nada y lo usan los dos lados a propósito. Dos
  // listas serían dos criterios, y el que mandara sería el del bucket, con un
  // mensaje que la alumna no puede interpretar.
  assert.deepEqual(TIPOS_FOTO_PERFIL, ['image/jpeg', 'image/png', 'image/webp']);
  assert.equal(FOTO_PERFIL_MAX_BYTES, 5 * 1024 * 1024);
});
