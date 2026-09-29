// CI-1, Fase 1: escritura de INSTRUCTOR sobre `sesiones`, vía RLS directa.
//
// PR #528 (30-jul-2026) le dio a la instructora un permiso acotado: podía
// crear/editar SU PROPIA clase, nunca la de una compañera. Pero
// `20260914220613_panel_sin_brazo_instructora.sql` (retirada de Tentare Core,
// 14-sep-2026) fue MÁS ALLÁ y le cerró la escritura DIRECTA por completo —
// `sesiones_escritura_insert`/`_update` pasaron a exigir
// `puede_gestionar_calendario()` (PROPIETARIO/MANAGER/RECEPCION) sin ninguna
// excepción para INSTRUCTOR, ni siquiera sobre su propia fila. Todo lo que
// antes hacía por aquí (crear su clase, editarla) ahora lo hace por rutas de
// servidor de la app del estudio (`lib/student/agenda-instructora.ts` y
// compañía) — ".claude/tentare-os.md": "No construir nada para INSTRUCTOR en
// el panel: va a la app del estudio".
//
// Este fichero fija ESE estado (más estricto que PR #528 por sí solo), para
// que si alguna vez alguien reabre un hueco "por comodidad" —reintroducir la
// excepción de instructor en la política, pensando que es lo que PR #528
// decidió— este test lo pare antes de mergear. La LECTURA de su propia
// agenda, que SÍ conserva, ya tiene su propio test en
// rls-instructor-cerrada.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, crearInstructora, crearSesion, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

test('INSTRUCTOR no puede editar (UPDATE) ni siquiera SU PROPIA clase — escritura cerrada del todo', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    instructora = await crearInstructora(admin, studio.studioId);
    const sesionId = await crearSesion(admin, studio.studioId, { instructorId: instructora.instructorId });

    const { error, count } = await instructora.comoInstructora
      .from('sesiones').update({ notas: 'editado por su instructora' }, { count: 'exact' }).eq('id', sesionId);
    if (!error) assert.equal(count, 0, 'la instructora pudo editar su propia clase directamente — la escritura de INSTRUCTOR ya no debería existir en absoluto');

    const { data: sigueIgual } = await admin.from('sesiones').select('notas').eq('id', sesionId).single();
    assert.notEqual(sigueIgual?.notas, 'editado por su instructora', 'la clase cambió de notas tras el UPDATE de la instructora');
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

test('INSTRUCTOR no puede crear NINGUNA clase por RLS directa, ni la suya ni la de una compañera', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructoraA, instructoraB;
  try {
    instructoraA = await crearInstructora(admin, studio.studioId);
    instructoraB = await crearInstructora(admin, studio.studioId);
    const ahora = new Date();

    for (const [etiqueta, instructorIdDestino] of [
      ['a sí misma', instructoraA.instructorId], ['a una compañera', instructoraB.instructorId],
    ] as const) {
      const { error } = await instructoraA.comoInstructora.from('sesiones').insert({
        id: `sesion-rls-${etiqueta}-${Date.now()}`, studio_id: studio.studioId, instructor_id: instructorIdDestino,
        inicio: ahora.toISOString(), fin: new Date(ahora.getTime() + 50 * 60_000).toISOString(),
      });
      assert.ok(error, `instructora A pudo crear una clase asignada ${etiqueta} — la escritura de INSTRUCTOR ya no debería existir en absoluto`);
      assert.equal(error?.code, '42501', `se esperaba 42501, se obtuvo: ${error?.code} — ${error?.message}`);
    }
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
