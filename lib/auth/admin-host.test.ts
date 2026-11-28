import test from 'node:test';
import assert from 'node:assert/strict';
import { debeRedirigirPanelAAdmin, raizAdminVaAlLogin } from './admin-host.ts';

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

test('el login, el registro y todas las rutas del panel se sirven en admin', () => {
  for (const host of ['tentare.app', 'www.tentare.app', 'app.tentare.app']) {
    for (const path of ['/login', '/crear-estudio', '/invitacion', '/dashboard', '/configuracion/apariencia', '/clientas/123']) {
      assert.equal(debeRedirigirPanelAAdmin(host, path), true, `${host}${path}`);
    }
  }
});

test('conserva la landing, las rutas de alumnas y los hosts de preview', () => {
  for (const [host, path] of [
    ['tentare.app', '/'], ['tentare.app', '/precios'], ['app.tentare.app', '/portal/estudio/acceso'],
    ['app.tentare.app', '/network/instructoras'], ['pilates-saas.vercel.app', '/dashboard'],
  ]) assert.equal(debeRedirigirPanelAAdmin(host, path), false, `${host}${path}`);
});
