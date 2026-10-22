import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarDecisionAlineacion } from './alineacion-dia1-cron.ts';
import { decidirRenovacion, planificarAlineacion } from './alineacion-dia1.ts';

type Fila = Record<string, unknown>;
function fake(opts: { filasExtendidas?: number; errorUpdate?: string } = {}) {
  const updates: Array<{ tabla: string; fila: Fila; filtros: Array<[string, unknown]> }> = [];
  const admin = {
    from(tabla: string) {
      let fila: Fila = {};
      const filtros: Array<[string, unknown]> = [];
      const resultado = () => ({
        data: opts.errorUpdate ? null : Array.from({ length: opts.filasExtendidas ?? 1 }, () => ({ id: 'x' })),
        error: opts.errorUpdate ? { message: opts.errorUpdate } : null,
      });
      const q: Record<string, unknown> = {
        update(f: Fila) { fila = f; return q; },
        eq(c: string, v: unknown) { filtros.push([c, v]); return q; },
        not(c: string, _o: string, v: unknown) { filtros.push([`not ${c}`, v]); return q; },
        select() { updates.push({ tabla, fila, filtros }); return Promise.resolve(resultado()); },
        then(ok: (v: unknown) => void) { updates.push({ tabla, fila, filtros }); ok(resultado()); },
      };
      return q;
    },
  };
  return { admin: admin as never, updates };
}
const plan = { tipo: 'MENSUAL' as const, precio: 50, periodicidadMeses: 1 as const };
const dec = (fechaFin: string, hoy: string, extra: object = {}) =>
  decidirRenovacion({ suscripcionId: 's1', fechaFin, plan, hoyISO: hoy, diasMinimos: 3, modoProporcional: true, ...extra });
const ok = { aplicarRenovacion: async () => ({ aplicada: true }) };

test('extender: UN update condicional (ACTIVA, fecha_fin leída, sin baja programada); la segunda pasada no cambia nada', async () => {
  const d = dec('2026-10-28', '2026-10-29');
  assert.equal(d.accion, 'extender');
  const a = fake();
  assert.equal(await ejecutarDecisionAlineacion(a.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-28', decision: d }, ok), 'extendida');
  assert.equal(a.updates.length, 1);
  assert.equal(a.updates[0].fila.fecha_fin, '2026-10-31');
  const f = a.updates[0].filtros;
  assert.ok(f.some(([c, v]) => c === 'estado' && v === 'ACTIVA'));
  assert.ok(f.some(([c, v]) => c === 'fecha_fin' && v === '2026-10-28'));
  assert.ok(f.some(([c, v]) => c === 'studio_id' && v === 'st'));
  assert.ok(f.some(([c]) => c === 'not baja_al_vencer'));
  const b = fake({ filasExtendidas: 0 });
  assert.equal(await ejecutarDecisionAlineacion(b.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-28', decision: d }, ok), 'sin_cambio');
});

test('extender: un error de la base lanza (el cron reintenta), no se traga', async () => {
  const d = dec('2026-10-28', '2026-10-29');
  const a = fake({ errorUpdate: 'boom' });
  await assert.rejects(ejecutarDecisionAlineacion(a.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-28', decision: d }, ok), /boom/);
  assert.equal(a.updates.length, 1, 'se intentó una vez');
});

test('reparar: limpia solo el snapshot FALLIDO del recibo y repite la entrega; no cobra ni crea recibo', async () => {
  const d = dec('2026-10-04', '2026-10-05', { reciboExistente: { estado: 'COBRADO', entregaAplicada: false } });
  assert.equal(d.accion, 'reparar');
  const a = fake();
  const llamadas: unknown[] = [];
  const r = await ejecutarDecisionAlineacion(a.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-04', decision: d }, { aplicarRenovacion: async (_x, p) => { llamadas.push(p); return { aplicada: true }; } });
  assert.equal(r, 'reparada');
  assert.deepEqual(llamadas, [{ studioId: 'st', reciboId: 'rec-aline-s1-2026-10-04' }]);
  assert.equal(a.updates.length, 1);
  assert.equal(a.updates[0].tabla, 'recibos');
  assert.deepEqual(a.updates[0].fila, { entrega_tipo: null, entrega_aplicada: null });
  assert.ok(a.updates[0].filtros.some(([c, v]) => c === 'entrega_aplicada' && v === false), 'solo si la entrega consta como fallida');
});

test('reparar: si no se pudo limpiar el snapshot, lanza y NO repite la entrega', async () => {
  const d = dec('2026-10-04', '2026-10-05', { reciboExistente: { estado: 'COBRADO', entregaAplicada: false } });
  const a = fake({ errorUpdate: 'sin permiso' });
  let llamadas = 0;
  await assert.rejects(ejecutarDecisionAlineacion(a.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-04', decision: d }, { aplicarRenovacion: async () => { llamadas++; return { aplicada: true }; } }), /sin permiso/);
  assert.equal(llamadas, 0);
});

test('saltar, cobrar y normal: no escriben nada ni entregan; cobrar y normal devuelven «seguir»', async () => {
  const a = fake();
  const dep = { aplicarRenovacion: async () => { throw new Error('no debe llamarse'); } };
  const saltar = dec('2026-10-04', '2026-10-05', { reciboExistente: { estado: 'FALLIDO', entregaAplicada: null } });
  assert.equal(await ejecutarDecisionAlineacion(a.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-04', decision: saltar }, dep), 'saltada');
  assert.equal(await ejecutarDecisionAlineacion(a.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-04', decision: dec('2026-10-04', '2026-10-05') }, dep), 'seguir');
  assert.equal(await ejecutarDecisionAlineacion(a.admin, { studioId: 'st', suscripcionId: 's1', fechaFin: '2026-10-04', decision: dec('2026-10-04', '2026-10-05', { modoProporcional: false }) }, dep), 'seguir');
  assert.equal(a.updates.length, 0);
});

test('idempotencia del id: misma cuota y ciclo dan el mismo recibo aunque el cron corra dos veces o tarde', () => {
  const a = planificarAlineacion({ suscripcionId: 's1', fechaFin: '2026-10-04', plan, hoyISO: '2026-10-05' });
  const b = planificarAlineacion({ suscripcionId: 's1', fechaFin: '2026-10-04', plan, hoyISO: '2026-10-19' });
  assert.equal(a!.reciboId, b!.reciboId);
  assert.equal(a!.importe, b!.importe);
});
