// «No volver a pedir el código en este dispositivo» (migr
// 20261003110108_dispositivos_de_confianza.sql): una sesión `aal1` de quien
// tiene la verificación en dos pasos activada cuenta como verificada SOLO si el
// servidor la apuntó en `sesiones_confiadas` para ESA cuenta, su dispositivo
// no ha caducado y la verificación sigue activada. Contra Postgres de verdad
// (job `calidad-rls`), como el resto de supabase/tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

async function sesionDe(cliente: SupabaseClient): Promise<string> {
  const { data: { session } } = await cliente.auth.getSession();
  assert.ok(session, 'el fixture no tiene sesión');
  const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()) as { session_id?: string; aal?: string };
  assert.equal(payload.aal, 'aal1', 'el fixture debería entrar solo con contraseña');
  assert.ok(payload.session_id, 'el JWT de Supabase lleva session_id');
  return payload.session_id;
}

async function activarFactor(userId: string): Promise<string> {
  const id = randomUUID();
  await sql`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
            values (${id}, ${userId}, 'Tentare', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP')`;
  return id;
}

/** `minutos`: dentro de cuánto caduca (negativo = ya caducado). */
async function dispositivo(userId: string, minutos = 30 * 24 * 60): Promise<string> {
  const [d] = await sql<{ id: string }[]>`
    insert into public.dispositivos_confianza (auth_user_id, token_hash, nombre, caduca_en)
    values (${userId}, ${randomUUID()}, 'Test', now() + make_interval(mins => ${minutos}::int)) returning id`;
  return d.id;
}

async function confiar(sesion: string, userId: string, disp: string) {
  await sql`insert into public.sesiones_confiadas (session_id, auth_user_id, dispositivo_id) values (${sesion}, ${userId}, ${disp})`;
}

async function estudioQueVe(cliente: SupabaseClient): Promise<string | null> {
  const { data } = await cliente.rpc('current_studio_id');
  return (data as string | null) ?? null;
}

test('sesión aal1 con la verificación activada: sin confiar no ve nada; confiada, ve y escribe como siempre', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    await activarFactor(studio.authUserId);
    assert.equal(await estudioQueVe(studio.comoPropietaria), null, 'sin confiar no debería resolver su estudio');

    const disp = await dispositivo(studio.authUserId);
    await confiar(sesion, studio.authUserId, disp);

    assert.equal(await estudioQueVe(studio.comoPropietaria), studio.studioId, 'confiada debería resolver su estudio');
    const lectura = await studio.comoPropietaria.from('studios').select('id').eq('id', studio.studioId);
    assert.equal(lectura.data?.length, 1, `confiada debería ver su estudio: ${lectura.error?.message}`);
    const sala = await studio.comoPropietaria.from('salas').insert({ id: `sala-${randomUUID()}`, studio_id: studio.studioId, nombre: 'Confiada', capacidad: 1 });
    assert.ok(!sala.error, `confiada debería poder escribir: ${sala.error?.message}`);

    // Quitar el dispositivo borra su sesión en cascada: vuelve a no ver nada.
    await sql`delete from public.dispositivos_confianza where id = ${disp}`;
    assert.equal(await estudioQueVe(studio.comoPropietaria), null, 'quitado el dispositivo, la sesión vuelve a necesitar el código');
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await admin.from('salas').delete().eq('studio_id', studio.studioId);
    await limpiarFixtures(admin, [studio]);
  }
});

test('confiar OTRA sesión, o la suya a nombre de otra cuenta, no abre nada', async () => {
  const ana = await crearStudioConPropietaria(admin);
  const bea = await crearStudioConPropietaria(admin);
  try {
    const sesionAna = await sesionDe(ana.comoPropietaria);
    const sesionBea = await sesionDe(bea.comoPropietaria);
    await activarFactor(ana.authUserId);

    // Otra sesión (la de Bea) apuntada a nombre de Ana: no vale para la de Ana.
    const dispAna = await dispositivo(ana.authUserId);
    await confiar(sesionBea, ana.authUserId, dispAna);
    assert.equal(await estudioQueVe(ana.comoPropietaria), null, 'otra sesión confiada no vale para esta');

    // La sesión de Ana apuntada a nombre de Bea: tampoco.
    const dispBea = await dispositivo(bea.authUserId);
    await sql`delete from public.sesiones_confiadas where session_id = ${sesionBea}`;
    await confiar(sesionAna, bea.authUserId, dispBea);
    assert.equal(await estudioQueVe(ana.comoPropietaria), null, 'la confianza de otra cuenta no vale');

    // Y la base de datos no deja mezclar la cuenta de la sesión con la del dispositivo.
    await assert.rejects(confiar(sesionBea, bea.authUserId, dispAna), /foreign key|violates/i);
  } finally {
    await sql`delete from auth.mfa_factors where user_id in (${ana.authUserId}, ${bea.authUserId})`;
    await limpiarFixtures(admin, [ana, bea]);
  }
});

