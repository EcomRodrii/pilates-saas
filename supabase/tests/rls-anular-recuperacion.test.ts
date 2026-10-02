// Motor de derechos: anular una recuperación por el servidor (migración 20261002144936, fase A).
//
//  · `anular_recuperacion` anula una recuperación DISPONIBLE del estudio; no una ya usada, ni una ya anulada;
//  · la anulación queda en el ledger con nombre propio (ANULACION_RECUPERACION, no «caducidad»);
//  · solo quien gestiona clientas, y solo en su estudio.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearInstructora, crearSocia, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-anu-${process.pid}-${Date.now()}-${contador++}`;
const caduca = () => new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);

async function montarRecuperacion(studioId: string, socioId: string, usadaEn: string | null = null) {
  const id = idUnico('rec');
  const { error } = await admin.from('recuperaciones').insert({
    id, studio_id: studioId, socio_id: socioId, motivo: 'test', caduca_el: caduca(),
    ...(usadaEn ? { estado: 'USADA', usada_en_reserva_id: usadaEn } : {}),
  });
  assert.ok(!error, error?.message);
  return id;
}

async function estadoDe(id: string) {
  const { data } = await admin.from('recuperaciones').select('estado').eq('id', id).single();
  return (data as { estado: string }).estado;
}

test('la propietaria anula una recuperación disponible, una sola vez, y el ledger la nombra', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socia = await crearSocia(admin, studio.studioId);
    const id = await montarRecuperacion(studio.studioId, socia);

    const primera = await studio.comoPropietaria.rpc('anular_recuperacion', { p_id: id, p_studio_id: studio.studioId });
    assert.ok(!primera.error, primera.error?.message);
    assert.equal(primera.data, true);
    assert.equal(await estadoDe(id), 'ANULADA');

    const segunda = await studio.comoPropietaria.rpc('anular_recuperacion', { p_id: id, p_studio_id: studio.studioId });
    assert.ok(!segunda.error, segunda.error?.message);
    assert.equal(segunda.data, false, 'ya estaba anulada: no hay nada que hacer');

    const { data: movs } = await admin.from('movimientos_derecho').select('tipo, delta').eq('derecho_id', id).order('creado_en', { ascending: true });
    assert.deepEqual((movs ?? []).map(m => [(m as { tipo: string }).tipo, (m as { delta: number }).delta]), [
      ['CONCESION_RECUPERACION', 1], ['ANULACION_RECUPERACION', -1],
    ]);
    const { data: descuadres } = await admin.from('ledger_conciliacion').select('*').eq('studio_id', studio.studioId);
    assert.deepEqual(descuadres, []);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('una recuperación YA USADA no se anula: está ligada a su reserva', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socia = await crearSocia(admin, studio.studioId);
    const id = await montarRecuperacion(studio.studioId, socia, idUnico('res'));
    const r = await studio.comoPropietaria.rpc('anular_recuperacion', { p_id: id, p_studio_id: studio.studioId });
    assert.ok(!r.error, r.error?.message);
    assert.equal(r.data, false);
    assert.equal(await estadoDe(id), 'USADA');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('solo en su estudio, y solo quien gestiona clientas (no una instructora)', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    const socia = await crearSocia(admin, a.studioId);
    const id = await montarRecuperacion(a.studioId, socia);

    // La propietaria del estudio B no toca lo del A, ni diciendo que el estudio es el A.
    const otroEstudio = await b.comoPropietaria.rpc('anular_recuperacion', { p_id: id, p_studio_id: a.studioId });
    assert.ok(otroEstudio.error, 'la propietaria de otro estudio pudo anular');
    const conSuEstudio = await b.comoPropietaria.rpc('anular_recuperacion', { p_id: id, p_studio_id: b.studioId });
    assert.equal(conSuEstudio.data, false, 'con su propio estudio no encuentra la recuperación ajena');

    // Una instructora del estudio A tampoco.
    instructora = await crearInstructora(admin, a.studioId);
    const comoInstructora = await instructora.comoInstructora.rpc('anular_recuperacion', { p_id: id, p_studio_id: a.studioId });
    assert.ok(comoInstructora.error, 'una instructora pudo anular una recuperación');
    assert.equal(await estadoDe(id), 'DISPONIBLE', 'nada se ha anulado');
  } finally {
    if (instructora) await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [a, b]);
  }
});
