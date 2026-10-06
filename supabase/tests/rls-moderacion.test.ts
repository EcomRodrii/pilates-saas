// Moderación de la app (App Store 1.2) y cierre de la mensajería al navegador
// (migr 20261006013928_chat_y_tablon_solo_por_el_servidor.sql y
// 20261006014051_moderacion_esquema.sql). Contra Postgres de verdad (job
// `calidad-rls`), como el resto de supabase/tests.
//
// Lo que se prueba, en la base de datos y no en la ruta:
//   · ni la alumna ni la instructora ven o escriben su hilo por PostgREST (sus
//     apps van por rutas de servidor); quien da clases y trabaja en el panel sí;
//   · el navegador ya no actualiza ni borra mensajes, ni edita comentarios, ni
//     toca las tablas de moderación;
//   · nadie escribe en un hilo cerrado o bloqueado, ni con service_role, ni
//     rodeando el bloqueo por el hilo del estudio (salvo la dueña);
//   · `resolver_denuncia` decide quién revisa y aplica la decisión una vez.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  clienteAdminLocal, crearInstructora, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora, sqlLocal,
  type InstructoraFixture, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

/** Una alumna CON cuenta y sesión iniciada: su JWT es lo que se prueba. */
async function alumnaConSesion(studioId: string): Promise<{ socioId: string; authUserId: string; cliente: SupabaseClient }> {
  const email = `alumna-${randomUUID()}@rls-test.invalid`;
  const password = 'rls-test-password-1234';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`No se pudo crear la alumna de fixture: ${error?.message ?? 'sin usuario'}`);
  const socioId = `socio-${randomUUID()}`;
  await sql`insert into public.socios (id, studio_id, nombre, apellidos, email, auth_user_id)
            values (${socioId}, ${studioId}, 'Lucía', 'Martínez', ${email}, ${data.user.id})`;
  const cliente = createClient(process.env.SUPABASE_LOCAL_URL!, process.env.SUPABASE_LOCAL_ANON_KEY!, { auth: { persistSession: false } });
  const { error: errLogin } = await cliente.auth.signInWithPassword({ email, password });
  if (errLogin) throw new Error(`No se pudo autenticar la alumna de fixture: ${errLogin.message}`);
  return { socioId, authUserId: data.user.id, cliente };
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

async function escribir(conversacionId: string, studioId: string, remitente: string, cuerpo = 'Hola'): Promise<string> {
  const id = `msg-${randomUUID()}`;
  await sql`insert into public.mensajes (id, conversacion_id, studio_id, remitente_auth_user_id, cuerpo)
            values (${id}, ${conversacionId}, ${studioId}, ${remitente}, ${cuerpo})`;
  return id;
}

/** Escribe como lo hacen las apps: service_role por PostgREST. */
async function escribirComoServidor(conversacionId: string, studioId: string, remitente: string) {
  return admin.from('mensajes').insert({
    id: `msg-${randomUUID()}`, conversacion_id: conversacionId, studio_id: studioId, remitente_auth_user_id: remitente, cuerpo: 'Hola',
  });
}

/** Un hilo instructora–alumna con un mensaje de cada una. */
async function hiloConInstructora(studio: StudioFixture) {
  const alumna = await alumnaConSesion(studio.studioId);
  const instructora = await crearInstructora(admin, studio.studioId);
  const conv = await conversacion(studio.studioId, 'ALUMNA_INSTRUCTORA');
  await participante(conv, alumna.authUserId, 'SOCIO', alumna.socioId);
  await participante(conv, instructora.authUserId, 'STAFF');
  const deLaAlumna = await escribir(conv, studio.studioId, alumna.authUserId, 'Hola, Laura');
  const deLaInstructora = await escribir(conv, studio.studioId, instructora.authUserId, 'Hola, Lucía');
  return { alumna, instructora, conv, deLaAlumna, deLaInstructora };
}

async function limpiar(studio: StudioFixture, instructoras: InstructoraFixture[], cuentas: string[]) {
  for (const i of instructoras) await limpiarInstructora(admin, i);
  await limpiarFixtures(admin, [studio]);
  for (const c of cuentas) await admin.auth.admin.deleteUser(c).catch(() => {});
}

