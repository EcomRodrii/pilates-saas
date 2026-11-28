import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, crearSesion, limpiarFixtures, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

test('reserva y asistencia dejan actor y antes/después; el historial no se puede reescribir', async () => {
  const estudio = await crearStudioConPropietaria(admin);
  const otroEstudio = await crearStudioConPropietaria(admin);
  try {
    const socioId = await crearSocia(admin, estudio.studioId);
    const sesionId = await crearSesion(admin, estudio.studioId);
    const reservaId = `reserva-evento-${randomUUID()}`;
    const { error: alta } = await admin.from('reservas').insert({
      id: reservaId, studio_id: estudio.studioId, sesion_id: sesionId, socio_id: socioId, estado: 'CONFIRMADA',
    });
    assert.ok(!alta, `no se pudo crear la reserva de fixture: ${alta?.message}`);

    const checkIn = new Date().toISOString();
    const { error: marca } = await estudio.comoPropietaria.from('reservas')
      .update({ estado: 'ASISTIDA', check_in_en: checkIn }).eq('id', reservaId);
    assert.ok(!marca, `la propietaria no pudo marcar asistencia: ${marca?.message}`);

    const { data: eventos, error: lectura } = await estudio.comoPropietaria.from('reservas_eventos')
      .select('id, reserva_id, socio_id, sesion_id, operacion, actor_uid, actor_tipo, actor_rol, origen, antes, despues')
      .eq('reserva_id', reservaId).order('id', { ascending: true });
    assert.ok(!lectura, `no se pudo leer el historial propio: ${lectura?.message}`);
    assert.equal(eventos?.length, 2, 'debe constar el alta inicial y el cambio de asistencia');
    assert.deepEqual(
      { operacion: eventos?.[0].operacion, actor: eventos?.[0].actor_tipo, estado: (eventos?.[0].despues as Record<string, unknown>).estado },
      { operacion: 'INSERT', actor: 'SISTEMA', estado: 'CONFIRMADA' },
    );
    assert.deepEqual(
      {
        actor: eventos?.[1].actor_tipo, actorUid: eventos?.[1].actor_uid, actorRol: eventos?.[1].actor_rol,
        origen: eventos?.[1].origen,
        antes: eventos?.[1].antes,
        despues: eventos?.[1].despues,
      },
      {
        actor: 'STAFF', actorUid: estudio.authUserId, actorRol: 'PROPIETARIO', origen: 'PANEL',
        antes: { estado: 'CONFIRMADA', check_in_en: null, spot_id: null, posicion_espera: null },
        // Postgres puede serializar timestamptz como `+00:00` y JS como `Z`;
        // comparar el instante evita fallos por diferencias de formato.
        despues: { estado: 'ASISTIDA', check_in_en: new Date(checkIn).toISOString(), spot_id: null, posicion_espera: null },
      },
    );

    const lecturaCruzada = await otroEstudio.comoPropietaria.from('reservas_eventos')
      .select('id').eq('reserva_id', reservaId);
    assert.equal(lecturaCruzada.data?.length ?? 0, 0, 'otra sede no debe ver el historial');

    const intentoCliente = await estudio.comoPropietaria.from('reservas_eventos')
      .update({ actor_rol: 'MANAGER' }).eq('reserva_id', reservaId);
    assert.ok(intentoCliente.error, 'authenticated no debe poder editar el libro');
    await assert.rejects(
      sql`update public.reservas_eventos set actor_rol = 'MANAGER' where reserva_id = ${reservaId}`,
      /reservas_eventos es inmutable/,
    );
    await assert.rejects(
      sql`delete from public.reservas_eventos where reserva_id = ${reservaId}`,
      /reservas_eventos es inmutable/,
    );
  } finally {
    await limpiarFixtures(admin, [estudio, otroEstudio]);
  }
});

test.after(async () => { await sql.end(); });
