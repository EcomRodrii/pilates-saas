// Un manager puede dar de alta a su recepcionista (decisión de la 0113), pero no
// activar el acceso de una cuenta a un rol que mueve dinero: cobrar y devolver
// son de PROPIETARIO y RECEPCION, y a MANAGER se le niegan.
//
// La política `manager_gestiona_equipo` deja a un manager escribir `instructores.rol`
// también por la API de Supabase, sin pasar por el servidor (que ya lo comprueba en
// `puedeActivarAccesoDelRol`). La cerradura real es el trigger
// `instructores_rol_dinero_exige_permiso` (20260930100000), y este fichero la
// comprueba contra una base de datos real. Si cambia la lista de roles que mueven
// dinero (`puede_mover_dinero()`), este es el test que avisa de que el trigger, que
// la lleva copiada, hay que ajustarlo.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en
// `supabase/tests/` y no en `lib/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, crearInstructora, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

async function rolDe(instructorId: string): Promise<string | null> {
  const { data } = await admin.from('instructores').select('rol').eq('id', instructorId).maybeSingle();
  return (data as { rol: string } | null)?.rol ?? null;
}

test('un manager NO puede dar RECEPCION a una ficha que ya tiene cuenta', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let manager; let equipo;
  try {
    manager = await crearInstructora(admin, studio.studioId, 'MANAGER');
    equipo = await crearInstructora(admin, studio.studioId, 'INSTRUCTOR'); // con cuenta

    const { error } = await manager.comoInstructora
      .from('instructores').update({ rol: 'RECEPCION' }).eq('id', equipo.instructorId);

    // El mensaje distingue a nuestro trigger de un rechazo de RLS (también 42501):
    // si algún día la política pasara a bloquearlo antes, el test seguiría verde
    // sin que el trigger hiciera nada.
    assert.ok(error, 'el manager pudo activar el acceso de recepción de una cuenta — guardia abierta');
    assert.match(error.message, /mueve dinero/, `bloqueó otra cosa, no el trigger: ${error.message}`);
    assert.equal(await rolDe(equipo.instructorId), 'INSTRUCTOR', 'el rol cambió a pesar del error');
  } finally {
    if (equipo) await limpiarInstructora(admin, equipo);
    if (manager) await limpiarInstructora(admin, manager);
    await limpiarFixtures(admin, [studio]);
  }
});

test('un manager SÍ puede preparar el alta de su recepcionista: ficha sin cuenta -> RECEPCION', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let manager;
  const fichaSinCuenta = `rls-sin-cuenta-${Date.now()}`;
  try {
    manager = await crearInstructora(admin, studio.studioId, 'MANAGER');
    const { error: errAlta } = await admin.from('instructores').insert({
      id: fichaSinCuenta, studio_id: studio.studioId, nombre: 'RLS sin cuenta', rol: 'INSTRUCTOR', auth_user_id: null, activo: true,
    });
    assert.ok(!errAlta, `no se pudo montar el fixture: ${errAlta?.message}`);

    const { error } = await manager.comoInstructora
      .from('instructores').update({ rol: 'RECEPCION' }).eq('id', fichaSinCuenta);

    assert.ok(!error, `el manager debería poder preparar el alta de su recepcionista: ${error?.message}`);
    assert.equal(await rolDe(fichaSinCuenta), 'RECEPCION');
  } finally {
    await admin.from('instructores').delete().eq('id', fichaSinCuenta);
    if (manager) await limpiarInstructora(admin, manager);
    await limpiarFixtures(admin, [studio]);
  }
});

test('la propietaria SÍ puede dar RECEPCION a una ficha con cuenta (control: el test de arriba no prueba un fixture roto)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let equipo;
  try {
    equipo = await crearInstructora(admin, studio.studioId, 'INSTRUCTOR');

    const { error } = await studio.comoPropietaria
      .from('instructores').update({ rol: 'RECEPCION' }).eq('id', equipo.instructorId);

    assert.ok(!error, `la propietaria debería poder darlo: ${error?.message}`);
    assert.equal(await rolDe(equipo.instructorId), 'RECEPCION');
  } finally {
    if (equipo) await limpiarInstructora(admin, equipo);
    await limpiarFixtures(admin, [studio]);
  }
});

test('el servidor (service-role) no se ve frenado: aplica la misma regla en código', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let equipo;
  try {
    equipo = await crearInstructora(admin, studio.studioId, 'INSTRUCTOR');

    const { error } = await admin.from('instructores').update({ rol: 'RECEPCION' }).eq('id', equipo.instructorId);

    assert.ok(!error, `el trigger frenó al servidor, que ya comprueba el permiso en código: ${error?.message}`);
    assert.equal(await rolDe(equipo.instructorId), 'RECEPCION');
  } finally {
    if (equipo) await limpiarInstructora(admin, equipo);
    await limpiarFixtures(admin, [studio]);
  }
});

test('un manager SÍ puede quitar poder: RECEPCION -> INSTRUCTOR en una ficha con cuenta', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let manager; let equipo;
  try {
    manager = await crearInstructora(admin, studio.studioId, 'MANAGER');
    equipo = await crearInstructora(admin, studio.studioId, 'RECEPCION');

    const { error } = await manager.comoInstructora
      .from('instructores').update({ rol: 'INSTRUCTOR' }).eq('id', equipo.instructorId);

    assert.ok(!error, `bajar de rol no da poder y no debería bloquearse: ${error?.message}`);
    assert.equal(await rolDe(equipo.instructorId), 'INSTRUCTOR');
  } finally {
    if (equipo) await limpiarInstructora(admin, equipo);
    if (manager) await limpiarInstructora(admin, manager);
    await limpiarFixtures(admin, [studio]);
  }
});
