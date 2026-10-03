// El segundo paso por correo (migr 20261003160000_doble_factor_por_correo.sql):
// verificar el código deja la sesión en `aal1` y la apunta en
// `sesiones_confiadas` con origen 'correo'; `sesion_confiada_de` la acepta y,
// con ella, todas las políticas. Contra Postgres de verdad (job `calidad-rls`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

async function sesionDe(cliente: SupabaseClient): Promise<string> {
  const { data: { session } } = await cliente.auth.getSession();
  assert.ok(session, 'el fixture no tiene sesión');
  const payload = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString()) as { session_id?: string };
  assert.ok(payload.session_id);
  return payload.session_id;
}

async function activarFactor(userId: string): Promise<string> {
  const id = randomUUID();
  await sql`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
            values (${id}, ${userId}, 'Tentare', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP')`;
  return id;
}

async function estudioQueVe(cliente: SupabaseClient): Promise<string | null> {
  const { data } = await cliente.rpc('current_studio_id');
  return (data as string | null) ?? null;
}

async function disponible(userId: string, sesion: string): Promise<string | null> {
  const { data, error } = await admin.rpc('correo_doble_factor_disponible', { p_usuario: userId, p_sesion: sesion });
  assert.ok(!error, error?.message);
  return data as string | null;
}

const hash = (texto: string) => createHmac('sha256', 'prueba').update(texto).digest('hex');

async function guardarCodigo(userId: string, sesion: string, h: string, minutos = 10) {
  await sql`insert into public.codigos_correo_doble_factor (session_id, auth_user_id, codigo_hash, caduca_en)
            values (${sesion}, ${userId}, ${h}, now() + make_interval(mins => ${minutos}::int))
            on conflict (session_id) do update set codigo_hash = excluded.codigo_hash, caduca_en = excluded.caduca_en, intentos = 0, usado_en = null`;
}

async function intento(userId: string, sesion: string, max = 5): Promise<{ estado: string; codigo_hash: string | null }> {
  const { data, error } = await admin.rpc('intento_codigo_correo', { p_usuario: userId, p_sesion: sesion, p_max_intentos: max });
  assert.ok(!error, error?.message);
  return (data as { estado: string; codigo_hash: string | null }[])[0];
}

async function confirmar(userId: string, sesion: string, h: string): Promise<boolean> {
  const { data, error } = await admin.rpc('confirmar_codigo_correo', { p_usuario: userId, p_sesion: sesion, p_hash: h });
  assert.ok(!error, error?.message);
  return data === true;
}

