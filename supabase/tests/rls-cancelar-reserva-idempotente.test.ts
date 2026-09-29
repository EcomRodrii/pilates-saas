// CI-1, Fase 1b: `cancelar_reserva_plaza` es idempotente por reserva — llamarla
// dos veces sobre la MISMA reserva ya CANCELADA no debe repetir ningún
// efecto (devolución de bono, penalización). La propia función lo garantiza
// con una guarda explícita al principio: `if v_estado = 'CANCELADA' then
// return query select false, ...; return; end if;` — antes de tocar
// `bono_devolucion_debida_en`, `recuperaciones` o `penalizaciones`. CANCEL-1
// (auditoría 25-sep) es precisamente la migración que dejó constancia de esa
// devolución en la MISMA transacción, para que un reintento no la duplique
// (memoria de sesión: "bono-idempotente-por-reserva.md").
//
// Se llama con `admin` (service_role), igual que reservar_plaza — ver
// rls-grants-funciones.test.ts y su propia guarda `do $$ ... raise exception
// ... $$` contra `anon`/`authenticated`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, crearSocia, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

interface ResultadoCancelar { era_confirmada: boolean }

test('cancelar la MISMA reserva dos veces no repite la devolución de bono', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socioId = await crearSocia(admin, studio.studioId);
    const sesionId = `sesion-idem-${Date.now()}`;
    const ahora = new Date();
    // Ventana de cancelación 0 (sin `cancelacion_ventana_horas` en el fixture,
    // por defecto de la columna es 12h — pero la sesión empieza YA, así que
    // `v_tardia` da true de todos modos con cualquier ventana > 0). Lo que de
    // verdad importa para este test es que la política del estudio SÍ
    // devuelve en tardía: se fija explícitamente para no depender del default.
    const { error: errStudio } = await admin.from('studios')
      .update({ cancelacion_devolver_bono_tardia: true }).eq('id', studio.studioId);
    assert.ok(!errStudio, `no se pudo ajustar la política de devolución del fixture: ${errStudio?.message}`);

    const { error: errSesion } = await admin.from('sesiones').insert({
      id: sesionId, studio_id: studio.studioId,
      inicio: ahora.toISOString(), fin: new Date(ahora.getTime() + 50 * 60_000).toISOString(),
    });
    assert.ok(!errSesion, `no se pudo montar la sesión de fixture: ${errSesion?.message}`);

    const reservaId = `reserva-idem-${Date.now()}`;
    const { error: errReserva } = await admin.from('reservas').insert({
      id: reservaId, studio_id: studio.studioId, sesion_id: sesionId, socio_id: socioId, estado: 'CONFIRMADA',
      bono_consumo_rastreado: true, bono_suscripcion_id: `suscripcion-idem-${Date.now()}`,
    });
    assert.ok(!errReserva, `no se pudo montar la reserva de fixture (CONFIRMADA, con bono rastreado): ${errReserva?.message}`);

    const primera = await admin.rpc('cancelar_reserva_plaza', {
      p_studio_id: studio.studioId, p_reserva_id: reservaId, p_socio_id: socioId, p_omitir_penalizacion: true,
    });
    assert.ok(!primera.error, `la primera cancelación no debería fallar: ${primera.error?.message}`);
    assert.equal((primera.data as ResultadoCancelar[])?.[0]?.era_confirmada, true, 'la primera cancelación debería reportar que SÍ estaba confirmada');

    const { data: trasPrimera } = await admin.from('reservas').select('estado, bono_devolucion_debida_en').eq('id', reservaId).single();
    assert.equal(trasPrimera?.estado, 'CANCELADA');
    assert.ok(trasPrimera?.bono_devolucion_debida_en, 'la primera cancelación debería marcar la devolución del bono como debida');
    const marcaTrasPrimera = trasPrimera!.bono_devolucion_debida_en;

    const segunda = await admin.rpc('cancelar_reserva_plaza', {
      p_studio_id: studio.studioId, p_reserva_id: reservaId, p_socio_id: socioId, p_omitir_penalizacion: true,
    });
    assert.ok(!segunda.error, `la segunda cancelación (ya CANCELADA) no debería dar error, solo no-op: ${segunda.error?.message}`);
    assert.equal(
      (segunda.data as ResultadoCancelar[])?.[0]?.era_confirmada, false,
      'la segunda cancelación debería reportar que NO estaba confirmada — la guarda de idempotencia no cortó',
    );

    const { data: trasSegunda } = await admin.from('reservas').select('bono_devolucion_debida_en').eq('id', reservaId).single();
    assert.equal(
      trasSegunda?.bono_devolucion_debida_en, marcaTrasPrimera,
      'la segunda llamada tocó bono_devolucion_debida_en — la devolución del bono se duplicaría',
    );
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
