// `studios`: el navegador crea un estudio con las columnas del alta y no lo borra nunca
// (migración 20261016115000).
//
// Dos cerraduras, comprobadas por separado:
//  · los privilegios: `authenticated` sin DELETE y sin INSERT de tabla, solo el INSERT de las columnas de
//    `COLUMNAS_ESTUDIO_INSERTABLES`. Lo que no está en la lista falla con «permission denied» antes que
//    ningún trigger;
//  · el trigger `trg_studios_creado_en_solo_servidor`: si un GRANT futuro reabriera `creado_en`, el alta
//    del navegador sigue naciendo con now(). Se prueba por conexión directa (como `postgres` con los claims
//    de `authenticated`, que es lo que mira `es_llamada_servicio()`), dentro de una transacción revertida.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';
import { COLUMNAS_ESTUDIO_INSERTABLES } from '../../lib/estudio/alta-escritura-navegador.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
let contador = 0;
const idEstudio = () => `studio-alta-${process.pid}-${Date.now()}-${contador++}`;

// Según la versión de Postgres el mensaje nombra la tabla o la columna.
const permisoDenegado = /permission denied for (table studios|column "\w+" of relation "studios")/;

async function existe(id: string): Promise<boolean> {
  const { data } = await admin.from('studios').select('id').eq('id', id).maybeSingle();
  return data !== null;
}

after(async () => { await sql.end(); });

test('privilegios: authenticated sin DELETE ni INSERT de tabla, y solo con las columnas del alta', async () => {
  const [t] = await sql<{ del: boolean; ins: boolean; anon_ins: boolean; anon_del: boolean; srv_ins: boolean; srv_del: boolean }[]>`
    select has_table_privilege('authenticated', 'public.studios', 'DELETE') as del,
           has_table_privilege('authenticated', 'public.studios', 'INSERT') as ins,
           has_any_column_privilege('anon', 'public.studios', 'INSERT') as anon_ins,
           has_table_privilege('anon', 'public.studios', 'DELETE') as anon_del,
           has_table_privilege('service_role', 'public.studios', 'INSERT') as srv_ins,
           has_table_privilege('service_role', 'public.studios', 'DELETE') as srv_del`;
  assert.equal(t.del, false, 'authenticated vuelve a poder borrar estudios');
  assert.equal(t.ins, false, 'authenticated vuelve a tener INSERT de tabla sobre studios');
  assert.equal(t.anon_ins || t.anon_del, false, 'anon puede crear o borrar estudios');
  assert.ok(t.srv_ins && t.srv_del, 'service_role perdió su escritura sobre studios');

  const filas = await sql<{ attname: string }[]>`
    select a.attname from pg_attribute a
     where a.attrelid = 'public.studios'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('authenticated', 'public.studios', a.attname, 'INSERT')
     order by 1`;
  assert.deepEqual(filas.map(f => f.attname), [...COLUMNAS_ESTUDIO_INSERTABLES].sort());
});

test('la propietaria no puede borrar su estudio desde el navegador; el servidor sí', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { error } = await studio.comoPropietaria.from('studios').delete().eq('id', studio.studioId);
    assert.ok(error, 'la propietaria borró su estudio desde el navegador');
    assert.match(error.message, permisoDenegado, `bloqueó otra cosa: ${error.message}`);
    assert.ok(await existe(studio.studioId), 'el estudio desapareció a pesar del error');
  } finally {
    // Control positivo: el servidor borra (es lo que hace la limpieza).
    await limpiarFixtures(admin, [studio]);
    assert.equal(await existe(studio.studioId), false, 'el servidor no pudo borrar el estudio');
  }
});

