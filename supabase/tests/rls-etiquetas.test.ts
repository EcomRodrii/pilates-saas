// Etiquetas de alumnas (migración 20261110120000): un catálogo por estudio y dos RPC que tocan a TODAS las alumnas.
//
//  · el catálogo es del estudio: otro estudio no lo ve ni lo toca;
//  · lo lee y lo escribe quien gestiona clientas (propietaria, gerencia, recepción), no una instructora;
//  · dos etiquetas del mismo estudio no se distinguen por mayúsculas, y el color es uno de los ocho;
//  · el nombre NO se cambia con un UPDATE: arrastraría a las alumnas, y eso es la RPC `etiqueta_renombrar`;
//  · renombrar sustituye en todas las fichas del estudio sin duplicar, y fundir con otra existente deja una sola;
//  · eliminar quita la etiqueta del catálogo y de todas las fichas;
//  · NADA de lo anterior cruza de estudio.
//
// Contra Postgres de verdad (job `calidad-rls`), como el resto de supabase/tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearInstructora, crearSocia, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

async function conTags(studioId: string, tags: string[]) {
  const id = await crearSocia(admin, studioId);
  const { error } = await admin.from('socios').update({ tags }).eq('id', id);
  assert.ok(!error, error?.message);
  return id;
}
async function tagsDe(id: string): Promise<string[]> {
  const { data, error } = await admin.from('socios').select('tags').eq('id', id).single();
  assert.ok(!error, error?.message);
  return (data as { tags: string[] }).tags;
}

test('la propietaria crea etiquetas; no se repiten sin distinguir mayúsculas y el color es uno de los ocho', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const ok = await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'VIP', color: 'rosa' });
    assert.ok(!ok.error, ok.error?.message);
    const repetida = await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'vip', color: 'azul' });
    assert.equal(repetida.error?.code, '23505', 'VIP y vip son la misma');
    const color = await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'Otra', color: 'fucsia' });
    assert.ok(color.error, 'el color tiene que ser uno de los ocho');
    const conEspacios = await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: ' Con espacios ', color: 'gris' });
    assert.ok(conEspacios.error, 'el nombre se guarda ya recortado');
    const larga = await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'x'.repeat(31), color: 'gris' });
    assert.ok(larga.error, 'hasta 30 caracteres');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el color se cambia con un UPDATE; el nombre no (renombrar es la RPC)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { data } = await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'VIP', color: 'rosa' }).select('id').single();
    const id = (data as { id: string }).id;
    const color = await studio.comoPropietaria.from('etiquetas').update({ color: 'verde' }).eq('id', id);
    assert.ok(!color.error, color.error?.message);
    const nombre = await studio.comoPropietaria.from('etiquetas').update({ nombre: 'Hack' }).eq('id', id);
    assert.ok(nombre.error, 'cambiar el nombre a pelo dejaría a las alumnas con la etiqueta vieja');
    const { data: fila } = await admin.from('etiquetas').select('nombre, color').eq('id', id).single();
    assert.deepEqual(fila, { nombre: 'VIP', color: 'verde' });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('renombrar sustituye en todas las fichas del estudio, sin duplicar, y funde con una que ya existe', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await studio.comoPropietaria.from('etiquetas').insert([
      { studio_id: studio.studioId, nombre: 'VIP', color: 'rosa' },
      { studio_id: studio.studioId, nombre: 'Lesión', color: 'rojo' },
    ]);
    const s1 = await conTags(studio.studioId, ['VIP', 'Lesión', 'vip']);
    const s2 = await conTags(studio.studioId, ['Vip']);
    const s3 = await conTags(studio.studioId, ['Online']);

    const simple = await studio.comoPropietaria.rpc('etiqueta_renombrar', { p_viejo: 'Lesión', p_nuevo: 'Dolor' });
    assert.ok(!simple.error, simple.error?.message);
    assert.equal(simple.data, 1, 'solo la tenía una alumna');
    assert.deepEqual(await tagsDe(s1), ['VIP', 'Dolor', 'vip']);
    const { data: cat } = await admin.from('etiquetas').select('nombre').eq('studio_id', studio.studioId).order('nombre');
    assert.deepEqual((cat ?? []).map(c => (c as { nombre: string }).nombre), ['Dolor', 'VIP']);

    // Juntar «Vip» con «VIP» (que ya está en el catálogo): manda la grafía del catálogo y no queda ninguna repetida.
    const fusion = await studio.comoPropietaria.rpc('etiqueta_renombrar', { p_viejo: 'Vip', p_nuevo: 'VIP' });
    assert.ok(!fusion.error, fusion.error?.message);
    assert.deepEqual(await tagsDe(s1), ['VIP', 'Dolor']);
    assert.deepEqual(await tagsDe(s2), ['VIP']);
    assert.deepEqual(await tagsDe(s3), ['Online'], 'una alumna sin la etiqueta no se toca');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('eliminar la quita del catálogo y de todas las fichas, sin distinguir mayúsculas', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'Online', color: 'azul' });
    const s1 = await conTags(studio.studioId, ['Online', 'VIP']);
    const s2 = await conTags(studio.studioId, ['online']);
    const s3 = await conTags(studio.studioId, ['VIP']);
    const r = await studio.comoPropietaria.rpc('etiqueta_eliminar', { p_nombre: 'ONLINE' });
    assert.ok(!r.error, r.error?.message);
    assert.equal(r.data, 2);
    assert.deepEqual(await tagsDe(s1), ['VIP']);
    assert.deepEqual(await tagsDe(s2), []);
    assert.deepEqual(await tagsDe(s3), ['VIP']);
    const { data: cat } = await admin.from('etiquetas').select('id').eq('studio_id', studio.studioId);
    assert.deepEqual(cat, []);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('nada cruza de estudio: ni se ve, ni se renombra, ni se elimina lo de otro', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  try {
    await b.comoPropietaria.from('etiquetas').insert({ studio_id: b.studioId, nombre: 'VIP', color: 'rosa' });
    const sb = await conTags(b.studioId, ['VIP']);

    const ve = await a.comoPropietaria.from('etiquetas').select('id').eq('studio_id', b.studioId);
    assert.deepEqual(ve.data ?? [], [], 'el catálogo de otro estudio no se ve');
    const escribe = await a.comoPropietaria.from('etiquetas').insert({ studio_id: b.studioId, nombre: 'Intrusa', color: 'gris' });
    assert.ok(escribe.error, 'no se crea en el catálogo de otro estudio');

    const renombra = await a.comoPropietaria.rpc('etiqueta_renombrar', { p_viejo: 'VIP', p_nuevo: 'Hecho' });
    assert.ok(!renombra.error, renombra.error?.message);
    assert.equal(renombra.data, 0, 'no hay nada que renombrar en SU estudio');
    const elimina = await a.comoPropietaria.rpc('etiqueta_eliminar', { p_nombre: 'VIP' });
    assert.ok(!elimina.error, elimina.error?.message);
    assert.equal(elimina.data, 0);

    assert.deepEqual(await tagsDe(sb), ['VIP']);
    const { data: cat } = await admin.from('etiquetas').select('nombre').eq('studio_id', b.studioId);
    assert.deepEqual(cat, [{ nombre: 'VIP' }]);
  } finally {
    await limpiarFixtures(admin, [a, b]);
  }
});

