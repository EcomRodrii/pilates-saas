import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  puedeEstrenarPrueba, rechazoCompraPrueba, concederClasePruebaGratis, idSuscripcionPrueba,
  elegirPlanPrueba, pruebaParaSocia, pruebaCubreTipo,
} from './clase-prueba.ts';

// Cliente falso: cada consulta encadenada acaba en `responder(tabla, op, filtros)`.
// Cuenta TODAS las consultas para poder afirmar «no tocó la base» y «no insertó».
type Filtros = Record<string, unknown>;
interface Llamada { tabla: string; op: 'select' | 'insert'; filtros: Filtros; fila?: Record<string, unknown> }
type Resp = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

function falso(responder: (l: Llamada) => Resp) {
  const llamadas: Llamada[] = [];
  const cliente = {
    from(tabla: string) {
      const l: Llamada = { tabla, op: 'select', filtros: {} };
      const q = {
        select() { return q; },
        eq(k: string, v: unknown) { l.filtros[k] = v; return q; },
        neq(k: string, v: unknown) { l.filtros[`${k}!=`] = v; return q; },
        in(k: string, v: unknown) { l.filtros[`${k}[]`] = v; return q; },
        ilike(k: string, v: unknown) { l.filtros[`${k}~`] = v; return q; },
        limit() { return q; },
        maybeSingle() { llamadas.push(l); return Promise.resolve({ error: null, ...responder(l) }); },
        insert(fila: Record<string, unknown>) {
          l.op = 'insert'; l.fila = fila; llamadas.push(l);
          return Promise.resolve({ error: null, ...responder(l) });
        },
        then(ok: (v: Resp) => unknown, ko?: (e: unknown) => unknown) {
          llamadas.push(l);
          return Promise.resolve({ error: null, ...responder(l) }).then(ok, ko);
        },
      };
      return q;
    },
  };
  return { admin: cliente as unknown as SupabaseClient, llamadas };
}

// Historial por tabla para una ficha concreta.
function historial(h: { sus?: number; res?: number; rec?: number; errorEn?: string; ficha?: string | null; fichas?: string[] }) {
  return (l: Llamada): Resp => {
    if (h.errorEn === l.tabla) return { error: { message: 'boom' } };
    if (l.tabla === 'socios') return { data: (h.fichas ?? (h.ficha ? [h.ficha] : [])).map(id => ({ id })) };
    if (l.tabla === 'suscripciones') return { count: h.sus ?? 0 };
    if (l.tabla === 'reservas') return { count: h.res ?? 0 };
    if (l.tabla === 'recibos') return { count: h.rec ?? 0 };
    return {};
  };
}

// ── puedeEstrenarPrueba ──────────────────────────────────────────────────────

test('una lead con ficha y sin historial SÍ es nueva (a diferencia de esSociaNueva)', async () => {
  const { admin } = falso(historial({}));
  assert.equal(await puedeEstrenarPrueba(admin, 'st', 'soc-1', null), true);
});

test('sin ficha por email: nueva', async () => {
  const { admin, llamadas } = falso(historial({ ficha: null }));
  assert.equal(await puedeEstrenarPrueba(admin, 'st', null, 'nueva@example.com'), true);
  assert.equal(llamadas.length, 1);
});

test('con suscripción, reserva viva o recibo cobrado: NO', async () => {
  for (const h of [{ sus: 1 }, { res: 1 }, { rec: 1 }]) {
    const { admin } = falso(historial(h));
    assert.equal(await puedeEstrenarPrueba(admin, 'st', 'soc-1', null), false, JSON.stringify(h));
  }
});

test('⚠️ dos fichas con el mismo email: se mira el historial de TODAS', async () => {
  const { admin, llamadas } = falso(historial({ fichas: ['vieja', 'nueva'], rec: 1 }));
  assert.equal(await puedeEstrenarPrueba(admin, 'st', null, 'x@example.com'), false);
  assert.deepEqual(llamadas.find(l => l.tabla === 'recibos')!.filtros['socio_id[]'], ['vieja', 'nueva']);
});

test('las reservas CANCELADAS no cuentan (el filtro va en la consulta)', async () => {
  const { admin, llamadas } = falso(historial({}));
  assert.equal(await puedeEstrenarPrueba(admin, 'st', 'soc-1', null), true);
  assert.equal(llamadas.find(l => l.tabla === 'reservas')!.filtros['estado!='], 'CANCELADA');
  assert.equal(llamadas.find(l => l.tabla === 'recibos')!.filtros.estado, 'COBRADO');
});

