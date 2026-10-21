import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarRenovacionServidor, type EfectosRenovacion } from './renovacion-server.ts';
import { hoyEnEstudio, masDias } from '../utils.ts';

// La entrega de un recibo `rec-aline-…` (alinear al día 1 cobrando la parte
// proporcional) se ancla al RECIBO: la cuota acaba el último día del mes de
// (vencimiento + 1). Las fechas se construyen desde el «hoy» real para que el
// test no caduque.

type Fila = Record<string, unknown>;

function fakeAdmin(opts: { sus: Fila; recibo: Fila; studio?: Fila | null }) {
  const updates: Record<string, Fila[]> = { recibos: [], suscripciones: [] };
  const api = {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from(tabla: string) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          if (tabla === 'recibos') return Promise.resolve({ data: opts.recibo, error: null });
          if (tabla === 'suscripciones') return Promise.resolve({ data: opts.sus, error: null });
          if (tabla === 'planes_tarifa') return Promise.resolve({ data: { tipo: 'MENSUAL', sesiones: null, periodicidad_meses: 1 }, error: null });
          if (tabla === 'studios') return Promise.resolve({ data: opts.studio ?? null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        update(fila: Fila) { updates[tabla]?.push(fila); return this; },
      };
    },
  };
  return { admin: api as never, updates };
}

const sinCreditos: EfectosRenovacion = { seguirCreditos: async () => undefined };
const hoy = hoyEnEstudio();
const finMesDe = (iso: string) => {
  const y = Number(iso.slice(0, 4)); const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 7)}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

test('rec-aline: la cuota acaba el último día del mes de la renovación, aunque el ajuste esté apagado', async () => {
  const ayer = masDias(hoy, -1);
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'p', sesiones_restantes: null, fecha_fin: ayer, estado: 'ACTIVA' },
    recibo: { suscripcion_id: 'sus-1', es_renovacion: true, fecha_vencimiento: ayer },
    studio: { cobro_dia_1_activo: false },
  });
  const r = await aplicarRenovacionServidor(admin, { studioId: 's', reciboId: `rec-aline-sus-1-${ayer}` }, sinCreditos);
  assert.equal(r.aplicada, true);
  // La renovación es hoy (ayer + 1): acaba el último día del mes de hoy.
  assert.equal(updates.suscripciones[0].fecha_fin, finMesDe(hoy));
  assert.equal(r.despues?.fechaFin, finMesDe(hoy));
});

test('rec-aline: repetir la entrega (webhook/cron) no extiende dos veces', async () => {
  const ayer = masDias(hoy, -1);
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'p', sesiones_restantes: null, fecha_fin: finMesDe(hoy), estado: 'ACTIVA' }, // ya entregada
    recibo: { suscripcion_id: 'sus-1', es_renovacion: true, fecha_vencimiento: ayer },
  });
  const r = await aplicarRenovacionServidor(admin, { studioId: 's', reciboId: `rec-aline-sus-1-${ayer}` }, sinCreditos);
  assert.equal(r.aplicada, false);
  assert.equal(updates.suscripciones.length, 0, 'no reescribe la cuota');
});

test('rec-aline: con snapshot previo no se vuelve a decidir (idempotencia por recibo)', async () => {
  const ayer = masDias(hoy, -1);
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'p', sesiones_restantes: null, fecha_fin: ayer, estado: 'ACTIVA' },
    recibo: { suscripcion_id: 'sus-1', es_renovacion: true, fecha_vencimiento: ayer, entrega_tipo: 'MENSUAL', entrega_aplicada: true },
  });
  const r = await aplicarRenovacionServidor(admin, { studioId: 's', reciboId: `rec-aline-sus-1-${ayer}` }, sinCreditos);
  assert.equal(r.aplicada, true);
  assert.equal(updates.suscripciones.length, 0);
});

test('rec-aline cobrado cuando su mes ya pasó: entrega solo los días pagados desde hoy, nunca el mes siguiente ni caducada', async () => {
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'p', sesiones_restantes: null, fecha_fin: '2020-01-09', estado: 'ACTIVA' },
    recibo: { suscripcion_id: 'sus-1', es_renovacion: true, fecha_vencimiento: '2020-01-09' },
  });
  await aplicarRenovacionServidor(admin, { studioId: 's', reciboId: 'rec-aline-sus-1-2020-01-09' }, sinCreditos);
  // Sin importe cobrado en el recibo del test: solo hoy (se avisa). Jamás el fin del mes siguiente.
  assert.equal(updates.suscripciones[0].fecha_fin, hoyEnEstudio());
});

test('recibo normal con el día 1 encendido: modo A intacto (regresión)', async () => {
  const { admin, updates } = fakeAdmin({
    sus: { id: 'sus-1', plan_id: 'p', sesiones_restantes: null, fecha_fin: '2026-10-04', estado: 'ACTIVA' },
    recibo: { suscripcion_id: 'sus-1', es_renovacion: true, fecha_vencimiento: '2026-10-04' },
    studio: { cobro_dia_1_activo: true },
  });
  await aplicarRenovacionServidor(admin, { studioId: 's', reciboId: 'rec-renov-sus-1-2026-10' }, sinCreditos);
  assert.equal(updates.suscripciones[0].fecha_fin, '2026-11-30');
});
