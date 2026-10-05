import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseFalso } from '../db/supabase-falso.ts';
import { recibosCobradosEnTramo, recibosSinCobrar } from './recibos-servidor.ts';
import { cobradoEnTramo } from './lo-cobrado.ts';
import { resumirRecibos } from '../billing/situacion-recibo.ts';

const ST = 'st-1';
const recibo = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `rec-${String(i).padStart(5, '0')}`, studio_id: ST, socio_id: `s-${i % 40}`, suscripcion_id: null, estado: 'COBRADO',
  importe: 10, importe_devuelto: null, reembolso_stripe_id: null, reembolso_solicitado_en: null,
  fecha_cobro: '2026-10-02', fecha_vencimiento: '2026-10-01', metodo_cobro: 'EFECTIVO', stripe_payment_intent_id: null, conciliado_por: null,
  ...extra,
});

test('recibosCobradosEnTramo: pagina más allá de 1.000, solo del estudio, y da la cifra de «Lo que he cobrado»', async () => {
  const filas = [
    ...Array.from({ length: 2500 }, (_, i) => recibo(i)),
    recibo(9001, { importe: 50, importe_devuelto: 50, estado: 'DEVUELTO', reembolso_stripe_id: 're_1' }), // reembolsado: suma 0
    recibo(9002, { fecha_cobro: '2026-09-30' }),                       // fuera del tramo
    recibo(9003, { studio_id: 'st-2' }),                               // otro estudio
  ];
  const { admin, consultas } = supabaseFalso({ recibos: filas });
  const recibos = await recibosCobradosEnTramo(admin, ST, { desde: '2026-10-01', hasta: '2026-10-05' });
  assert.ok(recibos);
  assert.equal(recibos.length, 2501);
  assert.equal(cobradoEnTramo(recibos, { desde: '2026-10-01', hasta: '2026-10-05' }).neto, 25_000);
  assert.ok(consultas.length >= 3, 'tres páginas');
  for (const c of consultas) assert.ok(c.eqs.includes(`studio_id=${ST}`));
});

test('recibosSinCobrar: lo que se debe y lo que está en el banco, nunca lo cobrado ni lo reembolsado', async () => {
  const filas = [
    recibo(1, { estado: 'PENDIENTE', fecha_cobro: null }),
    recibo(2, { estado: 'FALLIDO', fecha_cobro: null, importe: 30 }),
    recibo(3, { estado: 'EN_CURSO', fecha_cobro: null, importe: 20 }),
    recibo(4, { estado: 'DEVUELTO', importe: 40, importe_devuelto: 40, reembolso_stripe_id: 're_x' }), // reembolso: no es deuda
    recibo(5),
    recibo(6, { estado: 'PENDIENTE', studio_id: 'st-2' }),
  ];
  const recibos = await recibosSinCobrar(supabaseFalso({ recibos: filas }).admin, ST);
  assert.deepEqual(recibos?.map(r => r.id), ['rec-00001', 'rec-00002', 'rec-00003']);
  const r = resumirRecibos(recibos!);
  assert.equal(r.porCobrar + r.impagado, 40);
  assert.equal(r.enCurso, 20);
});

test('si falla una página, null: una cifra de dinero a medias es peor que ninguna', async () => {
  assert.equal(await recibosSinCobrar(supabaseFalso({}, { fallan: ['recibos'] }).admin, ST), null);
});