test('⚠️ fail-closed: cualquier error de consulta es «no»', async () => {
  for (const tabla of ['socios', 'suscripciones', 'reservas', 'recibos']) {
    const { admin } = falso(historial({ errorEn: tabla, ficha: 'soc-1' }));
    assert.equal(await puedeEstrenarPrueba(admin, 'st', null, 'x@example.com'), false, tabla);
  }
});

test('⚠️ email con `*` o sin email: «no», sin consultar', async () => {
  for (const email of ['*@example.com', '', null]) {
    const { admin, llamadas } = falso(historial({}));
    assert.equal(await puedeEstrenarPrueba(admin, 'st', null, email), false);
    assert.equal(llamadas.length, 0);
  }
});

test('los comodines del email se escapan antes del ilike', async () => {
  const { admin, llamadas } = falso(historial({ ficha: null }));
  await puedeEstrenarPrueba(admin, 'st', null, 'a_b%c@example.com');
  assert.notEqual(llamadas[0].filtros['email~'], 'a_b%c@example.com');
});

// ── rechazoCompraPrueba (los dos checkouts) ──────────────────────────────────

test('⚠️ un plan normal no toca la base', async () => {
  const { admin, llamadas } = falso(() => ({}));
  const r = await rechazoCompraPrueba(admin, { studioId: 'st', plan: { es_prueba: false, precio: 50 }, socioId: null, email: 'x@example.com', sesionId: null });
  assert.equal(r, null);
  assert.equal(llamadas.length, 0);
});

test('prueba sin clase → 400; a 0 € por Stripe → 409', async () => {
  const { admin } = falso(historial({}));
  assert.equal((await rechazoCompraPrueba(admin, { studioId: 'st', plan: { es_prueba: true, precio: 12 }, socioId: null, email: 'x@example.com', sesionId: null }))?.codigo, 'prueba-sin-clase');
  assert.equal((await rechazoCompraPrueba(admin, { studioId: 'st', plan: { es_prueba: true, precio: 0 }, socioId: null, email: 'x@example.com', sesionId: 's1' }))?.status, 409);
});

test('prueba de pago: la nueva pasa, la socia de siempre recibe 409', async () => {
  const nueva = falso(historial({ ficha: null }));
  assert.equal(await rechazoCompraPrueba(nueva.admin, { studioId: 'st', plan: { es_prueba: true, precio: 12 }, socioId: null, email: 'x@example.com', sesionId: 's1' }), null);
  const vieja = falso(historial({ rec: 3 }));
  const r = await rechazoCompraPrueba(vieja.admin, { studioId: 'st', plan: { es_prueba: true, precio: '12' }, socioId: 'soc-1', email: null, sesionId: 's1' });
  assert.equal(r?.codigo, 'prueba-no-disponible');
  assert.equal(r?.status, 409);
});

// ── concederClasePruebaGratis ────────────────────────────────────────────────

const AHORA = new Date('2026-10-01T08:00:00Z');
function gratis(o: {
  ya?: boolean; plan?: Partial<{ studio_id: string; activo: boolean; es_prueba: boolean; precio: number }>;
  tipos?: string[]; tipoSesion?: string; errorInsert?: string; historia?: { sus?: number; res?: number; rec?: number };
}) {
  return falso((l) => {
    if (l.tabla === 'suscripciones' && l.op === 'insert') return o.errorInsert ? { error: { code: o.errorInsert } } : {};
    if (l.tabla === 'suscripciones' && 'id' in l.filtros) return { data: o.ya ? { id: 'x' } : null };
    if (l.tabla === 'suscripciones') return { count: o.historia?.sus ?? 0 };
    if (l.tabla === 'planes_tarifa') return { data: { studio_id: 'st', tipo: 'PUNTUAL', precio: 0, activo: true, es_prueba: true, sesiones: 1, validez_dias: 30, ...o.plan } };
    if (l.tabla === 'sesiones') return { data: { tipo_clase_id: o.tipoSesion ?? 'tc-r', cancelada: false, inicio: '2026-10-02T09:00:00Z' } };
    if (l.tabla === 'plan_tipos_clase') return { data: (o.tipos ?? []).map(t => ({ tipo_clase_id: t })) };
    if (l.tabla === 'reservas') return { count: o.historia?.res ?? 0 };
    if (l.tabla === 'recibos') return { count: o.historia?.rec ?? 0 };
    return {};
  });
}
const base = { studioId: 'st', socioId: 'soc-1', planId: 'p-prueba', sesionId: 's1', ahora: AHORA };

test('concede la prueba con id determinista, sin recibo, con su caducidad', async () => {
  const { admin, llamadas } = gratis({});
  assert.deepEqual(await concederClasePruebaGratis(admin, base), { ok: true, concedida: true });
  const ins = llamadas.find(l => l.op === 'insert')!;
  assert.equal(ins.tabla, 'suscripciones');
  assert.equal(ins.fila!.id, idSuscripcionPrueba('soc-1'));
  assert.equal(ins.fila!.sesiones_restantes, 1);
  assert.ok(ins.fila!.fecha_fin);
  assert.ok(!llamadas.some(l => l.tabla === 'recibos' && l.op === 'insert'));
});

