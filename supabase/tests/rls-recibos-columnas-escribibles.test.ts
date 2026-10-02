// `recibos`: el navegador escribe SOLO las columnas que necesita, y no toca un recibo devuelto
// (migración 20261002094636). Segunda mitad de «COBRADO lo escribe el servidor».
//
// Dos cerraduras, y este fichero comprueba las dos por separado:
//  · el GRANT por columnas: `authenticated` no tiene INSERT/UPDATE de TABLA sobre `recibos`, solo los
//    de `COLUMNAS_RECIBO_INSERTABLES` / `COLUMNAS_RECIBO_ACTUALIZABLES`. Una columna que no está en esas
//    listas falla con «permission denied» ANTES de que corra ningún trigger;
//  · el trigger `trg_recibos_cobrado_solo_servidor`: veda los VALORES (COBRADO, DEVUELTO) y, si un GRANT
//    futuro reabriera las columnas del dinero, también cambiarlas en un recibo cobrado o devuelto.
//
// Esa segunda parte no se puede probar con supabase-js (el GRANT para antes), así que se prueba por
// conexión directa: como `postgres` —que no tiene límite de privilegios— pero con el rol de la
// petición puesto a `authenticated` en los claims, que es lo que `es_llamada_servicio()` mira. Todo
// dentro de una transacción que se revierte.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';
import { COLUMNAS_RECIBO_ACTUALIZABLES, COLUMNAS_RECIBO_INSERTABLES } from '../../lib/cobros/recibo-escritura-navegador.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
let contador = 0;
const idRecibo = () => `rec-col-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);

const base = (studioId: string, id: string, extra: Record<string, unknown> = {}) =>
  ({ id, studio_id: studioId, concepto: 'RLS test', importe: 10, estado: 'PENDIENTE', fecha_vencimiento: hoy(), ...extra });

async function estadoDe(id: string): Promise<string | null> {
  const { data } = await admin.from('recibos').select('estado').eq('id', id).maybeSingle();
  return (data as { estado: string } | null)?.estado ?? null;
}

async function columnasConPrivilegio(rol: string, privilegio: 'INSERT' | 'UPDATE'): Promise<string[]> {
  const filas = await sql<{ attname: string }[]>`
    select a.attname from pg_attribute a
     where a.attrelid = 'public.recibos'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege(${rol}, 'public.recibos', a.attname, ${privilegio})
     order by 1`;
  return filas.map(f => f.attname);
}

// Según la versión de Postgres el mensaje nombra la tabla o la columna.
const permisoDenegado = /permission denied for (table recibos|column "\w+" of relation "recibos")/;

after(async () => { await sql.end(); });

test('privilegios: authenticated sin INSERT/UPDATE de tabla y solo con las columnas de la lista', async () => {
  const [t] = await sql<{ ins: boolean; upd: boolean; anon_ins: boolean; anon_upd: boolean; srv_ins: boolean; srv_upd: boolean }[]>`
    select has_table_privilege('authenticated', 'public.recibos', 'INSERT') as ins,
           has_table_privilege('authenticated', 'public.recibos', 'UPDATE') as upd,
           has_any_column_privilege('anon', 'public.recibos', 'INSERT') as anon_ins,
           has_any_column_privilege('anon', 'public.recibos', 'UPDATE') as anon_upd,
           has_table_privilege('service_role', 'public.recibos', 'INSERT') as srv_ins,
           has_table_privilege('service_role', 'public.recibos', 'UPDATE') as srv_upd`;
  assert.equal(t.ins, false, 'authenticated vuelve a tener INSERT de tabla sobre recibos');
  assert.equal(t.upd, false, 'authenticated vuelve a tener UPDATE de tabla sobre recibos');
  assert.equal(t.anon_ins || t.anon_upd, false, 'anon puede escribir alguna columna de recibos');
  assert.ok(t.srv_ins && t.srv_upd, 'service_role perdió su escritura sobre recibos');

  assert.deepEqual(await columnasConPrivilegio('authenticated', 'INSERT'), [...COLUMNAS_RECIBO_INSERTABLES].sort());
  assert.deepEqual(await columnasConPrivilegio('authenticated', 'UPDATE'), [...COLUMNAS_RECIBO_ACTUALIZABLES].sort());
});

test('el navegador crea un recibo con las columnas de la lista, y con ninguna otra', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const bien = idRecibo();
    const { error } = await studio.comoPropietaria.from('recibos').insert({ ...base(studio.studioId, bien), es_renovacion: false });
    assert.ok(!error, `no pudo crear un recibo con las columnas permitidas: ${error?.message}`);

    // Una a una, las demás: cada una tiene que fallar por el GRANT (con el valor que tomaría de verdad).
    const resto: Record<string, unknown> = {
      metodo_cobro: 'EFECTIVO', fecha_cobro: hoy(), fecha_devolucion: hoy(), intentos_reintento: 2, sepa_estado: 'succeeded',
      proximo_reintento: new Date().toISOString(), stripe_payment_intent_id: 'pi_x', checkout_session_id: 'cs_x',
      cobro_mostrador_pi: 'pi_y', importe_devuelto: 5, reembolso_stripe_id: 're_x', factura_pendiente_sellar: true,
      entrega_aplicada: true, conciliado_en: new Date().toISOString(), anulado_en: new Date().toISOString(),
    };
    for (const [columna, valor] of Object.entries(resto)) {
      const id = idRecibo();
      const { error: err } = await studio.comoPropietaria.from('recibos').insert({ ...base(studio.studioId, id), [columna]: valor });
      assert.ok(err, `el navegador pudo crear un recibo fijando ${columna}`);
      assert.match(err.message, permisoDenegado, `al fijar ${columna}, bloqueó otra cosa: ${err.message}`);
      assert.equal(await estadoDe(id), null, `el recibo con ${columna} existe a pesar del error`);
    }
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('el navegador solo cambia el estado y los reintentos de un recibo; cualquier otra columna, no', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    await admin.from('recibos').insert(base(studio.studioId, id));

    // Control positivo: lo que sí tiene que poder (la remesa SEPA y «Reintentar»).
    const { error: ok } = await studio.comoPropietaria.from('recibos').update({ estado: 'EN_CURSO', intentos_reintento: 1 }).eq('id', id);
    assert.ok(!ok, `no pudo marcar EN_CURSO con un reintento: ${ok?.message}`);

    // Todas las columnas de la tabla que NO están en la lista, derivadas del catálogo: una columna nueva
    // de `recibos` entra sola en este bucle y tiene que fallar.
    const todas = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_schema = 'public' and table_name = 'recibos' order by ordinal_position`;
    const permitidas = new Set<string>(COLUMNAS_RECIBO_ACTUALIZABLES);
    const { data: fila } = await admin.from('recibos').select('*').eq('id', id).single();
    for (const { column_name: columna } of todas) {
      if (permitidas.has(columna)) continue;
      const { error } = await studio.comoPropietaria.from('recibos').update({ [columna]: (fila as Record<string, unknown>)[columna] }).eq('id', id);
      assert.ok(error, `el navegador pudo actualizar la columna ${columna} de un recibo`);
      assert.match(error.message, permisoDenegado, `al actualizar ${columna}, bloqueó otra cosa: ${error.message}`);
    }
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un recibo DEVUELTO: el navegador solo lo reintenta si lo devolvió el banco', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const devuelto = (extra: Record<string, unknown> = {}) =>
      ({ ...base(studio.studioId, idRecibo(), { estado: 'DEVUELTO', fecha_devolucion: new Date().toISOString(), ...extra }) });
    const banco = devuelto();
    const banco2 = devuelto();
    const reembolsadoStripe = devuelto({ reembolso_stripe_id: 're_test' });
    const reembolsoPedido = devuelto({ reembolso_solicitado_en: new Date().toISOString() });
    const devueltoEntero = devuelto({ importe_devuelto: 10 });
    for (const r of [banco, banco2, reembolsadoStripe, reembolsoPedido, devueltoEntero]) {
      const { error } = await admin.from('recibos').insert(r);
      assert.ok(!error, `fixture: ${error?.message}`);
    }
    const noReabre = /recibos_cobrado_solo_servidor.*solo se reintenta si lo devolvió el banco/;

    // «Reintentar» (la única vía de pantalla) → EN_CURSO, solo el devuelto por el banco.
    const { error: errBanco } = await studio.comoPropietaria.from('recibos').update({ estado: 'EN_CURSO', intentos_reintento: 1 }).eq('id', banco.id);
    assert.ok(!errBanco, `no pudo reintentar un recibo devuelto por el banco: ${errBanco?.message}`);
    assert.equal(await estadoDe(banco.id as string), 'EN_CURSO');

    // Pero no a cualquier otro estado.
    for (const estado of ['PENDIENTE', 'FALLIDO', 'ANULADO']) {
      const { error } = await studio.comoPropietaria.from('recibos').update({ estado }).eq('id', banco2.id);
      assert.ok(error, `el navegador pudo pasar un devuelto a ${estado}`);
      assert.match(error.message, noReabre, `a ${estado}, bloqueó otra cosa: ${error.message}`);
    }
    assert.equal(await estadoDe(banco2.id as string), 'DEVUELTO');

    // Un reembolso del estudio (pedido o hecho) y un devuelto entero son dinero que va DE VUELTA a la
    // socia: abrirlos la volvería a cobrar. Ni siquiera «Reintentar».
    for (const r of [reembolsadoStripe, reembolsoPedido, devueltoEntero]) {
      const { error } = await studio.comoPropietaria.from('recibos').update({ estado: 'EN_CURSO' }).eq('id', r.id as string);
      assert.ok(error, `el navegador reabrió un recibo reembolsado (${JSON.stringify(r)})`);
      assert.match(error.message, noReabre, `bloqueó otra cosa: ${error.message}`);
      assert.equal(await estadoDe(r.id as string), 'DEVUELTO');
    }

    // Y no se llega a DEVUELTO desde el navegador, ni creándolo ni pasándolo.
    const { error: errNace } = await studio.comoPropietaria.from('recibos').insert(base(studio.studioId, idRecibo(), { estado: 'DEVUELTO' }));
    assert.ok(errNace, 'el navegador creó un recibo devuelto');
    assert.match(errNace.message, /recibos_cobrado_solo_servidor.*ya devuelto desde el navegador/, `bloqueó otra cosa: ${errNace.message}`);
    const pendiente = idRecibo();
    await admin.from('recibos').insert(base(studio.studioId, pendiente));
    const { error: errPasa } = await studio.comoPropietaria.from('recibos').update({ estado: 'DEVUELTO' }).eq('id', pendiente);
    assert.ok(errPasa, 'el navegador pasó un recibo a devuelto');
    assert.match(errPasa.message, /recibos_cobrado_solo_servidor.*estado devuelto de un recibo lo pone el servidor/, `bloqueó otra cosa: ${errPasa.message}`);

    // El servidor sí lo reabre (control positivo: sin él, los «no puede» de arriba no prueban nada).
    const { error: errServidor } = await admin.from('recibos').update({ estado: 'PENDIENTE' }).eq('id', reembolsadoStripe.id as string);
    assert.ok(!errServidor, `el servidor no pudo reabrir un devuelto: ${errServidor?.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un recibo nace PENDIENTE desde el navegador: ni FALLIDO (bloquea por impago) ni EN_CURSO (simula «enviado al banco»)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    for (const estado of ['FALLIDO', 'EN_CURSO']) {
      const id = idRecibo();
      const { error } = await studio.comoPropietaria.from('recibos').insert(base(studio.studioId, id, { estado }));
      assert.ok(error, `el navegador creó un recibo ${estado}`);
      assert.match(error.message, /recibos_cobrado_solo_servidor.*nace pendiente/, `con ${estado}, bloqueó otra cosa: ${error.message}`);
      assert.equal(await estadoDe(id), null);
    }
    // Control positivo: el pendiente sí.
    const { error: ok } = await studio.comoPropietaria.from('recibos').insert(base(studio.studioId, idRecibo()));
    assert.ok(!ok, `no pudo crear un pendiente: ${ok?.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un EN_CURSO con un cobro en vuelo no vuelve a pendiente desde el navegador; la remesa sin cobro en marcha, sí', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    // Una remesa SEPA preparada: EN_CURSO sin ningún cobro en marcha. Es lo que deshace «Quitar de la remesa».
    const remesa = idRecibo();
    await admin.from('recibos').insert(base(studio.studioId, remesa, { estado: 'EN_CURSO' }));
    const { error: errRemesa } = await studio.comoPropietaria.from('recibos').update({ estado: 'PENDIENTE' }).eq('id', remesa);
    assert.ok(!errRemesa, `no pudo deshacer una remesa sin cobro en marcha: ${errRemesa?.message}`);
    assert.equal(await estadoDe(remesa), 'PENDIENTE');

    // Con cualquiera de las cuatro marcas de cobro en marcha, no (cambiaría la clave de idempotencia del
    // siguiente cobro y abriría un segundo adeudo con el primero en curso).
    const marcas: Array<[string, Record<string, unknown>]> = [
      ['cargo de Stripe', { stripe_payment_intent_id: 'pi_test' }],
      ['sesión de pago', { checkout_session_id: 'cs_test' }],
      ['cobro de mostrador', { cobro_mostrador_pi: 'pi_mostrador' }],
      ['reintento programado', { proximo_reintento: new Date(Date.now() + 3_600_000).toISOString() }],
    ];
    for (const [que, extra] of marcas) {
      const id = idRecibo();
      await admin.from('recibos').insert(base(studio.studioId, id, { estado: 'EN_CURSO', ...extra }));
      for (const destino of ['PENDIENTE', 'FALLIDO']) {
        const { error } = await studio.comoPropietaria.from('recibos').update({ estado: destino, intentos_reintento: 5 }).eq('id', id);
        assert.ok(error, `el navegador pasó a ${destino} un EN_CURSO con ${que}`);
        assert.match(error.message, /recibos_cobrado_solo_servidor.*cobro en curso no vuelve a pendiente/, `bloqueó otra cosa: ${error.message}`);
      }
      assert.equal(await estadoDe(id), 'EN_CURSO');
      // El servidor sí lo cierra (control positivo).
      const { error: errServidor } = await admin.from('recibos').update({ estado: 'FALLIDO' }).eq('id', id);
      assert.ok(!errServidor, `el servidor no pudo cerrar el EN_CURSO: ${errServidor?.message}`);
    }
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

// La SEGUNDA cerradura del dinero: aunque un GRANT futuro reabriera estas columnas, el trigger sigue
// vedando cambiarlas en un recibo cobrado o devuelto. Se prueba como `postgres` (sin límite de
// privilegios) con los claims de `authenticated`: así `es_llamada_servicio()` es falso y el trigger corre
// en modo «navegador» sobre TODAS las columnas. Todo en una transacción que se revierte.
test('el trigger veda el dinero de un recibo cobrado o devuelto aunque la columna fuera escribible', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const cobrado = idRecibo();
    const devuelto = idRecibo();
    await admin.from('recibos').insert([
      base(studio.studioId, cobrado, { estado: 'PENDIENTE' }),
      base(studio.studioId, devuelto, { estado: 'DEVUELTO', fecha_devolucion: new Date().toISOString() }),
    ]);
    await admin.from('recibos').update({ estado: 'COBRADO', fecha_cobro: hoy(), metodo_cobro: 'EFECTIVO' }).eq('id', cobrado);

    const cambios: Array<[string, string]> = [
      ['importe', 'importe = 99'],
      ['metodo_cobro', `metodo_cobro = 'BIZUM'`],
      ['fecha_cobro', `fecha_cobro = '2020-01-01'`],
      ['fecha_devolucion', `fecha_devolucion = '2020-01-01'`],
      ['importe_devuelto', 'importe_devuelto = 1'],
      ['reembolso_stripe_id', `reembolso_stripe_id = 're_x'`],
      ['reembolso_solicitado_en', 'reembolso_solicitado_en = now()'],
      ['stripe_payment_intent_id', `stripe_payment_intent_id = 'pi_x'`],
    ];
    const dineroBloqueado = /recibos_cobrado_solo_servidor: el dinero de un recibo cobrado o devuelto/;
    const fallos: string[] = [];

    class Revertir extends Error {}
    await sql.begin(async tx => {
      const comoNavegador = () => tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: studio.authUserId, role: 'authenticated' })}, true)`;
      const comoServidor = () => tx`select set_config('request.jwt.claims', '', true)`;
      const intentar = async (consulta: string): Promise<string | null> => {
        try {
          await tx.savepoint(async sp => { await sp.unsafe(consulta); });
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      };

      // Un upsert que SÍ pasa el GRANT a nivel SQL (aquí no hay GRANT que valga): `ON CONFLICT … DO UPDATE SET
      // estado`. Lo corta el trigger en el UPDATE de la rama de conflicto.
      await comoNavegador();
      for (const [id, que] of [[cobrado, 'un cobrado'], [devuelto, 'un devuelto']] as const) {
        const msg = await intentar(`insert into public.recibos (id, studio_id, concepto, importe, estado, fecha_vencimiento)
          values ('${id}', '${studio.studioId}', 'x', 10, 'PENDIENTE', current_date)
          on conflict (id) do update set estado = excluded.estado`);
        if (msg === null) fallos.push(`un upsert reabrió ${que} como navegador`);
        else if (!/recibos_cobrado_solo_servidor/.test(msg)) fallos.push(`el upsert sobre ${que} bloqueó otra cosa: ${msg}`);
      }

      for (const id of [cobrado, devuelto]) {
        await comoNavegador();
        for (const [columna, set] of cambios) {
          const msg = await intentar(`update public.recibos set ${set} where id = '${id}'`);
          if (msg === null) fallos.push(`${columna} de ${id === cobrado ? 'un cobrado' : 'un devuelto'} se pudo cambiar como navegador`);
          else if (!dineroBloqueado.test(msg)) fallos.push(`${columna}: bloqueó otra cosa: ${msg}`);
        }
        // Lo que no es dinero sigue pudiendo cambiar (control positivo del modo «navegador»).
        const texto = await intentar(`update public.recibos set concepto = 'otro texto' where id = '${id}'`);
        if (texto !== null) fallos.push(`el concepto no debería estar vedado por el trigger: ${texto}`);
        // Y como servidor, todo pasa (control positivo del modo «servidor»).
        await comoServidor();
        const importe = await intentar(`update public.recibos set importe = 11 where id = '${id}'`);
        if (importe !== null) fallos.push(`el servidor no pudo cambiar el importe: ${importe}`);
      }
      throw new Revertir('revertir');
    }).catch(e => { if (!(e instanceof Revertir)) throw e; });

    assert.deepEqual(fallos, [], fallos.join('\n'));
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
