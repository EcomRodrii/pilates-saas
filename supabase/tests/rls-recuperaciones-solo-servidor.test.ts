// Motor de derechos, FASE B (migración 20261002154833): `recuperaciones` solo la escribe el servidor.
//
//  · el personal que gestiona clientas, con su sesión, NO puede insertar, editar ni borrar una recuperación directamente
//    (se saltaría el tope de vivas, la caducidad del estudio y el ledger);
//  · SIGUE leyéndolas, y SIGUE pudiendo crearlas y anularlas por las funciones del servidor (`crear_recuperacion`,
//    `anular_recuperacion`), que son las únicas vías.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-rss-${process.pid}-${Date.now()}-${contador++}`;
const caduca = (dias = 20) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

test('la propietaria no escribe directamente en recuperaciones: ni insertar, ni editar, ni borrar', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socia = await crearSocia(admin, studio.studioId);
    const existente = idUnico('rec');
    const { error: errAlta } = await admin.from('recuperaciones').insert({
      id: existente, studio_id: studio.studioId, socio_id: socia, motivo: 'test', caduca_el: caduca(),
    });
    assert.ok(!errAlta, errAlta?.message);

    const insertar = await studio.comoPropietaria.from('recuperaciones').insert({
      id: idUnico('rec'), studio_id: studio.studioId, socio_id: socia, motivo: 'a mano', caduca_el: caduca(400),
    });
    assert.ok(insertar.error, 'la propietaria pudo insertar una recuperación saltándose el tope y la caducidad');

    const editar = await studio.comoPropietaria.from('recuperaciones').update({ caduca_el: caduca(900) }).eq('id', existente).select('id');
    assert.ok(editar.error || (editar.data ?? []).length === 0, 'la propietaria pudo editar una recuperación');
    const borrar = await studio.comoPropietaria.from('recuperaciones').delete().eq('id', existente).select('id');
    assert.ok(borrar.error || (borrar.data ?? []).length === 0, 'la propietaria pudo borrar una recuperación');

    const { data: intacta } = await admin.from('recuperaciones').select('estado, caduca_el').eq('id', existente).single();
    assert.deepEqual(intacta, { estado: 'DISPONIBLE', caduca_el: caduca() }, 'la recuperación cambió por una vía directa');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('lee sus recuperaciones, y las crea y anula por las funciones del servidor', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socia = await crearSocia(admin, studio.studioId);
    const id = idUnico('rec');
    const crear = await studio.comoPropietaria.rpc('crear_recuperacion', {
      p_id: id, p_studio_id: studio.studioId, p_socio_id: socia, p_origen_reserva_id: null, p_motivo: 'por la función', p_caduca_el: caduca(),
    });
    assert.ok(!crear.error, crear.error?.message);
    assert.equal(crear.data, 'CREADA');

    const leer = await studio.comoPropietaria.from('recuperaciones').select('id, estado').eq('id', id);
    assert.ok(!leer.error, leer.error?.message);
    assert.deepEqual(leer.data, [{ id, estado: 'DISPONIBLE' }], 'la propietaria no lee sus recuperaciones');

    const anular = await studio.comoPropietaria.rpc('anular_recuperacion', { p_id: id, p_studio_id: studio.studioId });
    assert.ok(!anular.error, anular.error?.message);
    assert.equal(anular.data, true);

    const { data: descuadres } = await admin.from('ledger_conciliacion').select('*').eq('studio_id', studio.studioId);
    assert.deepEqual(descuadres, [], 'el ledger no cuadra tras crear y anular');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
