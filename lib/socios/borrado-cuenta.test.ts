import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VINCULOS_CUENTA, decidirBorradoCuenta, type RecuentoVinculos } from './borrado-cuenta.ts';

const ceros = (): RecuentoVinculos => Object.fromEntries(VINCULOS_CUENTA.map(v => [v.clave, 0]));

test('sin ningún otro vínculo, la cuenta se borra', () => {
  assert.deepEqual(decidirBorradoCuenta(ceros()), { borrar: true });
});

test('cubre los vínculos que exige la decisión de producto', () => {
  const tablas = new Set(VINCULOS_CUENTA.map(v => `${v.tabla}.${v.columna}`));
  for (const t of [
    'socios.auth_user_id', 'instructores.auth_user_id', 'studios.owner_auth_user_id',
    'cadenas.owner_auth_user_id', 'red_perfiles.auth_user_id', 'red_perfiles_alumna.auth_user_id',
    'plataforma_admin.auth_user_id',
  ]) {
    assert.ok(tablas.has(t), `falta el vínculo ${t}`);
  }
});

test('una otra ficha de socia, una instructora o una dueña conservan la cuenta', () => {
  for (const clave of ['otras_fichas_socia', 'instructora', 'duena_estudio', 'duena_cadena', 'perfil_network', 'admin_plataforma']) {
    const r = decidirBorradoCuenta({ ...ceros(), [clave]: 1 });
    assert.deepEqual(r, { borrar: false, motivo: 'tiene_vinculos', vinculos: [clave] });
  }
});

test('fail-closed: un recuento que falló (null) NO borra', () => {
  const r = decidirBorradoCuenta({ ...ceros(), instructora: null });
  assert.deepEqual(r, { borrar: false, motivo: 'no_verificable', sinComprobar: ['instructora'] });
});

test('fail-closed: un vínculo que ni figura en el recuento NO borra', () => {
  const recuento = ceros();
  delete recuento.duena_cadena;
  const r = decidirBorradoCuenta(recuento);
  assert.equal(r.borrar, false);
  assert.deepEqual(r.borrar === false && r.motivo === 'no_verificable' ? r.sinComprobar : null, ['duena_cadena']);
});

test('fail-closed: un recuento no numérico (NaN) NO borra', () => {
  const r = decidirBorradoCuenta({ ...ceros(), admin_plataforma: Number.NaN });
  assert.equal(r.borrar, false);
});

test('lo no comprobado manda aunque también haya vínculos', () => {
  const r = decidirBorradoCuenta({ ...ceros(), instructora: 2, perfil_network: null });
  assert.equal(r.borrar, false);
  assert.equal(r.borrar === false && r.motivo, 'no_verificable');
});
