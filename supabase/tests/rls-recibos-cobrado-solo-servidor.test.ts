// COBRADO lo escribe el servidor (migración 20261001131500, PR4 del dueño único de
// «recibo cobrado»).
//
// `confirmarCobro` es el único sitio que cierra un cobro con todas sus guardias, y la
// cerradura real vive en la base de datos: el trigger `trg_recibos_cobrado_solo_servidor`
// le veda el estado COBRADO a quien no es el servidor. Este fichero lo comprueba contra una
// base de datos real.
//
// Cada «no puede» exige el MENSAJE del trigger (lleva su nombre delante): la propietaria de
// este fixture sí pasa la RLS de `recibos`, pero un rechazo por otra razón (una FK, otra
// política) también sería un error y el test seguiría en verde sin que el trigger hiciera nada.
//
// ⚠️ Desde la migración 20261001210000 hay OTRA cerradura por delante: `authenticated` solo
// puede escribir las columnas de `COLUMNAS_RECIBO_*` (GRANT por columnas). Tocar cualquier otra
// —el importe, el método, la fecha del cobro— ya no llega al trigger: falla con
// «permission denied for table recibos». Esos casos se prueban en
// `rls-recibos-columnas-escribibles.test.ts`, y la segunda cerradura del trigger sobre el dinero
// (por si un GRANT futuro reabre esas columnas) se prueba allí sin pasar por el GRANT.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en
// `supabase/tests/` y no en `lib/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, crearSuscripcion, limpiarFixtures,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idRecibo = () => `rec-rls-${process.pid}-${Date.now()}-${contador++}`;

const hoy = () => new Date().toISOString().slice(0, 10);

function filaRecibo(studioId: string, id: string, estado: string) {
  return { id, studio_id: studioId, concepto: 'RLS test', importe: 10, estado, fecha_vencimiento: hoy() };
}

async function estadoDe(id: string): Promise<string | null> {
  const { data } = await admin.from('recibos').select('estado').eq('id', id).maybeSingle();
  return (data as { estado: string } | null)?.estado ?? null;
}

