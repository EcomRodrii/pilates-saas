import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cifrarSecretoWebhook, descifrarSecretoWebhook, secretoPideRecifrarse, secretosVigentes } from './secretos.ts';
import { cifrarCredencial } from '../../integraciones/cifrado-credenciales.ts';

const clave = randomBytes(32);
const otra = randomBytes(32);
const claves = { actual: clave, anterior: null, malformada: false };
const ahora = new Date('2026-10-01T10:00:00Z');

test('sin clave de cifrado no hay secreto que guardar (falla cerrado)', () => {
  assert.equal(cifrarSecretoWebhook('whsec_x', 'std-1', 'whk-1', { actual: null, anterior: null, malformada: false }), null);
});

test('ida y vuelta, y atado a su webhook: copiado a otra fila no se descifra', () => {
  const c = cifrarSecretoWebhook('whsec_x', 'std-1', 'whk-1', claves)!;
  assert.ok(c.startsWith('enc:v1:'));
  assert.equal(descifrarSecretoWebhook(c, 'std-1', 'whk-1', claves), 'whsec_x');
  assert.equal(descifrarSecretoWebhook(c, 'std-1', 'whk-2', claves), null);
  assert.equal(descifrarSecretoWebhook(c, 'std-2', 'whk-1', claves), null);
});

test('un secreto en claro (no debería existir) nunca se usa', () => {
  assert.equal(descifrarSecretoWebhook('whsec_en_claro', 'std-1', 'whk-1', claves), null);
});

test('tras rotar firma con el nuevo y, durante el solape, también con el anterior', () => {
  const w = {
    id: 'whk-1', studio_id: 'std-1',
    secreto_cifrado: cifrarSecretoWebhook('whsec_nuevo', 'std-1', 'whk-1', claves)!,
    secreto_anterior_cifrado: cifrarSecretoWebhook('whsec_viejo', 'std-1', 'whk-1', claves)!,
    secreto_anterior_expira_en: new Date(ahora.getTime() + 3_600_000).toISOString(),
  };
  assert.deepEqual(secretosVigentes(w, claves, ahora), ['whsec_nuevo', 'whsec_viejo']);
  assert.deepEqual(secretosVigentes({ ...w, secreto_anterior_expira_en: new Date(ahora.getTime() - 1).toISOString() }, claves, ahora), ['whsec_nuevo']);
  assert.equal(secretosVigentes(w, { actual: otra, anterior: null, malformada: false }, ahora), null);
});

test('el barrido nocturno detecta lo cifrado con la clave anterior', () => {
  const conAnterior = cifrarCredencial('whsec_x', 'std-1:api_webhooks:whk-1:secreto', otra);
  assert.equal(secretoPideRecifrarse(conAnterior, { actual: clave, anterior: otra, malformada: false }), true);
  assert.equal(secretoPideRecifrarse(cifrarSecretoWebhook('whsec_x', 'std-1', 'whk-1', claves)!, claves), false);
});