test('1. la alumna, con su JWT, no ve su hilo por PostgREST ni puede escribir en él', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const h = await hiloConInstructora(studio);
  try {
    for (const tabla of ['conversaciones', 'conversacion_participantes', 'mensajes'] as const) {
      const columna = tabla === 'conversaciones' ? 'id' : 'conversacion_id';
      const { data, error } = await h.alumna.cliente.from(tabla).select(columna).eq(columna, h.conv);
      assert.ok(!error, `${tabla}: RLS filtra, no da error: ${error?.message}`);
      assert.deepEqual(data, [], `la alumna ve filas de ${tabla} por PostgREST`);
    }
    const { error } = await h.alumna.cliente.from('mensajes').insert({
      id: `msg-${randomUUID()}`, conversacion_id: h.conv, studio_id: studio.studioId,
      remitente_auth_user_id: h.alumna.authUserId, cuerpo: 'por la API',
    });
    assert.equal(error?.code, '42501', `la alumna escribió en su hilo por PostgREST: ${error?.message}`);
  } finally {
    await limpiar(studio, [h.instructora], [h.alumna.authUserId]);
  }
});

test('2. la instructora tampoco lee su hilo por PostgREST; quien da clases y trabaja en el panel, sí', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const h = await hiloConInstructora(studio);
  // Gerencia que también da clases: es la parte STAFF de un hilo con la alumna.
  const gerente = await crearInstructora(admin, studio.studioId, 'MANAGER');
  try {
    // La instructora va por su app (servidor): por PostgREST vería el bloqueo de
    // la alumna y el texto de lo retirado, que su app no le enseña.
    const { data, error } = await h.instructora.comoInstructora.from('mensajes').select('id').eq('conversacion_id', h.conv);
    assert.ok(!error, error?.message);
    assert.deepEqual(data, [], 'la instructora lee su hilo por PostgREST');
    const bloqueo = await h.instructora.comoInstructora.from('conversacion_participantes').select('bloqueo_en').eq('conversacion_id', h.conv);
    assert.deepEqual(bloqueo.data, [], 'la instructora ve los participantes (y el bloqueo) por PostgREST');

    const suHilo = await conversacion(studio.studioId, 'ALUMNA_INSTRUCTORA');
    await participante(suHilo, h.alumna.authUserId, 'SOCIO', h.alumna.socioId);
    await participante(suHilo, gerente.authUserId, 'STAFF');
    await escribir(suHilo, studio.studioId, gerente.authUserId);
    const delGerente = await gerente.comoInstructora.from('mensajes').select('id').eq('conversacion_id', suHilo);
    assert.equal(delGerente.data?.length, 1, 'quien da clases y trabaja en el panel ha perdido su hilo');
  } finally {
    await limpiar(studio, [h.instructora, gerente], [h.alumna.authUserId]);
  }
});

test('3. UPDATE y DELETE de mensajes desde el navegador: 42501, no «0 filas»', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const h = await hiloConInstructora(studio);
  try {
    const actualizar = await h.instructora.comoInstructora.from('mensajes').update({ cuerpo: 'editado' }).eq('id', h.deLaInstructora);
    assert.equal(actualizar.error?.code, '42501', `UPDATE de mensajes: ${actualizar.error?.message}`);
    const borrar = await h.instructora.comoInstructora.from('mensajes').delete().eq('id', h.deLaInstructora);
    assert.equal(borrar.error?.code, '42501', `DELETE de mensajes: ${borrar.error?.message}`);
    const [m] = await sql<{ cuerpo: string }[]>`select cuerpo from public.mensajes where id = ${h.deLaInstructora}`;
    assert.equal(m.cuerpo, 'Hola, Lucía');
  } finally {
    await limpiar(studio, [h.instructora], [h.alumna.authUserId]);
  }
});

async function postConComentario(studio: StudioFixture, autorId: string): Promise<{ postId: string; comentarioId: string }> {
  const postId = `post-${randomUUID()}`;
  const comentarioId = `com-${randomUUID()}`;
  await sql`insert into public.posts_comunidad (id, studio_id, autor_id, autor_nombre, texto, comentarios_count)
            values (${postId}, ${studio.studioId}, ${studio.authUserId}, 'Estudio', 'Aviso', 1)`;
  await sql`insert into public.comentarios_comunidad (id, studio_id, post_id, autor_id, autor_nombre, texto)
            values (${comentarioId}, ${studio.studioId}, ${postId}, ${autorId}, 'Lucía M.', 'Un comentario')`;
  return { postId, comentarioId };
}

