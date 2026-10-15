// Una reserva y su clase, siempre del mismo estudio (migr 20261013152427).
//
// La FK de `reservas.sesion_id` solo exige que la clase exista; lo que cuenta
// plazas por `sesion_id` da por hecho, además, que es del mismo estudio que la
// reserva. El trigger `reservas_sesion_del_mismo_estudio_trigger` lo exige al
// crear la reserva y al cambiarle la clase o el estudio, para todos: el panel
// con su sesión y el servidor con service_role.
//
// Este fichero fija las dos mitades: lo de siempre sigue funcionando (mover una
// reserva a otra clase del MISMO estudio desde el panel) y nada deja una reserva
// apuntando a una clase de otro estudio, a una que no existe o a ninguna.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, crearSocia, crearSesion, limpiarFixtures,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

let contador = 0;
const idReserva = () => `res-mismo-estudio-${process.pid}-${Date.now()}-${++contador}`;

async function crearReserva(studioId: string, sesionId: string, socioId: string): Promise<string> {
  const id = idReserva();
  const { error } = await admin.from('reservas').insert({
    id, studio_id: studioId, sesion_id: sesionId, socio_id: socioId, estado: 'CONFIRMADA',
  });
  assert.ok(!error, `no se pudo crear la reserva de fixture: ${error?.message}`);
  return id;
}

async function dondeEsta(id: string) {
  const { data } = await admin.from('reservas').select('studio_id, sesion_id').eq('id', id).single();
  return data as { studio_id: string; sesion_id: string };
}

test('el panel sigue pudiendo mover una reserva a otra clase de SU estudio', async () => {
  const a = await crearStudioConPropietaria(admin);
  try {
    const socioId = await crearSocia(admin, a.studioId);
    const clase1 = await crearSesion(admin, a.studioId);
    const clase2 = await crearSesion(admin, a.studioId);
    const reservaId = await crearReserva(a.studioId, clase1, socioId);

    const { error, count } = await a.comoPropietaria
      .from('reservas').update({ sesion_id: clase2 }, { count: 'exact' }).eq('id', reservaId);
    assert.ok(!error, `mover la reserva a otra clase del mismo estudio falló: ${error?.code} ${error?.message}`);
    assert.equal(count, 1);
    assert.equal((await dondeEsta(reservaId)).sesion_id, clase2);
  } finally {
    await limpiarFixtures(admin, [a]);
  }
});

test('ni el panel ni el servidor dejan una reserva en la clase de otro estudio', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  try {
    const socioId = await crearSocia(admin, a.studioId);
    const claseA = await crearSesion(admin, a.studioId);
    const claseB = await crearSesion(admin, b.studioId);
    const reservaId = await crearReserva(a.studioId, claseA, socioId);

    const panel = await a.comoPropietaria.from('reservas').update({ sesion_id: claseB }).eq('id', reservaId);
    assert.equal(panel.error?.code, '42501', `panel → clase de otro estudio: se esperaba 42501, fue ${panel.error?.code ?? 'sin error'}`);

    const servidor = await admin.from('reservas').update({ sesion_id: claseB }).eq('id', reservaId);
    assert.equal(servidor.error?.code, '42501', `servidor → clase de otro estudio: se esperaba 42501, fue ${servidor.error?.code ?? 'sin error'}`);

    const soloEstudio = await admin.from('reservas').update({ studio_id: b.studioId }).eq('id', reservaId);
    assert.equal(soloEstudio.error?.code, '42501', `cambiar solo el estudio: se esperaba 42501, fue ${soloEstudio.error?.code ?? 'sin error'}`);

    const alta = await admin.from('reservas').insert({
      id: idReserva(), studio_id: a.studioId, sesion_id: claseB, socio_id: socioId, estado: 'CONFIRMADA',
    });
    assert.equal(alta.error?.code, '42501', `crear con la clase de otro estudio: se esperaba 42501, fue ${alta.error?.code ?? 'sin error'}`);

    assert.deepEqual(await dondeEsta(reservaId), { studio_id: a.studioId, sesion_id: claseA }, 'la reserva cambió de clase o de estudio');
  } finally {
    await limpiarFixtures(admin, [a, b]);
  }
});

test('una reserva sin clase, o con una que no existe, tampoco entra', async () => {
  const a = await crearStudioConPropietaria(admin);
  try {
    const socioId = await crearSocia(admin, a.studioId);
    for (const [etiqueta, sesionId] of [['sin clase', null], ['clase inexistente', `sesion-no-existe-${Date.now()}`]] as const) {
      const { error } = await admin.from('reservas').insert({
        id: idReserva(), studio_id: a.studioId, sesion_id: sesionId, socio_id: socioId, estado: 'CONFIRMADA',
      });
      assert.equal(error?.code, '42501', `${etiqueta}: se esperaba 42501, fue ${error?.code ?? 'sin error'}`);
    }
  } finally {
    await limpiarFixtures(admin, [a]);
  }
});
