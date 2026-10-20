import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarCifrasMotivacion, cortesDeCifras, type ClienteCifras } from './motivacion-cifras.ts';

// Un cliente falso que apunta los filtros de cada tabla y contesta lo que se le diga.
function clienteFalso(respuestas: Record<string, { count: number | null; error?: unknown }>) {
  const filtros: Record<string, string[]> = {};
  const cliente: ClienteCifras = {
    from(tabla) {
      filtros[tabla] = [];
      const consulta = {
        eq: (c: string, v: unknown) => { filtros[tabla].push(`eq ${c} ${v}`); return consulta; },
        gt: (c: string, v: unknown) => { filtros[tabla].push(`gt ${c} ${v}`); return consulta; },
        gte: (c: string, v: unknown) => { filtros[tabla].push(`gte ${c} ${v}`); return consulta; },
        or: (f: string) => { filtros[tabla].push(`or ${f}`); return consulta; },
        then: (ok: (r: { count: number | null; error: unknown }) => unknown) =>
          Promise.resolve({ count: respuestas[tabla]?.count ?? null, error: respuestas[tabla]?.error ?? null }).then(ok),
      };
      return { select: () => consulta };
    },
  };
  return { cliente, filtros };
}

test('el mes y el día son los de Madrid: el 1 a las 00:30 de Madrid ya es el mes nuevo', () => {
  // 31-oct 23:30 UTC = 1-nov 00:30 en Madrid (ya en horario de invierno, UTC+1).
  const { hoy, inicioMes } = cortesDeCifras(new Date('2026-10-31T23:30:00Z'));
  assert.equal(hoy, '2026-11-01');
  assert.equal(inicioMes, '2026-10-31T23:00:00.000Z');
  // En verano, el día 1 empieza a las 22:00 UTC del día anterior.
  assert.equal(cortesDeCifras(new Date('2026-07-15T10:00:00Z')).inicioMes, '2026-06-30T22:00:00.000Z');
});

test('cuenta en la base con los filtros de cada cifra, siempre de este estudio', async () => {
  const { cliente, filtros } = clienteFalso({
    member_credits: { count: 1500 }, achievement_progress: { count: 7 }, reward_redemptions: { count: 2 },
  });
  const cifras = await contarCifrasMotivacion(cliente, 'est-1', new Date('2026-10-20T10:00:00Z'));
  assert.deepEqual(cifras, { alumnasConCreditos: 1500, logrosEsteMes: 7, canjesPorEntregar: 2 });
  assert.deepEqual(filtros.member_credits, ['eq studio_id est-1', 'gt saldo 0', 'or caduca_el.is.null,caduca_el.gte.2026-10-20']);
  assert.deepEqual(filtros.achievement_progress, ['eq studio_id est-1', 'eq completado true', 'gte completado_en 2026-09-30T22:00:00.000Z']);
  assert.deepEqual(filtros.reward_redemptions, ['eq studio_id est-1', 'eq estado PENDIENTE']);
});

test('si una cifra falla no se enseña ninguna: una cabecera a medias miente', async () => {
  const { cliente } = clienteFalso({
    member_credits: { count: 3 }, achievement_progress: { count: null, error: { message: 'x' } }, reward_redemptions: { count: 0 },
  });
  assert.equal(await contarCifrasMotivacion(cliente, 'est-1'), null);
  const sinCuenta = clienteFalso({ member_credits: { count: 3 }, achievement_progress: { count: 1 }, reward_redemptions: { count: null } });
  assert.equal(await contarCifrasMotivacion(sinCuenta.cliente, 'est-1'), null);
});
