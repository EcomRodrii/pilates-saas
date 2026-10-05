// Quien escribe un mensaje ya ha leído hasta su propio mensaje (migr
// 20261005100000_mensajes_quien_escribe_ya_lo_ha_leido.sql). Sin eso, el correo
// resumen («Tienes 1 conversación con mensajes nuevos por leer») le llegaba a la
// alumna por SU mensaje, y el mostrador seguía «sin leer» después de contestar.
// Contra Postgres de verdad (job `calidad-rls`), como el resto de supabase/tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clienteAdminLocal, crearInstructora, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

/** Una alumna CON cuenta: hace falta para que tenga fila de participante y marca de lectura. */
async function alumnaConCuenta(cliente: SupabaseClient, studioId: string): Promise<{ socioId: string; authUserId: string }> {
  const email = `alumna-${randomUUID()}@rls-test.invalid`;
  const { data, error } = await cliente.auth.admin.createUser({ email, password: 'rls-test-password-1234', email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear la alumna de fixture: ${error?.message ?? 'sin usuario'}`);
  const socioId = `socio-${randomUUID()}`;
  await sql`insert into public.socios (id, studio_id, nombre, apellidos, email, auth_user_id)
            values (${socioId}, ${studioId}, 'Lucía', 'Martínez', ${email}, ${data.user.id})`;
  return { socioId, authUserId: data.user.id };
}

async function conversacion(studioId: string, tipo: 'ALUMNA_MOSTRADOR' | 'ALUMNA_INSTRUCTORA'): Promise<string> {
  const id = `conv-${randomUUID()}`;
  await sql`insert into public.conversaciones (id, studio_id, tipo) values (${id}, ${studioId}, ${tipo})`;
  return id;
}

async function participante(conversacionId: string, authUserId: string, rol: 'SOCIO' | 'STAFF', socioId: string | null = null) {
  await sql`insert into public.conversacion_participantes (conversacion_id, auth_user_id, rol_en_conversacion, socio_id)
            values (${conversacionId}, ${authUserId}, ${rol}, ${socioId})`;
}

/** Devuelve el id del mensaje. Las horas se comparan en SQL: microsegundos incluidos. */
async function escribir(conversacionId: string, studioId: string, remitente: string): Promise<string> {
  const id = `msg-${randomUUID()}`;
  await sql`insert into public.mensajes (id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo)
            values (${id}, ${conversacionId}, ${studioId}, ${remitente}, 'Hola')`;
  return id;
}

/** ¿La marca de esta persona en el hilo está justo en ese mensaje? */
async function marcaEnMensaje(conversacionId: string, authUserId: string, mensajeId: string): Promise<boolean> {
  const [f] = await sql<{ igual: boolean }[]>`
    select cp.leido_hasta = m.creado_en as igual
      from public.conversacion_participantes cp, public.mensajes m
     where cp.conversacion_id = ${conversacionId} and cp.auth_user_id = ${authUserId} and m.id = ${mensajeId}`;
  return f.igual;
}

async function nuncaLeido(conversacionId: string, authUserId: string): Promise<boolean> {
  const [f] = await sql<{ nunca: boolean }[]>`
    select leido_hasta = '-infinity'::timestamptz as nunca from public.conversacion_participantes
     where conversacion_id = ${conversacionId} and auth_user_id = ${authUserId}`;
  return f.nunca;
}

/** ¿La marca del mostrador está justo en ese mensaje? `null` si no tiene marca. */
async function mostradorEnMensaje(conversacionId: string, mensajeId: string): Promise<boolean | null> {
  const [f] = await sql<{ igual: boolean | null }[]>`
    select c.mostrador_leido_hasta = m.creado_en as igual
      from public.conversaciones c, public.mensajes m
     where c.id = ${conversacionId} and m.id = ${mensajeId}`;
  return f.igual;
}

async function enElResumen(authUserId: string, studioId: string): Promise<boolean> {
  const filas = await sql<{ auth_user_id: string; studio_id: string }[]>`select * from public.mensajes_no_leidos_para_digest()`;
  return filas.some((f) => f.auth_user_id === authUserId && f.studio_id === studioId);
}

test('la alumna escribe al estudio: su marca llega a su mensaje y el resumen no se lo cuenta', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const alumna = await alumnaConCuenta(admin, studio.studioId);
  try {
    const conv = await conversacion(studio.studioId, 'ALUMNA_MOSTRADOR');
    await participante(conv, alumna.authUserId, 'SOCIO', alumna.socioId);
    assert.equal(await nuncaLeido(conv, alumna.authUserId), true, 'el fixture nace sin leer');

    const enviado = await escribir(conv, studio.studioId, alumna.authUserId);

    assert.equal(await marcaEnMensaje(conv, alumna.authUserId, enviado), true, 'su marca sube hasta su mensaje');
    assert.equal(await enElResumen(alumna.authUserId, studio.studioId), false, 'su propio mensaje no le manda el correo resumen');
    // Escribe la alumna, no el mostrador: el mostrador sigue sin haberlo leído.
    assert.equal(await mostradorEnMensaje(conv, enviado), null);
  } finally {
    await limpiarFixtures(admin, [studio]);
    await admin.auth.admin.deleteUser(alumna.authUserId).catch(() => {});
  }
});

test('recepción contesta en el mostrador: la marca del mostrador avanza hasta su respuesta', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const alumna = await alumnaConCuenta(admin, studio.studioId);
  const recepcion = await crearInstructora(admin, studio.studioId, 'RECEPCION');
  try {
    const conv = await conversacion(studio.studioId, 'ALUMNA_MOSTRADOR');
    await participante(conv, alumna.authUserId, 'SOCIO', alumna.socioId);
    await escribir(conv, studio.studioId, alumna.authUserId);

    const respuesta = await escribir(conv, studio.studioId, recepcion.authUserId);

    assert.equal(await mostradorEnMensaje(conv, respuesta), true, 'contestar cuenta como leer el mostrador, hasta la respuesta');
    // Y a la alumna SÍ le queda algo por leer: la respuesta.
    assert.equal(await enElResumen(alumna.authUserId, studio.studioId), true);
  } finally {
    await limpiarInstructora(admin, recepcion);
    await limpiarFixtures(admin, [studio]);
    await admin.auth.admin.deleteUser(alumna.authUserId).catch(() => {});
  }
});

test('escribe la instructora: la alumna SÍ sale en el resumen y la instructora no', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const alumna = await alumnaConCuenta(admin, studio.studioId);
  const instructora = await crearInstructora(admin, studio.studioId);
  try {
    const conv = await conversacion(studio.studioId, 'ALUMNA_INSTRUCTORA');
    await participante(conv, alumna.authUserId, 'SOCIO', alumna.socioId);
    await participante(conv, instructora.authUserId, 'STAFF');

    await escribir(conv, studio.studioId, instructora.authUserId);

    assert.equal(await enElResumen(alumna.authUserId, studio.studioId), true, 'la alumna tiene un mensaje sin leer');
    assert.equal(await enElResumen(instructora.authUserId, studio.studioId), false, 'la instructora no, era suyo');
    assert.equal(await nuncaLeido(conv, alumna.authUserId), true, 'la marca de la otra parte no se toca');
  } finally {
    await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [studio]);
    await admin.auth.admin.deleteUser(alumna.authUserId).catch(() => {});
  }
});

test.after(async () => { await sql.end(); });