test('recepción gestiona etiquetas; una instructora, no', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const recepcion = await crearInstructora(admin, studio.studioId, 'RECEPCION');
  const instructora = await crearInstructora(admin, studio.studioId, 'INSTRUCTOR');
  try {
    await studio.comoPropietaria.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'VIP', color: 'rosa' });

    const lee = await recepcion.comoInstructora.from('etiquetas').select('nombre');
    assert.deepEqual((lee.data ?? []).map(e => (e as { nombre: string }).nombre), ['VIP']);
    const crea = await recepcion.comoInstructora.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'Mamás', color: 'verde' });
    assert.ok(!crea.error, crea.error?.message);
    const renombra = await recepcion.comoInstructora.rpc('etiqueta_renombrar', { p_viejo: 'Mamás', p_nuevo: 'Madres' });
    assert.ok(!renombra.error, renombra.error?.message);

    const noLee = await instructora.comoInstructora.from('etiquetas').select('nombre');
    assert.deepEqual(noLee.data ?? [], [], 'una instructora no ve el catálogo');
    const noCrea = await instructora.comoInstructora.from('etiquetas').insert({ studio_id: studio.studioId, nombre: 'Nope', color: 'gris' });
    assert.ok(noCrea.error);
    const noRenombra = await instructora.comoInstructora.rpc('etiqueta_renombrar', { p_viejo: 'VIP', p_nuevo: 'Hack' });
    assert.equal(noRenombra.error?.code, '42501');
    const noElimina = await instructora.comoInstructora.rpc('etiqueta_eliminar', { p_nombre: 'VIP' });
    assert.equal(noElimina.error?.code, '42501');
    const { data: sigue } = await admin.from('etiquetas').select('nombre').eq('studio_id', studio.studioId).order('nombre');
    assert.deepEqual((sigue ?? []).map(e => (e as { nombre: string }).nombre), ['Madres', 'VIP']);
  } finally {
    await limpiarInstructora(admin, instructora);
    await limpiarInstructora(admin, recepcion);
    await limpiarFixtures(admin, [studio]);
  }
});

test('un nombre vacío o de más de 30 caracteres no se renombra', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const vacio = await studio.comoPropietaria.rpc('etiqueta_renombrar', { p_viejo: 'VIP', p_nuevo: '   ' });
    assert.equal(vacio.error?.code, '22023');
    const largo = await studio.comoPropietaria.rpc('etiqueta_renombrar', { p_viejo: 'VIP', p_nuevo: 'x'.repeat(31) });
    assert.equal(largo.error?.code, '22023');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
