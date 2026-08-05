import test from 'node:test';
import assert from 'node:assert/strict';
import { filtroDeAmbito, ambitoDeCompatibilidad, parsearAmbito } from './ambito.ts';

// El punto ciego que estos tests cubren: los e2e mockean la red con page.route,
// así que nunca ven la query real que sale hacia Postgres. La traducción
// "ámbito → predicados" es lo único de este cambio comprobable sin red, y es
// justo donde vive el bug (una persona que es staff Y socia con la misma
// cuenta veía en el portal los avisos de su panel, y al abrir la bandeja se los
// marcaba leídos).

test('ámbito socia: acota al estudio Y al rol SOCIA', () => {
  const f = filtroDeAmbito('socia', 'studio-1');
  assert.equal(f.studioId, 'studio-1');
  assert.equal(f.rolIgual, 'SOCIA');
  assert.equal(f.rolDistinto, null);
});

test('ámbito staff: excluye SOCIA y NO acota por estudio', () => {
  const f = filtroDeAmbito('staff', 'studio-1');
  // Aunque llegue un studioId, el lado staff lo ignora: los avisos de otra sede
  // de la cadena son suyos. Acotarlos escondería un pago fallido de la sede B
  // mientras la propietaria mira la sede A.
  assert.equal(f.studioId, null);
  assert.equal(f.rolIgual, null);
  assert.equal(f.rolDistinto, 'SOCIA');
});

test('los dos ámbitos son complementarios: ninguna fila cae en ambos ni se queda fuera', () => {
  // Con la misma cuenta y el mismo estudio, cada aviso pertenece exactamente a
  // una de las dos vistas. Si esto dejara de cumplirse, o se duplicarían avisos
  // o desaparecerían — que es como se descubrió el bug.
  const socia = filtroDeAmbito('socia', 'studio-1');
  const staff = filtroDeAmbito('staff', null);
  const roles = ['SOCIA', 'PROPIETARIO', 'INSTRUCTOR', 'RECEPCION', 'MANAGER'];
  for (const rol of roles) {
    const enSocia = socia.rolIgual === null || socia.rolIgual === rol;
    const enStaff = staff.rolDistinto === null || staff.rolDistinto !== rol;
    assert.equal(enSocia !== enStaff, true, `el rol ${rol} cae en las dos vistas o en ninguna`);
  }
});

test('un rol NUEVO cae del lado staff, no desaparece', () => {
  // El dominio de recipient_role ya se amplió dos veces (RECEPCION en 0102,
  // MANAGER en 0113). Con una allowlist de roles de staff, el siguiente rol se
  // habría caído de la campana del panel en silencio.
  const staff = filtroDeAmbito('staff', null);
  assert.notEqual(staff.rolDistinto, 'ROL_QUE_AUN_NO_EXISTE');
  assert.equal(staff.rolIgual, null, 'el lado staff no puede exigir un rol concreto');
});

test('sin ámbito: se deriva de si hay sesión de staff, nunca se falla cerrado', () => {
  // Fallar cerrado sería peor que no hacer nada: fetchNotificaciones traga los
  // !res.ok y los convierte en "0 sin leer", así que un 400 se vería como
  // "estás al día".
  assert.equal(ambitoDeCompatibilidad(true), 'staff');
  assert.equal(ambitoDeCompatibilidad(false), 'socia');
});

test('parsearAmbito solo acepta los dos valores conocidos', () => {
  assert.equal(parsearAmbito('socia'), 'socia');
  assert.equal(parsearAmbito('staff'), 'staff');
  for (const basura of [null, undefined, '', 'SOCIA', 'admin', 0, {}, ['socia']]) {
    assert.equal(parsearAmbito(basura), null, `debería rechazar ${JSON.stringify(basura)}`);
  }
});
