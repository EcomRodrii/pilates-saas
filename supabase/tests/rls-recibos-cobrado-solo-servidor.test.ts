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
    // Y editar un pendiente sigue siendo suyo.
    const { error: e3 } = await studio.comoPropietaria.from('recibos').update({ importe: 12, concepto: 'editado' }).eq('id', id);
    assert.ok(!e3, `no pudo editar un pendiente: ${e3?.message}`);
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

    const intentos: Array<[string, Record<string, unknown>, RegExp]> = [
      ['reabrirlo', { estado: 'PENDIENTE' }, /recibos_cobrado_solo_servidor.*cobrado de un recibo lo cambia el servidor/],
      ['cambiar el importe', { importe: 1 }, /recibos_cobrado_solo_servidor.*ya cobrado no cambia su importe/],
      ['cambiar el método', { metodo_cobro: 'BIZUM' }, /recibos_cobrado_solo_servidor.*ya cobrado no cambia su importe/],
      ['cambiar la fecha del cobro', { fecha_cobro: '2020-01-01' }, /recibos_cobrado_solo_servidor.*ya cobrado no cambia su importe/],
      ['cambiar el cargo de Stripe', { stripe_payment_intent_id: 'pi_otro' }, /recibos_cobrado_solo_servidor.*ya cobrado no cambia su importe/],
    ];
    for (const [que, cambio, mensaje] of intentos) {
      const { error } = await studio.comoPropietaria.from('recibos').update(cambio).eq('id', id);
      assert.ok(error, `el navegador pudo ${que} de un recibo cobrado — guardia abierta`);
      assert.match(error.message, mensaje, `al ${que}, bloqueó otra cosa: ${error.message}`);
    }
    assert.equal(await estadoDe(id), 'COBRADO', 'el recibo cobrado cambió de estado');

    // Lo que no es dinero sigue siendo editable (la descripción).
    const { error: errTexto } = await studio.comoPropietaria.from('recibos').update({ concepto: 'otra descripción' }).eq('id', id);
    assert.ok(!errTexto, `no pudo cambiar la descripción de un cobrado: ${errTexto?.message}`);

    // Y el servidor sigue pudiendo devolverlo (marcar-devuelto, reembolsos, disputas).
    const { error: errDevuelve } = await admin.from('recibos').update({ estado: 'DEVUELTO' }).eq('id', id);
    assert.ok(!errDevuelve, `el servidor no pudo devolver un cobrado: ${errDevuelve?.message}`);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un upsert tampoco lo esquiva: ni crear cobrado ni pisar un pendiente/cobrado con otro estado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    // 1) upsert que CREA un recibo cobrado.
    const nuevo = idRecibo();
    const { error: e1 } = await studio.comoPropietaria.from('recibos')
      .upsert(filaRecibo(studio.studioId, nuevo, 'COBRADO'), { onConflict: 'id' });
    assert.ok(e1, 'un upsert creó un recibo cobrado — guardia abierta');
    assert.match(e1.message, /recibos_cobrado_solo_servidor/, `bloqueó otra cosa: ${e1.message}`);
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
  // con el rol de quien cancela: solo toca PENDIENTE, y el trigger no tiene que estorbarle.
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
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
