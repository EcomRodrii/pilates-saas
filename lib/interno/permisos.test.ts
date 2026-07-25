import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERMISOS, PERMISO_ETIQUETA, PERMISOS_POR_AREA, PRESETS, PERMISOS_PELIGROSOS, PERMISOS_SOLO_CEO,
  esPermiso, tienePermiso, tieneAlguno,
} from './permisos.ts';

test('admin.full concede cualquier permiso, incluidos los que no existen aún', () => {
  const ceo = ['admin.full'];
  for (const p of PERMISOS) assert.equal(tienePermiso(ceo, p), true, `admin.full debería cubrir ${p}`);
});

test('un permiso concreto NO arrastra a los demás de su área', () => {
  // El fallo clásico: dar "ver facturación" y que cuele "devolver dinero".
  const soloLectura = ['billing.read'];
  assert.equal(tienePermiso(soloLectura, 'billing.read'), true);
  assert.equal(tienePermiso(soloLectura, 'billing.refund'), false);
  assert.equal(tienePermiso(soloLectura, 'plans.update'), false);
});

test('Meri: lo que le corresponde y, sobre todo, lo que no', () => {
  const meri = PRESETS.Marketing.permisos;
  for (const p of ['studios.read', 'billing.read', 'marketing.send', 'crm.update', 'logs.read'] as const) {
    assert.equal(tienePermiso(meri, p), true, `Meri debería poder ${p}`);
  }
  // Lo acordado explícitamente: ni borra estudios ni toca dinero ni planes.
  for (const p of ['studios.delete', 'billing.refund', 'plans.update', 'users.delete', 'admin.full'] as const) {
    assert.equal(tienePermiso(meri, p), false, `Meri NO debería poder ${p}`);
  }
});

test('sin permisos no se puede nada', () => {
  for (const p of PERMISOS) assert.equal(tienePermiso([], p), false);
});

test('tieneAlguno: basta uno para pintar una sección del menú', () => {
  assert.equal(tieneAlguno(['crm.update'], ['marketing.send', 'crm.update']), true);
  assert.equal(tieneAlguno(['studios.read'], ['marketing.send', 'crm.update']), false);
  assert.equal(tieneAlguno(['admin.full'], ['marketing.send']), true);
});

test('esPermiso rechaza lo inventado (no se guarda basura en la BD)', () => {
  assert.equal(esPermiso('studios.read'), true);
  assert.equal(esPermiso('studios.readonly'), false);
  assert.equal(esPermiso('*'), false);
  assert.equal(esPermiso(''), false);
});

test('el catálogo está completo: etiqueta y área para cada permiso', () => {
  const enAreas = PERMISOS_POR_AREA.flatMap(a => a.permisos);
  for (const p of PERMISOS) {
    assert.ok(PERMISO_ETIQUETA[p], `falta la etiqueta de ${p}`);
    assert.ok(enAreas.includes(p), `${p} no aparece en ninguna área → invisible en la UI`);
  }
  // Y al revés: nada colado en las áreas que no sea un permiso real.
  for (const p of enAreas) assert.ok(esPermiso(p), `${p} está en un área pero no en PERMISOS`);
  assert.equal(new Set(enAreas).size, enAreas.length, 'un permiso aparece en dos áreas');
});

test('los presets solo conceden permisos reales, y lo irreversible no se delega', () => {
  for (const [nombre, preset] of Object.entries(PRESETS)) {
    for (const p of preset.permisos) assert.ok(esPermiso(p), `preset ${nombre} concede ${p}, que no existe`);
    if (nombre !== 'CEO') {
      // Devolver dinero SÍ puede ir en un preset (es el trabajo de Finanzas);
      // borrar estudios o repartir permisos, no.
      const prohibidos = preset.permisos.filter(p => PERMISOS_SOLO_CEO.includes(p));
      assert.deepEqual(prohibidos, [], `el preset ${nombre} concede permisos que no se delegan: ${prohibidos}`);
    }
  }
  // Y todo lo irreversible está marcado como peligroso (la UI pedirá confirmación).
  for (const p of PERMISOS_SOLO_CEO) {
    assert.ok(PERMISOS_PELIGROSOS.includes(p), `${p} no se delega pero no está marcado como peligroso`);
  }
});
