import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  clienteAdminLocal, crearInstructora, crearStudioConPropietaria, limpiarFixtures, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

test('un borrador se puede cambiar; una liquidación confirmada o pagada no cambia de importe ni estado', async () => {
  const estudio = await crearStudioConPropietaria(admin);
  const equipo = await crearInstructora(admin, estudio.studioId);
  const id = `liq-inmutable-${randomUUID()}`;
  try {
    const { error: alta } = await admin.from('liquidaciones_instructoras').insert({
      id, studio_id: estudio.studioId, instructor_id: equipo.instructorId,
      periodo_anio: 2026, periodo_mes: 11, base_eur: 100, estado: 'BORRADOR',
    });
    assert.ok(!alta, `no se pudo crear la liquidación de fixture: ${alta?.message}`);

    const borrador = await estudio.comoPropietaria.from('liquidaciones_instructoras').update({ base_eur: 125 }).eq('id', id);
    assert.ok(!borrador.error, `un borrador debe poder recalcularse: ${borrador.error?.message}`);
    const confirmar = await estudio.comoPropietaria.from('liquidaciones_instructoras')
      .update({ estado: 'CONFIRMADA', confirmada_en: new Date().toISOString(), confirmada_por: estudio.authUserId })
      .eq('id', id).eq('estado', 'BORRADOR');
    assert.ok(!confirmar.error, `la transición BORRADOR → CONFIRMADA debe permitirse: ${confirmar.error?.message}`);

    const editarConfirmada = await estudio.comoPropietaria.from('liquidaciones_instructoras').update({ base_eur: 200 }).eq('id', id);
    assert.match(editarConfirmada.error?.message ?? '', /No se pueden modificar importes/);

    const marcarPagada = await estudio.comoPropietaria.from('liquidaciones_instructoras')
      .update({ estado: 'PAGADA', pagada_en: new Date().toISOString(), pagada_por: estudio.authUserId, referencia_pago: 'transferencia test' })
      .eq('id', id).eq('estado', 'CONFIRMADA');
    assert.ok(!marcarPagada.error, `la transición CONFIRMADA → PAGADA debe permitirse: ${marcarPagada.error?.message}`);

    const editarPagada = await estudio.comoPropietaria.from('liquidaciones_instructoras').update({ base_eur: 1 }).eq('id', id);
    assert.match(editarPagada.error?.message ?? '', /No se pueden modificar importes/);
    const reabrir = await estudio.comoPropietaria.from('liquidaciones_instructoras').update({ estado: 'BORRADOR' }).eq('id', id);
    assert.match(reabrir.error?.message ?? '', /Transición de liquidación no permitida/);
    const [directo] = await sql<{ estado: string; base_eur: string }[]>`
      select estado, base_eur::text from public.liquidaciones_instructoras where id = ${id}`;
    assert.deepEqual(directo, { estado: 'PAGADA', base_eur: '125.00' });
  } finally {
    // Estos tests corren únicamente contra el Postgres efímero del job RLS. Se
    // deshabilita el trigger solo para retirar la fixture, nunca como parte de
    // una operación de producto.
    await sql`set session_replication_role = 'replica'`;
    await sql`delete from public.liquidaciones_instructoras where id = ${id}`;
    await sql`set session_replication_role = 'origin'`;
    await limpiarFixtures(admin, [estudio]);
    await admin.auth.admin.deleteUser(equipo.authUserId).catch(() => {});
  }
});

test.after(async () => { await sql.end(); });