test('con contraseña y la verificación activada: el código bueno abre la sesión; uno gastado no repite', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    // Por si el fixture fijó la contraseña con un UPDATE (eso cierra el correo, a propósito).
    await sql`delete from public.doble_factor_correo_bloqueos where auth_user_id = ${studio.authUserId}`;
    assert.equal(await disponible(studio.authUserId, sesion), 'sin_verificacion', 'sin factor no hay segundo paso');
    await activarFactor(studio.authUserId);
    assert.equal(await disponible(studio.authUserId, sesion), null, 'entró con contraseña: el correo sirve');
    assert.equal(await estudioQueVe(studio.comoPropietaria), null, 'sin el segundo paso no ve nada');

    const h = hash('123456');
    await guardarCodigo(studio.authUserId, sesion, h);
    const i = await intento(studio.authUserId, sesion);
    assert.equal(i.estado, 'vivo');
    assert.equal(i.codigo_hash, h);
    assert.equal(await confirmar(studio.authUserId, sesion, hash('000000')), false, 'otro hash no gasta nada');
    assert.equal(await confirmar(studio.authUserId, sesion, h), true);
    assert.equal(await confirmar(studio.authUserId, sesion, h), false, 'un código solo se gasta una vez');

    const [s] = await sql<{ origen: string; dispositivo_id: string | null }[]>`
      select origen, dispositivo_id from public.sesiones_confiadas where session_id = ${sesion}`;
    assert.deepEqual({ ...s }, { origen: 'correo', dispositivo_id: null });
    assert.equal(await estudioQueVe(studio.comoPropietaria), studio.studioId, 'pasado el correo, ve su estudio');
    const lectura = await studio.comoPropietaria.from('studios').select('id').eq('id', studio.studioId);
    assert.equal(lectura.data?.length, 1, lectura.error?.message);
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('intentos: el tope se cuenta en la base de datos, y caducado no vale', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    await sql`delete from public.doble_factor_correo_bloqueos where auth_user_id = ${studio.authUserId}`;
    await activarFactor(studio.authUserId);
    await guardarCodigo(studio.authUserId, sesion, hash('1'));
    for (let n = 0; n < 3; n++) assert.equal((await intento(studio.authUserId, sesion, 3)).estado, 'vivo');
    assert.equal((await intento(studio.authUserId, sesion, 3)).estado, 'agotado');

    await guardarCodigo(studio.authUserId, sesion, hash('2'), -1);
    assert.equal((await intento(studio.authUserId, sesion)).estado, 'caducado');
    assert.equal(await confirmar(studio.authUserId, sesion, hash('2')), false, 'caducado no se gasta');
    assert.equal((await intento(studio.authUserId, randomUUID())).estado, 'no_disponible', 'una sesión que no es suya');
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('el correo no vale si la sesión no entró con contraseña', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    await sql`delete from public.doble_factor_correo_bloqueos where auth_user_id = ${studio.authUserId}`;
    await activarFactor(studio.authUserId);
    // Como si hubiera entrado por un enlace o un código del correo (o con Google).
    for (const metodo of ['otp', 'oauth']) {
      await sql`update auth.mfa_amr_claims set authentication_method = ${metodo} where session_id = ${sesion}`;
      assert.equal(await disponible(studio.authUserId, sesion), 'sin_contrasena', metodo);
    }
    await guardarCodigo(studio.authUserId, sesion, hash('3'));
    assert.equal(await confirmar(studio.authUserId, sesion, hash('3')), false);
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('cambiar la contraseña o el correo cierra el correo hasta pasar la app, y suelta la sesión confiada', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    await sql`delete from public.doble_factor_correo_bloqueos where auth_user_id = ${studio.authUserId}`;
    await activarFactor(studio.authUserId);
    await sql`insert into public.sesiones_confiadas (session_id, auth_user_id, origen) values (${sesion}, ${studio.authUserId}, 'correo')`;
    assert.equal(await estudioQueVe(studio.comoPropietaria), studio.studioId);

    await sql`update auth.users set encrypted_password = '$2a$10$' || md5(random()::text) where id = ${studio.authUserId}`;
    assert.equal(await disponible(studio.authUserId, sesion), 'bloqueado');
    assert.equal(await estudioQueVe(studio.comoPropietaria), null, 'cambiar la contraseña suelta la sesión confiada por correo');

    // Pasar la app de verdad lo reabre (lo hace el servidor con service_role).
    await admin.from('doble_factor_correo_bloqueos').delete().eq('auth_user_id', studio.authUserId);
    assert.equal(await disponible(studio.authUserId, sesion), null);
    await sql`insert into public.dispositivos_confianza (auth_user_id, token_hash, nombre, caduca_en)
              values (${studio.authUserId}, ${randomUUID()}, 'Test', now() + interval '30 days')`;

    await sql`update auth.users set email = ${`otra-${randomUUID()}@example.com`} where id = ${studio.authUserId}`;
    assert.equal(await disponible(studio.authUserId, sesion), 'bloqueado', 'un correo nuevo no vale hasta pasar la app');
    const [d] = await sql<{ n: number }[]>`select count(*)::int as n from public.dispositivos_confianza where auth_user_id = ${studio.authUserId}`;
    assert.equal(d.n, 0, 'cambiar el correo olvida también los navegadores recordados');
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('sin la verificación activada, una sesión confiada por correo no cuenta; quitar el factor la borra', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = await sesionDe(studio.comoPropietaria);
    const factor = await activarFactor(studio.authUserId);
    await sql`insert into public.sesiones_confiadas (session_id, auth_user_id, origen) values (${sesion}, ${studio.authUserId}, 'correo')`;
    await sql`delete from auth.mfa_factors where id = ${factor}`;
    const [s] = await sql<{ n: number }[]>`select count(*)::int as n from public.sesiones_confiadas where auth_user_id = ${studio.authUserId}`;
    assert.equal(s.n, 0, 'quitar el factor borra también las confiadas por correo (no reviven con otro factor)');
    // Y la forma: 'correo' sin dispositivo, 'dispositivo' con él.
    await assert.rejects(sql`insert into public.sesiones_confiadas (session_id, auth_user_id, origen, dispositivo_id) values (${sesion}, ${studio.authUserId}, 'correo', ${randomUUID()})`, /check|violates/i);
    await assert.rejects(sql`insert into public.sesiones_confiadas (session_id, auth_user_id, origen) values (${sesion}, ${studio.authUserId}, 'dispositivo')`, /check|violates/i);
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('el navegador no toca los códigos ni pregunta por ellos', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const lectura = await studio.comoPropietaria.from('codigos_correo_doble_factor').select('session_id');
    assert.ok(lectura.error || (lectura.data ?? []).length === 0);
    const borrar = await studio.comoPropietaria.from('doble_factor_correo_bloqueos').delete().eq('auth_user_id', studio.authUserId);
    assert.ok(borrar.error, 'no puede reabrirse el correo a sí misma');
    for (const [fn, args] of [
      ['correo_doble_factor_disponible', { p_usuario: studio.authUserId, p_sesion: randomUUID() }],
      ['intento_codigo_correo', { p_usuario: studio.authUserId, p_sesion: randomUUID(), p_max_intentos: 99 }],
      ['confirmar_codigo_correo', { p_usuario: studio.authUserId, p_sesion: randomUUID(), p_hash: 'x' }],
    ] as const) {
      const r = await studio.comoPropietaria.rpc(fn, args);
      assert.ok(r.error, `${fn} no la puede llamar el navegador`);
    }
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