test('4. nadie edita un comentario del tablón desde el navegador, ni la propietaria', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { comentarioId } = await postConComentario(studio, studio.authUserId);
    const { error } = await studio.comoPropietaria.from('comentarios_comunidad').update({ texto: 'otro' }).eq('id', comentarioId);
    assert.equal(error?.code, '42501', `UPDATE de comentarios_comunidad: ${error?.message}`);
    // Leer, sí (control: el «no» de arriba es por el permiso, no por un fixture roto).
    const { data } = await studio.comoPropietaria.from('comentarios_comunidad').select('id').eq('id', comentarioId);
    assert.equal(data?.length, 1);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('4b. el tablón no se escribe desde el navegador: ni comentarios, ni publicaciones, ni «me gusta»', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const alumna = await alumnaConSesion(studio.studioId);
  try {
    const { postId, comentarioId } = await postConComentario(studio, studio.authUserId);
    // Con la ficha de OTRA (la alumna): saldría como suyo y en su exportación.
    const comentar = await studio.comoPropietaria.from('comentarios_comunidad').insert({
      id: `com-${randomUUID()}`, studio_id: studio.studioId, post_id: postId, autor_id: studio.authUserId,
      autor_nombre: 'Lucía M.', texto: 'suplantado', socio_id: alumna.socioId,
    });
    assert.equal(comentar.error?.code, '42501', `INSERT de comentarios: ${comentar.error?.message}`);
    const borrar = await studio.comoPropietaria.from('comentarios_comunidad').delete().eq('id', comentarioId);
    assert.equal(borrar.error?.code, '42501', `DELETE de comentarios: ${borrar.error?.message}`);
    const publicar = await studio.comoPropietaria.from('posts_comunidad').insert({
      id: `post-${randomUUID()}`, studio_id: studio.studioId, autor_id: studio.authUserId, autor_nombre: 'Estudio', texto: 'x',
    });
    assert.equal(publicar.error?.code, '42501', `INSERT de publicaciones: ${publicar.error?.message}`);
    const gustar = await studio.comoPropietaria.from('post_likes').insert({ post_id: postId, user_id: studio.authUserId, studio_id: studio.studioId });
    assert.equal(gustar.error?.code, '42501', `INSERT de «me gusta»: ${gustar.error?.message}`);
    // El «me gusta» del panel sigue funcionando por su RPC.
    const rpc = await studio.comoPropietaria.rpc('toggle_like_post', { p_post_id: postId, p_studio_id: studio.studioId });
    assert.ok(!rpc.error, `toggle_like_post: ${rpc.error?.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
    await admin.auth.admin.deleteUser(alumna.authUserId).catch(() => {});
  }
});

test('5. denuncias y normas aceptadas: ni leer ni escribir desde el navegador', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const leer = await studio.comoPropietaria.from('denuncias').select('id');
    assert.equal(leer.error?.code, '42501', `leer denuncias: ${leer.error?.message}`);
    const escribir = await studio.comoPropietaria.from('denuncias').insert({
      studio_id: studio.studioId, ambito: 'TABLON', destino: 'ESTUDIO', motivo: 'BLOQUEO', comentario_id: null,
    });
    assert.equal(escribir.error?.code, '42501', `insertar denuncias: ${escribir.error?.message}`);
    const normas = await studio.comoPropietaria.from('normas_comunidad_aceptaciones').insert({ auth_user_id: studio.authUserId, version: 'v1' });
    assert.equal(normas.error?.code, '42501', `aceptar normas desde el navegador: ${normas.error?.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('6 y 7. en un hilo cerrado o bloqueado no escribe nadie, tampoco el servidor', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const h = await hiloConInstructora(studio);
  try {
    await sql`update public.conversaciones set cerrada_en = now() where id = ${h.conv}`;
    const cerrada = await escribirComoServidor(h.conv, studio.studioId, h.instructora.authUserId);
    assert.equal(cerrada.error?.code, 'P0001');
    assert.match(cerrada.error?.message ?? '', /CONVERSACION_CERRADA/);

    await sql`update public.conversaciones set cerrada_en = null where id = ${h.conv}`;
    await sql`update public.conversacion_participantes set bloqueo_en = now()
               where conversacion_id = ${h.conv} and rol_en_conversacion = 'SOCIO'`;
    for (const remitente of [h.alumna.authUserId, h.instructora.authUserId]) {
      const bloqueada = await escribirComoServidor(h.conv, studio.studioId, remitente);
      assert.equal(bloqueada.error?.code, 'P0001');
      assert.match(bloqueada.error?.message ?? '', /CONVERSACION_BLOQUEADA/);
    }
  } finally {
    await limpiar(studio, [h.instructora], [h.alumna.authUserId]);
  }
});

test('8. con un bloqueo en su hilo, quien no es la dueña no le escribe por el hilo del estudio; la dueña sí', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const h = await hiloConInstructora(studio);
  // Una copropietaria (PROPIETARIO, no la dueña) que también da clases a esa alumna.
  const copropietaria = await crearInstructora(admin, studio.studioId, 'MANAGER');
  try {
    await sql`update public.instructores set rol = 'PROPIETARIO' where id = ${copropietaria.instructorId}`;
    const suHilo = await conversacion(studio.studioId, 'ALUMNA_INSTRUCTORA');
    await participante(suHilo, h.alumna.authUserId, 'SOCIO', h.alumna.socioId);
    await participante(suHilo, copropietaria.authUserId, 'STAFF');
    await sql`update public.conversacion_participantes set bloqueo_en = now()
               where conversacion_id = ${suHilo} and rol_en_conversacion = 'SOCIO'`;
    const mostrador = await conversacion(studio.studioId, 'ALUMNA_MOSTRADOR');
    await participante(mostrador, h.alumna.authUserId, 'SOCIO', h.alumna.socioId);

    const rodeo = await escribirComoServidor(mostrador, studio.studioId, copropietaria.authUserId);
    assert.match(rodeo.error?.message ?? '', /CONVERSACION_BLOQUEADA/, 'la copropietaria rodeó el bloqueo por el hilo del estudio');
    // La otra instructora, sin bloqueo con ella, sí; la dueña también; y la alumna escribe al estudio.
    for (const remitente of [h.instructora.authUserId, studio.authUserId, h.alumna.authUserId]) {
      const { error } = await escribirComoServidor(mostrador, studio.studioId, remitente);
      assert.ok(!error, `no debería bloquearse: ${error?.message}`);
    }
  } finally {
    await limpiar(studio, [h.instructora, copropietaria], [h.alumna.authUserId]);
  }
});

type Rpc = { data: Record<string, unknown> | null; error: { code?: string; message: string } | null };
const resolver = (id: string, studioId: string, accion: string, revisor: string, por: string) =>
  admin.rpc('resolver_denuncia', { p_denuncia_id: id, p_studio_id: studioId, p_accion: accion, p_revisor: revisor, p_por: por }) as unknown as Promise<Rpc>;

test('9. retirar un comentario denunciado: el contador baja una vez y se cierran las del mismo comentario', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const alumna = await alumnaConSesion(studio.studioId);
  const instructora = await crearInstructora(admin, studio.studioId);
  try {
    const { postId, comentarioId } = await postConComentario(studio, alumna.authUserId);
    const d1 = `den-${randomUUID()}`;
    const d2 = `den-${randomUUID()}`;
    await sql`insert into public.denuncias (id, studio_id, ambito, destino, comentario_id, autor_auth_user_id, denunciante_auth_user_id)
              values (${d1}, ${studio.studioId}, 'TABLON', 'ESTUDIO', ${comentarioId}, ${alumna.authUserId}, ${instructora.authUserId}),
                     (${d2}, ${studio.studioId}, 'TABLON', 'ESTUDIO', ${comentarioId}, ${alumna.authUserId}, ${studio.authUserId})`;

    const r = await resolver(d1, studio.studioId, 'OCULTAR', 'ESTUDIO', studio.authUserId);
    assert.ok(!r.error, r.error?.message);
    assert.equal(r.data?.resultado, 'CONTENIDO_OCULTO');
    assert.equal((r.data?.cerradas as unknown[]).length, 2);
    const [post] = await sql<{ comentarios_count: number }[]>`select comentarios_count from public.posts_comunidad where id = ${postId}`;
    assert.equal(post.comentarios_count, 0, 'el contador baja UNA vez');
    const [c] = await sql<{ oculto: boolean }[]>`select oculto_en is not null as oculto from public.comentarios_comunidad where id = ${comentarioId}`;
    assert.equal(c.oculto, true);
    const pendientes = await sql`select 1 from public.denuncias where comentario_id = ${comentarioId} and estado = 'PENDIENTE'`;
    assert.equal(pendientes.length, 0);

    const otraVez = await resolver(d1, studio.studioId, 'OCULTAR', 'ESTUDIO', studio.authUserId);
    assert.match(otraVez.error?.message ?? '', /DENUNCIA_YA_RESUELTA/);
  } finally {
    await limpiar(studio, [instructora], [alumna.authUserId]);
  }
});

const ocultar = (comentarioId: string, studioId: string, ocultarlo: boolean, por: string, revisor: string) =>
  admin.rpc('ocultar_comentario_comunidad', {
    p_comentario_id: comentarioId, p_studio_id: studioId, p_ocultar: ocultarlo, p_por: por, p_revisor: revisor,
  }) as unknown as Promise<Rpc>;

test('9b. retirar desde el estudio: nunca la autora, solo cierra lo suyo y no deshace lo que retiró Tentare', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const alumna = await alumnaConSesion(studio.studioId);
  // Hace de persona de Tentare: `oculto_por` y `resuelta_por` apuntan a auth.users.
  const tentare = await crearInstructora(admin, studio.studioId);
  try {
    const { comentarioId } = await postConComentario(studio, alumna.authUserId);
    const delEstudio = `den-${randomUUID()}`;
    const deTentare = `den-${randomUUID()}`;
    await sql`insert into public.denuncias (id, studio_id, ambito, destino, comentario_id, autor_auth_user_id, denunciante_auth_user_id)
              values (${delEstudio}, ${studio.studioId}, 'TABLON', 'ESTUDIO', ${comentarioId}, ${alumna.authUserId}, ${tentare.authUserId}),
                     (${deTentare}, ${studio.studioId}, 'TABLON', 'TENTARE', ${comentarioId}, ${alumna.authUserId}, ${studio.authUserId})`;

    const laAutora = await ocultar(comentarioId, studio.studioId, true, alumna.authUserId, 'ESTUDIO');
    assert.match(laAutora.error?.message ?? '', /ES_AUTORA/);

    const estudio = await ocultar(comentarioId, studio.studioId, true, studio.authUserId, 'ESTUDIO');
    assert.ok(!estudio.error, estudio.error?.message);
    assert.equal((estudio.data?.cerradas as unknown[]).length, 1, 'solo la que le toca al estudio');
    const [pendiente] = await sql<{ estado: string }[]>`select estado from public.denuncias where id = ${deTentare}`;
    assert.equal(pendiente.estado, 'PENDIENTE');

    assert.ok(!(await ocultar(comentarioId, studio.studioId, false, studio.authUserId, 'ESTUDIO')).error);
    assert.ok(!(await ocultar(comentarioId, studio.studioId, true, tentare.authUserId, 'TENTARE')).error);
    const deshacer = await ocultar(comentarioId, studio.studioId, false, studio.authUserId, 'ESTUDIO');
    assert.match(deshacer.error?.message ?? '', /RETIRADO_POR_TENTARE/);
  } finally {
    await limpiar(studio, [tentare], [alumna.authUserId]);
  }
});

test('10 y 11. quién resuelve: cada cual lo suyo, Tentare lo del estudio a las 24 h, y nunca quien escribió lo denunciado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const h = await hiloConInstructora(studio);
  // Quien revisa en Tentare tiene cuenta (`resuelta_por` apunta a auth.users).
  const { data: deTentareUsuario, error: errTentare } = await admin.auth.admin.createUser({
    email: `tentare-${randomUUID()}@rls-test.invalid`, password: 'rls-test-password-1234', email_confirm: true,
  });
  if (errTentare || !deTentareUsuario.user) throw new Error(`No se pudo crear la cuenta de Tentare: ${errTentare?.message}`);
  const tentare = deTentareUsuario.user.id;
  try {
    const deTentare = `den-${randomUUID()}`;
    const vieja = `den-${randomUUID()}`;
    const reciente = `den-${randomUUID()}`;
    await sql`insert into public.denuncias (id, studio_id, ambito, destino, conversacion_id, mensaje_id, autor_auth_user_id, denunciante_auth_user_id, creada_en)
              values (${deTentare}, ${studio.studioId}, 'CHAT_INSTRUCTORA', 'TENTARE', ${h.conv}, ${h.deLaInstructora}, ${h.instructora.authUserId}, ${h.alumna.authUserId}, now()),
                     (${vieja}, ${studio.studioId}, 'CHAT_INSTRUCTORA', 'ESTUDIO', ${h.conv}, ${h.deLaAlumna}, ${h.alumna.authUserId}, ${h.instructora.authUserId}, now() - interval '25 hours'),
                     (${reciente}, ${studio.studioId}, 'CHAT_INSTRUCTORA', 'ESTUDIO', ${h.conv}, ${h.deLaInstructora}, ${h.instructora.authUserId}, ${h.alumna.authUserId}, now() - interval '1 hour')`;

    const estudioSobreTentare = await resolver(deTentare, studio.studioId, 'MANTENER', 'ESTUDIO', studio.authUserId);
    assert.match(estudioSobreTentare.error?.message ?? '', /DENUNCIA_NO_EXISTE/);
    const tentareAntesDeTiempo = await resolver(reciente, studio.studioId, 'MANTENER', 'TENTARE', tentare);
    assert.match(tentareAntesDeTiempo.error?.message ?? '', /DENUNCIA_NO_EXISTE/);
    const laAutora = await resolver(reciente, studio.studioId, 'MANTENER', 'ESTUDIO', h.instructora.authUserId);
    assert.match(laAutora.error?.message ?? '', /DENUNCIA_NO_EXISTE/, 'quien escribió lo denunciado no puede revisarlo');

    const tentareALas25h = await resolver(vieja, studio.studioId, 'OCULTAR', 'TENTARE', tentare);
    assert.ok(!tentareALas25h.error, tentareALas25h.error?.message);
    const [m] = await sql<{ oculto: boolean }[]>`select oculto_en is not null as oculto from public.mensajes where id = ${h.deLaAlumna}`;
    assert.equal(m.oculto, true);
    const [d] = await sql<{ revisada_por: string }[]>`select revisada_por from public.denuncias where id = ${vieja}`;
    assert.equal(d.revisada_por, 'TENTARE');
  } finally {
    await limpiar(studio, [h.instructora], [h.alumna.authUserId, tentare]);
  }
});