test('la propietaria NO puede crear un recibo ya cobrado desde el navegador', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    const { error } = await studio.comoPropietaria.from('recibos').insert(filaRecibo(studio.studioId, id, 'COBRADO'));
    assert.ok(error, 'se creó un recibo COBRADO desde el navegador — guardia abierta');
    assert.match(error.message, /recibos_cobrado_solo_servidor.*ya cobrado desde el navegador/, `bloqueó otra cosa, no el trigger: ${error.message}`);
    assert.equal(await estadoDe(id), null, 'el recibo existe a pesar del error');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('la propietaria SÍ crea un recibo pendiente, y NO puede pasarlo a COBRADO', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    const { error: errAlta } = await studio.comoPropietaria.from('recibos').insert(filaRecibo(studio.studioId, id, 'PENDIENTE'));
    assert.ok(!errAlta, `no pudo crear un pendiente: ${errAlta?.message}`);

    const { error } = await studio.comoPropietaria.from('recibos').update({ estado: 'COBRADO' }).eq('id', id);
    assert.ok(error, 'pasó un recibo a COBRADO desde el navegador — guardia abierta');
    assert.match(error.message, /recibos_cobrado_solo_servidor.*cobrado de un recibo lo cambia el servidor/, `bloqueó otra cosa: ${error.message}`);
    assert.equal(await estadoDe(id), 'PENDIENTE');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('la remesa SEPA sigue funcionando: PENDIENTE -> EN_CURSO -> PENDIENTE desde el navegador', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    await admin.from('recibos').insert(filaRecibo(studio.studioId, id, 'PENDIENTE'));

    const { error: e1 } = await studio.comoPropietaria.from('recibos').update({ estado: 'EN_CURSO' }).eq('id', id);
    assert.ok(!e1, `no pudo marcarlo EN_CURSO: ${e1?.message}`);
    const { error: e2 } = await studio.comoPropietaria.from('recibos').update({ estado: 'PENDIENTE' }).eq('id', id);
    assert.ok(!e2, `no pudo devolverlo a PENDIENTE: ${e2?.message}`);
    // Editar el importe o el concepto de un pendiente YA no es del navegador (GRANT por columnas).
    const { error: e3 } = await studio.comoPropietaria.from('recibos').update({ importe: 12, concepto: 'editado' }).eq('id', id);
    assert.ok(e3, 'el navegador pudo editar el importe/concepto de un pendiente: el GRANT por columnas está abierto');
    assert.match(e3.message, /permission denied for (table recibos|column "\w+" of relation "recibos")/, `bloqueó otra cosa: ${e3.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('sobre un recibo ya cobrado, el navegador no reabre ni cambia el dinero; el servidor sí cobra y devuelve', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = idRecibo();
    // El servidor lo cobra: pasa (control positivo — sin él, los «no puede» de abajo no prueban nada).
    await admin.from('recibos').insert(filaRecibo(studio.studioId, id, 'PENDIENTE'));
    const { error: errCobra } = await admin.from('recibos')
      .update({ estado: 'COBRADO', fecha_cobro: hoy(), metodo_cobro: 'EFECTIVO' }).eq('id', id);
    assert.ok(!errCobra, `el servidor no pudo cobrar un recibo: ${errCobra?.message}`);
    assert.equal(await estadoDe(id), 'COBRADO');

    // Reabrirlo lo veda el TRIGGER (`estado` sí es una columna escribible: lo prohibido es un valor).
    const { error: errReabre } = await studio.comoPropietaria.from('recibos').update({ estado: 'PENDIENTE' }).eq('id', id);
    assert.ok(errReabre, 'el navegador pudo reabrir un recibo cobrado — guardia abierta');
    assert.match(errReabre.message, /recibos_cobrado_solo_servidor.*cobrado de un recibo lo cambia el servidor/, `al reabrirlo, bloqueó otra cosa: ${errReabre.message}`);

    // Lo demás ni llega al trigger: no son columnas del navegador.
    const intentos: Array<[string, Record<string, unknown>]> = [
      ['cambiar el importe', { importe: 1 }],
      ['cambiar el método', { metodo_cobro: 'BIZUM' }],
      ['cambiar la fecha del cobro', { fecha_cobro: '2020-01-01' }],
      ['cambiar el cargo de Stripe', { stripe_payment_intent_id: 'pi_otro' }],
      ['cambiar la descripción', { concepto: 'otra descripción' }],
    ];
    for (const [que, cambio] of intentos) {
      const { error } = await studio.comoPropietaria.from('recibos').update(cambio).eq('id', id);
      assert.ok(error, `el navegador pudo ${que} de un recibo cobrado — GRANT por columnas abierto`);
      assert.match(error.message, /permission denied for (table recibos|column "\w+" of relation "recibos")/, `al ${que}, bloqueó otra cosa: ${error.message}`);
    }
    assert.equal(await estadoDe(id), 'COBRADO', 'el recibo cobrado cambió de estado');

    // Y el servidor sigue pudiendo devolverlo (marcar-devuelto, reembolsos, disputas).
    const { error: errDevuelve } = await admin.from('recibos').update({ estado: 'DEVUELTO' }).eq('id', id);
    assert.ok(!errDevuelve, `el servidor no pudo devolver un cobrado: ${errDevuelve?.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

// ⚠️ Estos upserts de supabase-js fallan hoy por el GRANT por columnas (el `ON CONFLICT DO UPDATE` de PostgREST pone
// TODAS las columnas del payload, y casi ninguna es actualizable), así que no ejercitan el trigger. Lo que SÍ
// ejercita el trigger —`ON CONFLICT … DO UPDATE SET estado`, que pasa el GRANT a nivel SQL— está en
// `rls-recibos-columnas-escribibles.test.ts` (último test). Aquí se fija que ninguno de los tres llega a escribir.
test('un upsert tampoco lo esquiva: ni crear cobrado ni pisar un pendiente/cobrado con otro estado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    // 1) upsert que CREA un recibo cobrado.
    const nuevo = idRecibo();
    const { error: e1 } = await studio.comoPropietaria.from('recibos')
      .upsert(filaRecibo(studio.studioId, nuevo, 'COBRADO'), { onConflict: 'id' });
    assert.ok(e1, 'un upsert creó un recibo cobrado — guardia abierta');
    // Un upsert exige además UPDATE de las columnas del `ON CONFLICT DO UPDATE`, que el navegador ya
    // no tiene: falla por el GRANT antes de llegar al trigger. Cualquiera de las dos cerraduras vale.
    assert.match(e1.message, /permission denied for (table recibos|column "\w+" of relation "recibos")|recibos_cobrado_solo_servidor/, `bloqueó otra cosa: ${e1.message}`);
    assert.equal(await estadoDe(nuevo), null);

    // 2) upsert que pisa un pendiente existente con COBRADO.
    const pendiente = idRecibo();
    await admin.from('recibos').insert(filaRecibo(studio.studioId, pendiente, 'PENDIENTE'));
    const { error: e2 } = await studio.comoPropietaria.from('recibos')
      .upsert(filaRecibo(studio.studioId, pendiente, 'COBRADO'), { onConflict: 'id' });
    assert.ok(e2, 'un upsert pasó un pendiente a cobrado — guardia abierta');
    assert.equal(await estadoDe(pendiente), 'PENDIENTE');

    // 3) upsert que pisa un cobrado con otro estado.
    const cobrado = idRecibo();
    await admin.from('recibos').insert(filaRecibo(studio.studioId, cobrado, 'PENDIENTE'));
    await admin.from('recibos').update({ estado: 'COBRADO', fecha_cobro: hoy(), metodo_cobro: 'EFECTIVO' }).eq('id', cobrado);
    const { error: e3 } = await studio.comoPropietaria.from('recibos')
      .upsert(filaRecibo(studio.studioId, cobrado, 'PENDIENTE'), { onConflict: 'id' });
    assert.ok(e3, 'un upsert reabrió un recibo cobrado — guardia abierta');
    assert.equal(await estadoDe(cobrado), 'COBRADO');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un INSERT de varias filas con una cobrada se rechaza entero', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const a = idRecibo(); const b = idRecibo();
    const { error } = await studio.comoPropietaria.from('recibos').insert([
      filaRecibo(studio.studioId, a, 'PENDIENTE'),
      filaRecibo(studio.studioId, b, 'COBRADO'),
    ]);
    assert.ok(error, 'un INSERT múltiple coló una fila cobrada — guardia abierta');
    assert.match(error.message, /recibos_cobrado_solo_servidor/, `bloqueó otra cosa: ${error.message}`);
    assert.equal(await estadoDe(a), null, 'la fila pendiente del mismo INSERT se escribió');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('la política de cancelar una cuota (corre como el usuario) sigue pudiendo anular los pendientes', async () => {
  // `aplicar_politica_recibos_al_cancelar_cuota` es el único camino que escribe recibos «por debajo»
  // al cancelar una cuota: solo toca PENDIENTE, y ni el trigger ni el GRANT por columnas tienen que
  // estorbarle (corre como su dueño, no como quien cancela).
  const studio = await crearStudioConPropietaria(admin);
  try {
    await admin.from('studios').update({ recibos_al_cancelar_cuota: 'ANULAR' }).eq('id', studio.studioId);
    const socioId = await crearSocia(admin, studio.studioId);
    const susId = await crearSuscripcion(admin, studio.studioId, socioId);
    const id = idRecibo();
    await admin.from('recibos').insert({ ...filaRecibo(studio.studioId, id, 'PENDIENTE'), socio_id: socioId, suscripcion_id: susId });

    const { error } = await studio.comoPropietaria.from('suscripciones').update({ estado: 'CANCELADA' }).eq('id', susId);
    assert.ok(!error, `no pudo cancelar la cuota: ${error?.message}`);
    assert.equal(await estadoDe(id), 'ANULADO', 'la política de cancelación no pudo anular el pendiente');
    // Escribe `anulado_en` y `tras_cancelar_cuota`, columnas que el navegador ya no puede escribir: la
    // función corre como su dueño (SECURITY DEFINER) y no como quien cancela.
    const { data: anulado } = await admin.from('recibos').select('anulado_en, tras_cancelar_cuota').eq('id', id).single();
    assert.ok((anulado as { anulado_en: string | null }).anulado_en, 'el recibo anulado no lleva `anulado_en`');
    assert.equal((anulado as { tras_cancelar_cuota: string | null }).tras_cancelar_cuota, 'ANULADO');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