test('⚠️ ya la tiene: no inserta otra; una carrera (23505) también es «ya la tiene»', async () => {
  const a = gratis({ ya: true });
  assert.deepEqual(await concederClasePruebaGratis(a.admin, base), { ok: true, concedida: false });
  assert.ok(!a.llamadas.some(l => l.op === 'insert'));
  const b = gratis({ errorInsert: '23505' });
  assert.deepEqual(await concederClasePruebaGratis(b.admin, base), { ok: true, concedida: false });
});

test('⚠️ si la oferta no cubre el tipo de la clase, NO inserta nada', async () => {
  const { admin, llamadas } = gratis({ tipos: ['tc-mat'], tipoSesion: 'tc-r' });
  const r = await concederClasePruebaGratis(admin, base);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.codigo, 'prueba-no-cubre');
  assert.equal(llamadas.filter(l => l.op === 'insert').length, 0);
});

test('plan que no es prueba, de pago, inactivo o de otro estudio: no disponible', async () => {
  for (const plan of [{ es_prueba: false }, { precio: 12 }, { activo: false }, { studio_id: 'otro' }]) {
    const { admin, llamadas } = gratis({ plan });
    const r = await concederClasePruebaGratis(admin, base);
    assert.equal(!r.ok && r.codigo, 'prueba-no-disponible', JSON.stringify(plan));
    assert.equal(llamadas.filter(l => l.op === 'insert').length, 0);
  }
});

test('una socia con historial no la estrena', async () => {
  const { admin, llamadas } = gratis({ historia: { rec: 1 } });
  const r = await concederClasePruebaGratis(admin, base);
  assert.equal(!r.ok && r.codigo, 'prueba-no-disponible');
  assert.equal(llamadas.filter(l => l.op === 'insert').length, 0);
});

// ── P07: prueba a medio pagar en otra clase, y la oferta para una socia ───────

test('⚠️ prueba de pago con otra prueba viva (ABIERTO/PAGADO) en OTRA clase: 409 prueba-en-curso', async () => {
  const { admin, llamadas } = falso((l) => {
    if (l.tabla === 'pagos_clase') return { data: [{ plan_id: 'p-prueba' }] };
    if (l.tabla === 'planes_tarifa') return { data: [{ id: 'p-prueba' }] };
    return historial({})(l);
  });
  const r = await rechazoCompraPrueba(admin, { studioId: 'st', plan: { es_prueba: true, precio: 12 }, socioId: 'soc-1', email: null, sesionId: 's2' });
  assert.equal(r?.codigo, 'prueba-en-curso');
  const pc = llamadas.find((l) => l.tabla === 'pagos_clase');
  assert.deepEqual(pc?.filtros, { studio_id: 'st', pagador: 'soc-1', 'estado[]': ['ABIERTO', 'PAGADO'], 'sesion_id!=': 's2' });
});

test('el pago vivo de un plan normal en otra clase no cuenta; sin tabla (42P01), tampoco; otro error, fail-closed', async () => {
  const normal = falso((l) => (l.tabla === 'pagos_clase' ? { data: [{ plan_id: 'p-bono' }] } : l.tabla === 'planes_tarifa' ? { data: [] } : historial({})(l)));
  assert.equal(await rechazoCompraPrueba(normal.admin, { studioId: 'st', plan: { es_prueba: true, precio: 12 }, socioId: 'soc-1', email: null, sesionId: 's2' }), null);
  const sinTabla = falso((l) => (l.tabla === 'pagos_clase' ? { error: { code: '42P01' } } : historial({})(l)));
  assert.equal(await rechazoCompraPrueba(sinTabla.admin, { studioId: 'st', plan: { es_prueba: true, precio: 12 }, socioId: 'soc-1', email: null, sesionId: 's2' }), null);
  const roto = falso((l) => (l.tabla === 'pagos_clase' ? { error: { code: 'XX000' } } : historial({})(l)));
  const r = await rechazoCompraPrueba(roto.admin, { studioId: 'st', plan: { es_prueba: true, precio: 12 }, socioId: 'soc-1', email: null, sesionId: 's2' });
  assert.equal(r?.status, 409);
});