test('el alta con las columnas de la lista funciona; con cualquier otra columna, no', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const creados: string[] = [];
  try {
    const alta = (extra: Record<string, unknown> = {}) => {
      const id = idEstudio();
      creados.push(id);
      return {
        id, nombre: 'Alta RLS', ciudad: 'Madrid', telefono: null, plan: 'BASE',
        owner_auth_user_id: studio.authUserId, slug: id, como_nos_conocio: null, tipo_cuenta: 'ESTUDIO', ...extra,
      };
    };

    // Control positivo: lo que manda `dbCreateStudio`.
    const bien = alta();
    const { error: ok } = await studio.comoPropietaria.from('studios').insert(bien);
    assert.ok(!ok, `el alta normal falló: ${ok?.message}`);
    const { data: fila } = await admin.from('studios').select('creado_en, es_demo').eq('id', bien.id).single();
    const f = fila as { creado_en: string; es_demo: boolean };
    assert.ok(Math.abs(Date.parse(f.creado_en) - Date.now()) < 5 * 60_000, `creado_en no es de ahora: ${f.creado_en}`);
    assert.equal(f.es_demo, false);

    // Columnas que decide el servidor: cada una falla por el privilegio.
    const servidor: Record<string, unknown> = {
      creado_en: '2000-01-01T00:00:00Z', es_demo: true, subscription_status: 'active', subscription_id: 'sub_x',
      current_period_end: '2099-01-01T00:00:00Z', trial_ends_at: '2099-01-01T00:00:00Z', suspendido_en: null,
      supresion_pedida_en: null, contrato_terminado_en: null, cadena_id: null, stripe_customer_id: 'cus_x',
      tour_obligatorio: false, exigir_doble_factor: false,
    };
    for (const [columna, valor] of Object.entries(servidor)) {
      const datos = alta({ [columna]: valor });
      const { error } = await studio.comoPropietaria.from('studios').insert(datos);
      assert.ok(error, `el navegador pudo crear un estudio fijando ${columna}`);
      assert.match(error.message, permisoDenegado, `al fijar ${columna}, bloqueó otra cosa: ${error.message}`);
      assert.equal(await existe(datos.id), false, `el estudio con ${columna} existe a pesar del error`);
    }
  } finally {
    if (creados.length > 0) await admin.from('studios').delete().in('id', creados);
    await limpiarFixtures(admin, [studio]);
  }
});

test('`creado_en`: el alta del navegador nace con now() aunque la columna se reabriera; el servidor la fija', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    class Revertir extends Error {}
    const fallos: string[] = [];
    await sql.begin(async tx => {
      const deNavegador = idEstudio();
      const deServidor = idEstudio();
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: studio.authUserId, role: 'authenticated' })}, true)`;
      await tx.unsafe(`insert into public.studios (id, nombre, owner_auth_user_id, slug, creado_en)
        values ('${deNavegador}', 'Alta RLS', '${studio.authUserId}', '${deNavegador}', '2000-01-01')`);
      await tx.unsafe(`update public.studios set creado_en = '2000-01-01' where id = '${studio.studioId}'`);
      await tx`select set_config('request.jwt.claims', '', true)`;
      await tx.unsafe(`insert into public.studios (id, nombre, owner_auth_user_id, slug, creado_en)
        values ('${deServidor}', 'Alta RLS', '${studio.authUserId}', '${deServidor}', '2000-01-01')`);

      const filas = await tx<{ id: string; anio: number }[]>`
        select id, extract(year from creado_en)::int as anio from public.studios where id in (${deNavegador}, ${deServidor}, ${studio.studioId})`;
      const anio = new Map(filas.map(r => [r.id, r.anio]));
      if (anio.get(deNavegador) === 2000) fallos.push('el alta del navegador fijó su creado_en');
      if (anio.get(studio.studioId) === 2000) fallos.push('el navegador cambió el creado_en de un estudio');
      if (anio.get(deServidor) !== 2000) fallos.push('el servidor no pudo fijar creado_en');
      throw new Revertir();
    }).catch(e => { if (!(e instanceof Revertir)) throw e; });
    assert.deepEqual(fallos, []);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
