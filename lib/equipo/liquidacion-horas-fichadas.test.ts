import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generarLiquidacionBorrador, transicionarLiquidacion } from './liquidacion-datos.ts';

// Liquidar por horas fichadas, capa de datos: qué lee, qué guarda y cuándo no
// deja confirmar. Doble en memoria del cliente de Supabase: solo lo que estas
// funciones usan.

type Fila = Record<string, unknown>;

function crearAdmin(tablas: Record<string, Fila[]>, opts: { falla?: string } = {}) {
  const from = (tabla: string) => {
    let modo: 'select' | 'upsert' | 'update' = 'select';
    let payload: Fila = {};
    const pred: ((f: Fila) => boolean)[] = [];
    const ejecutar = async () => {
      if (opts.falla === tabla) return { data: null, error: { message: 'caído' } };
      const filas = (tablas[tabla] ??= []);
      if (modo === 'upsert') {
        const i = filas.findIndex((f) => f.instructor_id === payload.instructor_id && f.periodo_anio === payload.periodo_anio && f.periodo_mes === payload.periodo_mes);
        if (i >= 0) filas[i] = { ...filas[i], ...payload }; else filas.push({ ...payload });
        return { data: [{ ...filas[i >= 0 ? i : filas.length - 1] }], error: null };
      }
      const coinciden = filas.filter((f) => pred.every((p) => p(f)));
      if (modo === 'update') { for (const f of coinciden) Object.assign(f, payload); return { data: coinciden.map((f) => ({ ...f })), error: null }; }
      return { data: coinciden.map((f) => ({ ...f })), error: null };
    };
    const q = {
      select: () => q,
      upsert: (p: Fila) => { modo = 'upsert'; payload = p; return q; },
      update: (p: Fila) => { modo = 'update'; payload = p; return q; },
      eq: (k: string, v: unknown) => { pred.push((f) => f[k] === v); return q; },
      in: (k: string, v: unknown[]) => { pred.push((f) => v.includes(f[k])); return q; },
      gte: (k: string, v: string) => { pred.push((f) => String(f[k]) >= v); return q; },
      lt: (k: string, v: string) => { pred.push((f) => String(f[k]) < v); return q; },
      maybeSingle: async () => { const r = await ejecutar(); return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error }; },
      then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => ejecutar().then(a, b),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const base = (liquidarPor: string | null): Record<string, Fila[]> => ({
  instructor_tarifas: [{ instructor_id: 'i1', studio_id: 's1', tarifa_hora: 20, base_mensual_eur: 0, recargo_sustitucion_pct: 50 }],
  sesiones: [{ id: 'c1', studio_id: 's1', instructor_id: 'i1', cancelada: false, inicio: '2026-09-10T08:00:00.000Z', fin: '2026-09-10T09:00:00.000Z' }],
  sustituciones: [],
  studios: [{ id: 's1', instructor_reparto_penalizacion_pct: null }],
  penalizaciones: [],
  studio_config_tiempo: liquidarPor ? [{ studio_id: 's1', liquidar_por: liquidarPor }] : [],
  instructor_work_sessions: [
    { studio_id: 's1', instructor_id: 'i1', status: 'CLOSED', check_in_at: '2026-09-10T07:00:00.000Z', check_out_at: '2026-09-10T11:30:00.000Z' },
    { studio_id: 's1', instructor_id: 'i1', status: 'CLOSED', check_in_at: '2026-09-11T07:00:00.000Z', check_out_at: '2026-09-11T08:00:00.000Z' },
    // Otro mes, otra instructora y otro estudio: no cuentan.
    { studio_id: 's1', instructor_id: 'i1', status: 'CLOSED', check_in_at: '2026-08-10T07:00:00.000Z', check_out_at: '2026-08-10T17:00:00.000Z' },
    { studio_id: 's1', instructor_id: 'i2', status: 'CLOSED', check_in_at: '2026-09-10T07:00:00.000Z', check_out_at: '2026-09-10T17:00:00.000Z' },
    { studio_id: 's2', instructor_id: 'i1', status: 'CLOSED', check_in_at: '2026-09-10T07:00:00.000Z', check_out_at: '2026-09-10T17:00:00.000Z' },
  ],
  liquidaciones_instructoras: [],
});

test('sin configuración, o por clases: paga la clase como siempre y no lee el fichaje', async () => {
  for (const cfg of [null, 'CLASES']) {
    const t = base(cfg);
    t.instructor_work_sessions = []; // si lo leyera, daría 0 h
    const r = await generarLiquidacionBorrador(crearAdmin(t), 's1', 'i1', 2026, 9);
    assert.equal(r.row?.modo, 'CLASES', String(cfg));
    assert.equal(r.row?.variablePropiasEur, 20);
    assert.equal(r.row?.minutosFichados, null);
  }
});

test('por horas fichadas: suma solo las jornadas cerradas de ESA instructora, ese estudio y ese mes', async () => {
  const t = base('HORAS_FICHADAS');
  const r = await generarLiquidacionBorrador(crearAdmin(t), 's1', 'i1', 2026, 9);
  assert.equal(r.error, undefined);
  assert.equal(r.row?.modo, 'HORAS_FICHADAS');
  assert.equal(r.row?.minutosFichados, 330); // 4 h 30 + 1 h
  assert.equal(r.row?.variablePropiasEur, 110); // 5,5 h × 20
  assert.equal(r.row?.jornadasSinCerrar, 0);
  assert.equal(t.liquidaciones_instructoras[0].modo, 'HORAS_FICHADAS');
  assert.equal(t.liquidaciones_instructoras[0].minutos_fichados, 330);
});

test('por horas fichadas: con jornadas sin cerrar se genera el borrador pero NO se puede confirmar', async () => {
  const t = base('HORAS_FICHADAS');
  t.instructor_work_sessions.push(
    { studio_id: 's1', instructor_id: 'i1', status: 'OPEN', check_in_at: '2026-09-12T07:00:00.000Z', check_out_at: null },
    { studio_id: 's1', instructor_id: 'i1', status: 'PENDING_REVIEW', check_in_at: '2026-09-13T07:00:00.000Z', check_out_at: '2026-09-13T20:00:00.000Z' },
  );
  const admin = crearAdmin(t);
  const g = await generarLiquidacionBorrador(admin, 's1', 'i1', 2026, 9);
  assert.equal(g.row?.jornadasSinCerrar, 2);
  assert.equal(g.row?.minutosFichados, 330, 'la de por revisar no se paga');
  t.liquidaciones_instructoras[0].id = 'liq-1';
  t.liquidaciones_instructoras[0].studio_id = 's1';
  const c = await transicionarLiquidacion(admin, 'liq-1', 's1', 'confirmar', 'u-duena');
  assert.match(c.error ?? '', /Hay 2 jornadas de este mes sin cerrar/);
  assert.equal(t.liquidaciones_instructoras[0].estado, 'BORRADOR');
});

test('por horas fichadas sin nada pendiente: confirma', async () => {
  const t = base('HORAS_FICHADAS');
  const admin = crearAdmin(t);
  await generarLiquidacionBorrador(admin, 's1', 'i1', 2026, 9);
  t.liquidaciones_instructoras[0].id = 'liq-1';
  const c = await transicionarLiquidacion(admin, 'liq-1', 's1', 'confirmar', 'u-duena');
  assert.equal(c.error, undefined);
  assert.equal(t.liquidaciones_instructoras[0].estado, 'CONFIRMADA');
});

test('si el fichaje no se puede leer, no genera un borrador con 0 h', async () => {
  const t = base('HORAS_FICHADAS');
  const r = await generarLiquidacionBorrador(crearAdmin(t, { falla: 'instructor_work_sessions' }), 's1', 'i1', 2026, 9);
  assert.match(r.error ?? '', /No se ha podido leer el fichaje/);
  assert.equal(t.liquidaciones_instructoras.length, 0);
});

test('una liquidación ya confirmada no se recalcula aunque el estudio cambie a horas', async () => {
  const t = base('HORAS_FICHADAS');
  t.liquidaciones_instructoras.push({ id: 'liq-1', studio_id: 's1', instructor_id: 'i1', periodo_anio: 2026, periodo_mes: 9, estado: 'CONFIRMADA', modo: 'CLASES' });
  const r = await generarLiquidacionBorrador(crearAdmin(t), 's1', 'i1', 2026, 9);
  assert.match(r.error ?? '', /ya está confirmada/);
  assert.equal(t.liquidaciones_instructoras[0].modo, 'CLASES');
});