test('elegirPlanPrueba: el activo más barato, desempate por id; ignora los que no son prueba o están inactivos', () => {
  const p = (id: string, precio: number, o: Record<string, unknown> = {}) => ({ id, precio, activo: true, es_prueba: true, ...o });
  assert.equal(elegirPlanPrueba([p('b', 16), p('a', 16), p('c', 20)])?.id, 'a');
  assert.equal(elegirPlanPrueba([p('x', 5, { activo: false }), p('y', 1, { es_prueba: false }), p('z', 9)])?.id, 'z');
  assert.equal(elegirPlanPrueba([]), null);
  assert.equal(elegirPlanPrueba([p('g', 0)])?.id, 'g', 'la gratis también vale');
});

test('pruebaParaSocia: oferta con sus tipos; precio 0 = gratis', async () => {
  const { admin } = falso((l) => {
    if (l.tabla === 'planes_tarifa') return { data: [{ id: 'p1', nombre: 'Tu primera clase', precio: 0, activo: true, es_prueba: true }] };
    if (l.tabla === 'plan_tipos_clase') return { data: [{ tipo_clase_id: 'tc-r' }] };
    return historial({})(l);
  });
  assert.deepEqual(await pruebaParaSocia(admin, 'st', 'soc-1'), { planId: 'p1', nombre: 'Tu primera clase', precio: 0, gratis: true, tiposClaseIds: ['tc-r'] });
});

test('pruebaParaSocia: con historial, sin plan de prueba o con un error → null (sin plan, ni mira el historial)', async () => {
  const conHistorial = falso((l) => (l.tabla === 'planes_tarifa' ? { data: [{ id: 'p1', nombre: 'P', precio: 16, activo: true, es_prueba: true }] } : historial({ res: 1 })(l)));
  assert.equal(await pruebaParaSocia(conHistorial.admin, 'st', 'soc-1'), null);
  const sinPlan = falso((l) => (l.tabla === 'planes_tarifa' ? { data: [] } : historial({})(l)));
  assert.equal(await pruebaParaSocia(sinPlan.admin, 'st', 'soc-1'), null);
  assert.ok(!sinPlan.llamadas.some((l) => l.tabla === 'reservas'));
  const roto = falso((l) => (l.tabla === 'planes_tarifa' ? { error: { message: 'boom' } } : historial({})(l)));
  assert.equal(await pruebaParaSocia(roto.admin, 'st', 'soc-1'), null);
});

test('pruebaCubreTipo: sin tipos, todas; con tipos, solo esos', () => {
  assert.equal(pruebaCubreTipo({ tiposClaseIds: [] }, 'tc-x'), true);
  assert.equal(pruebaCubreTipo({ tiposClaseIds: ['tc-r'] }, 'tc-r'), true);
  assert.equal(pruebaCubreTipo({ tiposClaseIds: ['tc-r'] }, 'tc-m'), false);
  assert.equal(pruebaCubreTipo({ tiposClaseIds: ['tc-r'] }, null), false);
});

test('⚠️ una prueba ABIERTA y abandonada en otra clase se cierra y no bloquea; si Stripe dice que se está pagando, sí', async () => {
  const fake = () => falso((l) => {
    if (l.tabla === 'pagos_clase') return { data: [{ id: 'pc-a', estado: 'ABIERTO', plan_id: 'p-prueba' }] };
    if (l.tabla === 'planes_tarifa') return { data: [{ id: 'p-prueba' }] };
    return historial({})(l);
  });
  const p = { studioId: 'st', plan: { es_prueba: true, precio: 12 }, socioId: 'soc-1', email: null, sesionId: 's2' };
  const cerrados: string[] = [];
  const libre = await rechazoCompraPrueba(fake().admin, { ...p, cerrarPagoAbierto: async (id) => { cerrados.push(id); return 'cerrado'; } });
  assert.equal(libre, null);
  assert.deepEqual(cerrados, ['pc-a']);
  const pagandose = await rechazoCompraPrueba(fake().admin, { ...p, cerrarPagoAbierto: async () => 'pagado' });
  assert.equal(pagandose?.codigo, 'prueba-en-curso');
  const nsé = await rechazoCompraPrueba(fake().admin, { ...p, cerrarPagoAbierto: async () => 'no-se-sabe' });
  assert.equal(nsé?.status, 409);
  // Una PAGADA no se intenta cerrar: es su prueba.
  const pagada = falso((l) => (l.tabla === 'pagos_clase' ? { data: [{ id: 'pc-b', estado: 'PAGADO', plan_id: 'p-prueba' }] } : l.tabla === 'planes_tarifa' ? { data: [{ id: 'p-prueba' }] } : historial({})(l)));
  let llamado = false;
  const r = await rechazoCompraPrueba(pagada.admin, { ...p, cerrarPagoAbierto: async () => { llamado = true; return 'cerrado'; } });
  assert.equal(r?.codigo, 'prueba-en-curso');
  assert.equal(llamado, false);
});
