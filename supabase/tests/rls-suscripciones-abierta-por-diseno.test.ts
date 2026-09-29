// CI-1, Fase 1: `suscripciones` con RLS abierta a RECEPCION/MANAGER es una
// DECISIÓN DE PRODUCTO DELIBERADA, no un agujero pendiente
// (.claude/tentare-os.md, "Decisiones de producto/arquitectura ya cerradas").
// Solo INSTRUCTOR queda fuera (20260921221053).
//
// Este test no protege contra un ataque: protege contra que alguien, en una
// futura auditoría de seguridad, "cierre" esto sin saber que ya se decidió
// que se queda así — exactamente el riesgo que el propio tentare-os.md avisa
// explícitamente que existe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, crearInstructora, crearSocia, crearSuscripcion, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

for (const rol of ['RECEPCION', 'MANAGER'] as const) {
  test(`${rol} SÍ ve las suscripciones del estudio — decisión de producto, no un hueco`, async () => {
    const studio = await crearStudioConPropietaria(admin);
    let miembro;
    try {
      miembro = await crearInstructora(admin, studio.studioId, rol);
      const socioId = await crearSocia(admin, studio.studioId);
      await crearSuscripcion(admin, studio.studioId, socioId);

      const { data, error } = await miembro.comoInstructora.from('suscripciones').select('id');
      assert.ok(!error, `la lectura no debería dar error: ${error?.message}`);
      assert.equal(
        data?.length, 1,
        `${rol} debería ver la suscripción — si esto empieza a fallar, alguien cambió `
        + 'suscripciones_lectura para excluir también a este rol. Antes de "arreglarlo", '
        + 'lee la decisión ya cerrada en .claude/tentare-os.md.',
      );
    } finally {
      if (miembro) await limpiarInstructora(admin, miembro);
      await limpiarFixtures(admin, [studio]);
    }
  });
}