test('12. el hilo con el estudio no se cierra nunca', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const alumna = await alumnaConSesion(studio.studioId);
  try {
    const mostrador = await conversacion(studio.studioId, 'ALUMNA_MOSTRADOR');
    await participante(mostrador, alumna.authUserId, 'SOCIO', alumna.socioId);
    const mensaje = await escribir(mostrador, studio.studioId, alumna.authUserId);
    const id = `den-${randomUUID()}`;
    await sql`insert into public.denuncias (id, studio_id, ambito, destino, conversacion_id, mensaje_id, autor_auth_user_id)
              values (${id}, ${studio.studioId}, 'CHAT_ESTUDIO', 'ESTUDIO', ${mostrador}, ${mensaje}, ${alumna.authUserId})`;
    const r = await resolver(id, studio.studioId, 'CERRAR_CONVERSACION', 'ESTUDIO', studio.authUserId);
    assert.equal(r.error?.code, '22023');
    assert.match(r.error?.message ?? '', /ACCION_INVALIDA/);
    const [c] = await sql<{ cerrada: boolean }[]>`select cerrada_en is not null as cerrada from public.conversaciones where id = ${mostrador}`;
    assert.equal(c.cerrada, false);
  } finally {
    await limpiarFixtures(admin, [studio]);
    await admin.auth.admin.deleteUser(alumna.authUserId).catch(() => {});
  }
});

test('13. la misma persona no denuncia dos veces lo mismo mientras esté pendiente', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { comentarioId } = await postConComentario(studio, studio.authUserId);
    const fila = () => ({
      studio_id: studio.studioId, ambito: 'TABLON', destino: 'ESTUDIO', comentario_id: comentarioId,
      autor_auth_user_id: studio.authUserId, denunciante_auth_user_id: studio.authUserId,
    });
    const primera = await admin.from('denuncias').insert(fila());
    assert.ok(!primera.error, primera.error?.message);
    const segunda = await admin.from('denuncias').insert(fila());
    assert.equal(segunda.error?.code, '23505');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
