import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anularVentaClaseSuelta, prepararVentaClaseSuelta, quedaTrasAnular } from './clase-suelta-mostrador.ts';

// Un admin de mentira: guarda filas por tabla, aplica los `.eq`/`.is` de los
// update (compare-and-set) y apunta cada escritura. `fallos`:
//  · `insert`: el INSERT de esa tabla falla con ese código sin guardar nada;
//  · `insertQueGuarda`: falla con ese código PERO la fila queda guardada (un
//    504 de la pasarela con el INSERT ya hecho);
//  · `update`: cuántas veces seguidas falla el UPDATE de esa tabla.
type Fila = Record<string, unknown>;
function adminFalso(
  inicial: { suscripciones?: Fila[]; recibos?: Fila[] } = {},
  fallos: { insert?: Record<string, string>; insertQueGuarda?: Record<string, string>; update?: Record<string, number> } = {},
) {
  const tablas: Record<string, Fila[]> = { suscripciones: [...(inicial.suscripciones ?? [])], recibos: [...(inicial.recibos ?? [])] };
  const escrituras: string[] = [];
  const fallosUpdate: Record<string, number> = { ...(fallos.update ?? {}) };
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
        then(resolver: (r: { data: Fila[] | null; error: { message: string } | null }) => unknown) {
          if (!cambios) return Promise.resolve({ data: tablas[tabla].filter(coincide), error: null }).then(resolver);
          if ((fallosUpdate[tabla] ?? 0) > 0) {
            fallosUpdate[tabla]--;
            return Promise.resolve({ data: null, error: { message: 'se cortó' } }).then(resolver);
          }
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
          const guardaYFalla = fallos.insertQueGuarda?.[tabla];
          return { error: guardaYFalla ? { code: guardaYFalla, message: 'la pasarela no contestó' } : null };
        },
        select: () => cadena,
        update: (vals: Fila) => { cambios = vals; return cadena; },
      };
    },
  };
  return { admin: admin as unknown as SupabaseClient, tablas, escrituras };
}

const ANULAR = { studioId: 'st', suscripcionId: 'sus-suelta-res-1', reciboId: 'rec-suelta-res-1', ahoraISO: '2026-10-02T10:00:00.000Z' };
const callado = () => {};

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
  assert.deepEqual(r, { ok: false, status: 500, error: 'No se ha podido apuntar la clase suelta. Inténtalo otra vez.', queda: 'nada' });
  assert.equal(tablas.suscripciones[0].estado, 'CANCELADA');
  assert.equal(tablas.suscripciones[0].sesiones_restantes, 0);
});

test('⚠️ un error al crear la clase suelta que SÍ la guardó (504) no deja una clase gratis sin recibo', async () => {
  const { admin, tablas } = adminFalso({}, { insertQueGuarda: { suscripciones: '57014' } });
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.equal(r.ok, false);
  assert.equal(tablas.suscripciones[0].estado, 'CANCELADA', 'quedaba ACTIVA con su sesión: la siguiente reserva la gastaba gratis');
  assert.equal(tablas.recibos.length, 0);
});

test('si el recibo que había no cuadra, la clase suelta que ESTA llamada acaba de crear se deshace', async () => {
  const { admin, tablas } = adminFalso({
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', socio_id: 'soc-1', importe: 20, estado: 'PENDIENTE' }],
  });
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.equal(r.ok, false);
  assert.equal(tablas.suscripciones[0].estado, 'CANCELADA');
  // El recibo que ya había no es de esta venta: no se toca, se manda a revisar.
  assert.equal(tablas.recibos[0].estado, 'PENDIENTE');
});

test('anular: primero la clase suelta y, solo si estaba sin gastar, el recibo', async () => {
  const { admin, tablas, escrituras } = adminFalso();
  await prepararVentaClaseSuelta(admin, VENTA);
  const r = await anularVentaClaseSuelta(admin, ANULAR, callado);
  assert.equal(r, 'anulada');
  assert.deepEqual(escrituras.slice(-2), ['update suscripciones sus-suelta-res-1', 'update recibos rec-suelta-res-1']);
  assert.equal(tablas.recibos[0].estado, 'ANULADO');
  assert.equal(tablas.recibos[0].anulado_en, '2026-10-02T10:00:00.000Z', 'ANULADO exige anulado_en (CHECK de la base de datos)');
});