test('con el dispositivo caducado, o sin la verificación activada, la sesión confiada deja de contar', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    const factor = await activarFactor(studio.authUserId);
    const caducado = await dispositivo(studio.authUserId, -1);
    await confiar(sesion, studio.authUserId, caducado);
    assert.equal(await estudioQueVe(studio.comoPropietaria), null, 'un dispositivo caducado no da acceso');

    await sql`update public.dispositivos_confianza set caduca_en = now() + interval '30 days' where id = ${caducado}`;
    assert.equal(await estudioQueVe(studio.comoPropietaria), studio.studioId, 'alargado, vuelve a valer');

    // Quitar el factor verificado olvida sus dispositivos (trigger) y sus sesiones.
    await sql`delete from auth.mfa_factors where id = ${factor}`;
    const [c] = await sql<{ n: number }[]>`select count(*)::int as n from public.dispositivos_confianza where auth_user_id = ${studio.authUserId}`;
    assert.equal(c.n, 0, 'quitar el factor olvida los dispositivos');
    const [s] = await sql<{ n: number }[]>`select count(*)::int as n from public.sesiones_confiadas where auth_user_id = ${studio.authUserId}`;
    assert.equal(s.n, 0);
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('el navegador no lee ni escribe las tablas, ni pregunta por la confianza directamente', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const lectura = await studio.comoPropietaria.from('dispositivos_confianza').select('id');
    assert.ok(lectura.error || (lectura.data ?? []).length === 0, 'no debería leer dispositivos_confianza');
    const escritura = await studio.comoPropietaria.from('sesiones_confiadas').insert({
      session_id: await sesionDe(studio.comoPropietaria), auth_user_id: studio.authUserId, dispositivo_id: randomUUID(),
    });
    assert.ok(escritura.error, 'no debería poder apuntarse una sesión como confiada');
    const rpc = await studio.comoPropietaria.rpc('sesion_confiada_de', { p_usuario: studio.authUserId, p_sesion: randomUUID() });
    assert.ok(rpc.error, 'la pregunta del servidor no la puede hacer el navegador');
    const [p] = await sql<{ anon: boolean; auth: boolean; anonDe: boolean; authDe: boolean; tabla: boolean }[]>`
      select has_function_privilege('anon', 'public.sesion_de_confianza()', 'EXECUTE') as anon,
             has_function_privilege('authenticated', 'public.sesion_de_confianza()', 'EXECUTE') as auth,
             has_function_privilege('anon', 'public.sesion_confiada_de(uuid, uuid)', 'EXECUTE') as "anonDe",
             has_function_privilege('authenticated', 'public.sesion_confiada_de(uuid, uuid)', 'EXECUTE') as "authDe",
             has_table_privilege('authenticated', 'public.sesiones_confiadas', 'INSERT') as tabla`;
    assert.deepEqual(p, { anon: false, auth: false, anonDe: false, authDe: false, tabla: false });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el servidor pregunta lo mismo que la base de datos (sesion_confiada_de)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    await activarFactor(studio.authUserId);
    const disp = await dispositivo(studio.authUserId);
    const antes = await admin.rpc('sesion_confiada_de', { p_usuario: studio.authUserId, p_sesion: sesion });
    assert.equal(antes.data, false, JSON.stringify(antes));
    await confiar(sesion, studio.authUserId, disp);
    const despues = await admin.rpc('sesion_confiada_de', { p_usuario: studio.authUserId, p_sesion: sesion });
    assert.equal(despues.data, true, JSON.stringify(despues));
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('cambiar la contraseña olvida los dispositivos de esa cuenta (y sus sesiones confiadas)', async () => {
  const ana = await crearStudioConPropietaria(admin);
  const bea = await crearStudioConPropietaria(admin);
  try {
    const sesionAna = await sesionDe(ana.comoPropietaria);
    const dispAna = await dispositivo(ana.authUserId);
    await dispositivo(bea.authUserId);
    await confiar(sesionAna, ana.authUserId, dispAna);

    const { error } = await admin.auth.admin.updateUserById(ana.authUserId, { password: 'otra-contrasena-rls-5678' });
    assert.ok(!error, error?.message);

    const [c] = await sql<{ ana: number; bea: number; sesiones: number }[]>`
      select (select count(*)::int from public.dispositivos_confianza where auth_user_id = ${ana.authUserId}) as ana,
             (select count(*)::int from public.dispositivos_confianza where auth_user_id = ${bea.authUserId}) as bea,
             (select count(*)::int from public.sesiones_confiadas where auth_user_id = ${ana.authUserId}) as sesiones`;
    assert.deepEqual(c, { ana: 0, bea: 1, sesiones: 0 });
  } finally {
    await limpiarFixtures(admin, [ana, bea]);
  }
});

test.after(async () => { await sql.end(); });
