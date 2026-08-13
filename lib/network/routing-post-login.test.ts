import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverDestinoPostLogin } from './routing-post-login.ts';

test('con estudio real, siempre al dashboard — nunca al panel equivocado', () => {
  assert.equal(resolverDestinoPostLogin(true, null), '/dashboard');
  assert.equal(resolverDestinoPostLogin(true, 'published'), '/dashboard');
  assert.equal(resolverDestinoPostLogin(true, 'draft'), '/dashboard');
});

test('sin estudio, perfil de Network publicado → mi-perfil (el panel)', () => {
  assert.equal(resolverDestinoPostLogin(false, 'published'), '/network/mi-perfil');
});

test('sin estudio, sin perfil o con el onboarding a medias → reanudar, nunca el dashboard', () => {
  assert.equal(resolverDestinoPostLogin(false, null), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'draft'), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'hidden'), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'suspended'), '/network/reanudar');
});
