import test from 'node:test';
import assert from 'node:assert/strict';
import { raizAdminVaAlLogin } from './admin-host.ts';

test('la raíz de admin.tentare.app abre el inicio de sesión', () => {
  assert.equal(raizAdminVaAlLogin('admin.tentare.app', '/'), true);
  assert.equal(raizAdminVaAlLogin('ADMIN.TENTARE.APP', '/'), true);
});

test('no redirige rutas internas ni la home pública de Tentare', () => {
  assert.equal(raizAdminVaAlLogin('admin.tentare.app', '/login'), false);
  assert.equal(raizAdminVaAlLogin('admin.tentare.app', '/configuracion'), false);
  assert.equal(raizAdminVaAlLogin('www.tentare.app', '/'), false);
  assert.equal(raizAdminVaAlLogin('tentare.app', '/'), false);
  assert.equal(raizAdminVaAlLogin('admin.tentare.app.evil.test', '/'), false);
});
