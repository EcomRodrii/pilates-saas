import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anularVentaClaseSuelta, prepararVentaClaseSuelta } from './clase-suelta-mostrador.ts';

// Un admin de mentira: guarda filas por tabla, aplica los `.eq`/`.is` de los
// update (compare-and-set) y apunta cada escritura.
type Fila = Record<string, unknown>;
function adminFalso(inicial: { suscripciones?: Fila[]; recibos?: Fila[] } = {}, fallos: { insert?: Record<string, string> } = {}) {
  const tablas: Record<string, Fila[]> = { suscripciones: [...(inicial.suscripciones ?? [])], recibos: [...(inicial.recibos ?? [])] };
  const escrituras: string[] = [];
  const admin = {
    from(tabla: string) {
      const filtros: [string, unknown, 'eq' | 'is'][] = [];
      const coincide = (f: Fila) => filtros.every(([k, v]) => f[k] === v || (v === null && f[k] == null));
      let cambios: Fila | null = null;
      const cadena = {
        eq(k: string, v: unknown) { filtros.push([k, v, 'eq']); return cadena; },
        is(k: string, v: unknown) {
          filtros.push([k, v, 'is']);
          // Un update que termina en `.is` se ejecuta al esperarlo.
          return cadena;
        },
        select() { return cadena; },
        maybeSingle: async () => ({ data: tablas[tabla].find(coincide) ?? null, error: null }),
        then(resolver: (r: { data: Fila[] | null; error: null }) => unknown) {
          if (!cambios) return Promise.resolve({ data: tablas[tabla].filter(coincide), error: null }).then(resolver);
          const tocadas = tablas[tabla].filter(coincide);
          for (const f of tocadas) Object.assign(f, cambios);
          if (tocadas.length) escrituras.push(`update ${tabla} ${tocadas.map(f => f.id).join(',')}`);
          return Promise.resolve({ data: tocadas.map(f => ({ id: f.id })), error: null }).then(resolver);
        },
      };
      return {
        insert: async (fila: Fila) => {
          const codigo = fallos.insert?.[tabla];
          if (codigo) return { error: { code: codigo, message: 'fallo' } };
          if (tablas[tabla].some(f => f.id === fila.id)) return { error: { code: '23505', message: 'duplicado' } };
          tablas[tabla].push({ ...fila });
          escrituras.push(`insert ${tabla} ${fila.id}`);
          return { error: null };
        },
        select: () => cadena,
        update: (vals: Fila) => { cambios = vals; return cadena; },
      };
    },
  };
  return { admin: admin as unknown as SupabaseClient, tablas, escrituras };
}

const PLAN = { id: 'pl-suelta', tipo: 'PUNTUAL', sesiones: 1, validezDias: 30, periodicidadMeses: null };
const VENTA = { studioId: 'st', socioId: 'soc-1', reservaId: 'res-1', plan: PLAN, importe: 15, concepto: 'Clase suelta — Reformer, vie 2 oct 09:00', hoy: '2026-10-02' };

test('vende la clase suelta: una sesión que caduca con la tarifa, y su recibo pendiente colgando de ella', async () => {
  const { admin, tablas } = adminFalso();
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.deepEqual(r, { ok: true, suscripcionId: 'sus-suelta-res-1', reciboId: 'rec-suelta-res-1' });
  assert.deepEqual(
    { ...tablas.suscripciones[0] },
    { id: 'sus-suelta-res-1', studio_id: 'st', socio_id: 'soc-1', plan_id: 'pl-suelta', estado: 'ACTIVA', fecha_inicio: '2026-10-02', fecha_fin: '2026-11-01', sesiones_restantes: 1, stripe_subscription_id: null },
  );
  assert.deepEqual(
    { ...tablas.recibos[0] },
    { id: 'rec-suelta-res-1', studio_id: 'st', socio_id: 'soc-1', suscripcion_id: 'sus-suelta-res-1', concepto: VENTA.concepto, importe: 15, estado: 'PENDIENTE', fecha_vencimiento: '2026-10-02', es_renovacion: false },
  );
});

test('un reintento de la misma reserva no duplica nada', async () => {
  const { admin, tablas } = adminFalso();
  await prepararVentaClaseSuelta(admin, VENTA);
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.equal(r.ok, true);
  assert.equal(tablas.suscripciones.length, 1);
  assert.equal(tablas.recibos.length, 1);
});

test('si el recibo que ya había es de otro importe, no se sigue: se manda a revisarlo', async () => {
  const { admin } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', socio_id: 'soc-1', plan_id: 'pl-suelta', estado: 'ACTIVA', sesiones_restantes: 1 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', socio_id: 'soc-1', importe: 20, estado: 'PENDIENTE' }],
  });
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : '', /otro importe/);
});

test('si la suscripción es de otra clienta, no se toca', async () => {
  const { admin, escrituras } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', socio_id: 'soc-OTRA', plan_id: 'pl-suelta', estado: 'ACTIVA', sesiones_restantes: 1 }],
  });
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.equal(r.ok, false);
  assert.deepEqual(escrituras, []);
});

test('si no se puede crear el recibo, la clase suelta no se queda regalada', async () => {
  const { admin, tablas } = adminFalso({}, { insert: { recibos: '42501' } });
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.equal(r.ok, false);
  assert.equal(tablas.suscripciones[0].estado, 'CANCELADA');
  assert.equal(tablas.suscripciones[0].sesiones_restantes, 0);
});

test('anular: primero la clase suelta y, solo si estaba sin gastar, el recibo', async () => {
  const { admin, tablas, escrituras } = adminFalso();
  await prepararVentaClaseSuelta(admin, VENTA);
  const r = await anularVentaClaseSuelta(admin, { studioId: 'st', suscripcionId: 'sus-suelta-res-1', reciboId: 'rec-suelta-res-1', ahoraISO: '2026-10-02T10:00:00.000Z' });
  assert.deepEqual(r, { anulada: true });
  assert.deepEqual(escrituras.slice(-2), ['update suscripciones sus-suelta-res-1', 'update recibos rec-suelta-res-1']);
  assert.equal(tablas.recibos[0].estado, 'ANULADO');
  assert.equal(tablas.recibos[0].anulado_en, '2026-10-02T10:00:00.000Z', 'ANULADO exige anulado_en (CHECK de la base de datos)');
});

test('anular no toca nada si la sesión ya se gastó: esa venta sí sirvió', async () => {
  const { admin, tablas } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'ACTIVA', sesiones_restantes: 0 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'PENDIENTE', fecha_cobro: null }],
  });
  const r = await anularVentaClaseSuelta(admin, { studioId: 'st', suscripcionId: 'sus-suelta-res-1', reciboId: 'rec-suelta-res-1', ahoraISO: 'x' });
  assert.deepEqual(r, { anulada: false });
  assert.equal(tablas.recibos[0].estado, 'PENDIENTE');
});

test('anular nunca toca un recibo cobrado', async () => {
  const { admin, tablas } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'ACTIVA', sesiones_restantes: 1 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'COBRADO', fecha_cobro: '2026-10-02' }],
  });
  await anularVentaClaseSuelta(admin, { studioId: 'st', suscripcionId: 'sus-suelta-res-1', reciboId: 'rec-suelta-res-1', ahoraISO: 'x' });
  assert.equal(tablas.recibos[0].estado, 'COBRADO');
});
