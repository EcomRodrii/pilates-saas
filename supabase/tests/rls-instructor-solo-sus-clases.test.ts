// CI-1, Fase 1: INSTRUCTOR solo puede UPDATE en SUS PROPIAS clases — sin
// INSERT ni DELETE, y sin poder tocar la clase de una compañera (PR #528,
// migr 20260730012600/20260730111000). Antes de este cierre, la cuenta de
// una instructora podía crear/editar/cancelar CUALQUIER clase del estudio y
// añadir alumnas a cualquier reserva (probado en persona contra una cuenta
// real). `puede_gestionar_calendario()` (PROPIETARIO/MANAGER/RECEPCION) es
// quien conserva ese control total; INSTRUCTOR nunca entra en esa función.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, crearInstructora, crearSesion, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

test('INSTRUCTOR puede editar (UPDATE) SU PROPIA clase', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    instructora = await crearInstructora(admin, studio.studioId);
    const sesionId = await crearSesion(admin, studio.studioId, { instructorId: instructora.instructorId });

    const { error, count } = await instructora.comoInstructora
      .from('sesiones').update({ notas: 'editado por su instructora' }, { count: 'exact' }).eq('id', sesionId);
    assert.ok(!error, `no debería fallar: ${error?.message}`);
    assert.equal(count, 1, 'la instructora debería poder editar su propia clase');
  } finally {
    if (instructora) await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [studio]);
  }
});

test('INSTRUCTOR NO puede editar la clase de OTRA instructora del mismo estudio', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructoraA, instructoraB;
  try {
    instructoraA = await crearInstructora(admin, studio.studioId);
    instructoraB = await crearInstructora(admin, studio.studioId);
    const sesionDeB = await crearSesion(admin, studio.studioId, { instructorId: instructoraB.instructorId });

    const { error, count } = await instructoraA.comoInstructora
      .from('sesiones').update({ notas: 'secuestrada por A' }, { count: 'exact' }).eq('id', sesionDeB);
    // Postgres puede responder 0 filas sin error (RLS filtra el UPDATE) o con
    // 42501 según el camino — lo único que no vale es que SÍ se aplique.
    if (!error) assert.equal(count, 0, 'instructora A pudo editar la clase de instructora B — PR #528 reabierto');

    const { data: sigueIgual } = await admin.from('sesiones').select('notas').eq('id', sesionDeB).single();
    assert.notEqual(sigueIgual?.notas, 'secuestrada por A', 'la clase de instructora B cambió de notas — PR #528 reabierto');
  } finally {
    if (instructoraA) await limpiarInstructora(admin, instructoraA);
    if (instructoraB) await limpiarInstructora(admin, instructoraB);
    await limpiarFixtures(admin, [studio]);
  }
});

test('INSTRUCTOR no puede CREAR una clase para una compañera (INSERT con instructor_id ajeno)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructoraA, instructoraB;
  try {
    instructoraA = await crearInstructora(admin, studio.studioId);
    instructoraB = await crearInstructora(admin, studio.studioId);
    const ahora = new Date();

    const { error } = await instructoraA.comoInstructora.from('sesiones').insert({
      id: `sesion-rls-ajena-${Date.now()}`, studio_id: studio.studioId, instructor_id: instructoraB.instructorId,
      inicio: ahora.toISOString(), fin: new Date(ahora.getTime() + 50 * 60_000).toISOString(),
    });
    assert.ok(error, 'instructora A pudo crear una clase A NOMBRE de instructora B — sin RLS que lo frene');
    assert.equal(error?.code, '42501', `se esperaba 42501, se obtuvo: ${error?.code} — ${error?.message}`);
  } finally {
    if (instructoraA) await limpiarInstructora(admin, instructoraA);
    if (instructoraB) await limpiarInstructora(admin, instructoraB);
    await limpiarFixtures(admin, [studio]);
  }
});

test('INSTRUCTOR no puede BORRAR ni siquiera su propia clase (solo PROPIETARIO/MANAGER/RECEPCION cancelan)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    instructora = await crearInstructora(admin, studio.studioId);
    const sesionId = await crearSesion(admin, studio.studioId, { instructorId: instructora.instructorId });

    const { error, count } = await instructora.comoInstructora.from('sesiones').delete({ count: 'exact' }).eq('id', sesionId);
    if (!error) assert.equal(count, 0, 'la instructora pudo borrar su propia clase directamente — puede_gestionar_calendario() reabierto');

    const { data: sigueViva } = await admin.from('sesiones').select('id').eq('id', sesionId).maybeSingle();
    assert.ok(sigueViva, 'la clase desapareció tras el DELETE de la instructora');
  } finally {
    if (instructora) await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [studio]);
  }
});