test('anular no toca nada si la sesión ya se gastó: esa venta sí sirvió', async () => {
  const { admin, tablas } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'ACTIVA', sesiones_restantes: 0 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'PENDIENTE', fecha_cobro: null }],
  });
  const r = await anularVentaClaseSuelta(admin, ANULAR, callado);
  assert.equal(r, 'servida');
  assert.equal(tablas.recibos[0].estado, 'PENDIENTE');
});

test('anular termina lo que dejó a medias un intento anterior (la suscripción ya cancelada, el recibo aún pendiente)', async () => {
  const { admin, tablas } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'CANCELADA', sesiones_restantes: 0 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'PENDIENTE', fecha_cobro: null }],
  });
  assert.equal(await anularVentaClaseSuelta(admin, ANULAR, callado), 'anulada');
  assert.equal(tablas.recibos[0].estado, 'ANULADO');
});

test('anular reintenta el recibo una vez; si sigue sin poder, lo avisa y no dice «anulada»', async () => {
  const una = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'ACTIVA', sesiones_restantes: 1 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'PENDIENTE', fecha_cobro: null }],
  }, { update: { recibos: 1 } });
  assert.equal(await anularVentaClaseSuelta(una.admin, ANULAR, callado), 'anulada');
  assert.equal(una.tablas.recibos[0].estado, 'ANULADO');

  const avisos: string[] = [];
  const dos = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'ACTIVA', sesiones_restantes: 1 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'PENDIENTE', fecha_cobro: null }],
  }, { update: { recibos: 2 } });
  assert.equal(await anularVentaClaseSuelta(dos.admin, ANULAR, m => avisos.push(m)), 'fallo');
  assert.equal(dos.tablas.recibos[0].estado, 'PENDIENTE');
  assert.equal(avisos.length, 1, 'un recibo pendiente sin plaza tiene que verse');
});

test('anular nunca toca un recibo cobrado, y lo avisa', async () => {
  const avisos: string[] = [];
  const { admin, tablas } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'ACTIVA', sesiones_restantes: 1 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'COBRADO', fecha_cobro: '2026-10-02' }],
  });
  // `sin-deshacer`, no `fallo`: el recibo no «sobra» en «Quién me debe», está cobrado.
  assert.equal(await anularVentaClaseSuelta(admin, ANULAR, m => avisos.push(m)), 'sin-deshacer');
  assert.equal(tablas.recibos[0].estado, 'COBRADO');
  assert.equal(avisos.length, 1);
});

test('si la suscripción no se puede cancelar, no se sigue con el recibo', async () => {
  const { admin, tablas } = adminFalso({
    suscripciones: [{ id: 'sus-suelta-res-1', studio_id: 'st', estado: 'ACTIVA', sesiones_restantes: 1 }],
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', estado: 'PENDIENTE', fecha_cobro: null }],
  }, { update: { suscripciones: 1 } });
  // ⚠️ `sin-deshacer`: la clase suelta puede seguir ACTIVA. Decir «borra el recibo
  // que sobra» la dejaría gratis.
  assert.equal(await anularVentaClaseSuelta(admin, ANULAR, callado), 'sin-deshacer');
  assert.equal(tablas.recibos[0].estado, 'PENDIENTE');
});

test('qué se le dice a recepción según lo que dejó la venta que sobraba', () => {
  assert.equal(quedaTrasAnular(null), 'nada', 'sin venta, nada');
  assert.equal(quedaTrasAnular('anulada'), 'nada');
  assert.equal(quedaTrasAnular('fallo'), 'recibo', 'la clase suelta se deshizo y queda su recibo pendiente: ese sí se borra');
  assert.equal(quedaTrasAnular('servida'), 'revisar', 'su sesión se gastó: la reserva pudo hacerse por otro lado');
  assert.equal(quedaTrasAnular('sin-deshacer'), 'revisar', 'la clase suelta puede seguir viva: nunca «borra el recibo»');
});

test('si una suscripción creada AQUÍ sobra por un recibo ajeno y no se puede cancelar, se manda a revisar', async () => {
  const { admin, tablas } = adminFalso({
    recibos: [{ id: 'rec-suelta-res-1', studio_id: 'st', socio_id: 'soc-1', importe: 20, estado: 'PENDIENTE' }],
  }, { update: { suscripciones: 1 } });
  const r = await prepararVentaClaseSuelta(admin, VENTA);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.queda, 'revisar');
  assert.equal(tablas.suscripciones[0].estado, 'ACTIVA', 'no se pudo cancelar: sigue viva, de ahí el «revisar»');
});
