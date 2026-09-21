import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cambiarFinClase, confirmarClases, empezarClase, estadoClasesInstructora, estadoDeClase, jornadaCubre,
  marcarDadaPorLista, retrasoMinutos, type FilaClase, type SesionClase,
} from './clases-impartidas.ts';

// ── Reglas puras ─────────────────────────────────────────────────────────────

const S = (o: Partial<SesionClase> = {}): SesionClase => ({
  id: 's1', inicio: '2026-09-23T16:00:00.000Z', fin: '2026-09-23T17:00:00.000Z', cancelada: false, nombre: 'Reformer', ...o,
});
const en = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000);
const DADA = (o: Partial<FilaClase> = {}): FilaClase => ({ sesion_id: 's1', estado: 'DADA', inicio_real: '2026-09-23T16:00:00.000Z', fin_real: null, origen: 'BOTON', ...o });

test('estado: futura → empezable 15 min antes → sin confirmar al terminar sin nada', () => {
  const s = S();
  assert.equal(estadoDeClase(s, null, [], 'AUTONOMA', en(s.inicio, -16)).estado, 'FUTURA');
  assert.equal(estadoDeClase(s, null, [], 'AUTONOMA', en(s.inicio, -15)).estado, 'EMPEZABLE');
  assert.equal(estadoDeClase(s, null, [], 'AUTONOMA', en(s.inicio, 30)).estado, 'EMPEZABLE', 'aún se puede empezar tarde');
  assert.equal(estadoDeClase(s, null, [], 'AUTONOMA', en(s.fin, 1)).estado, 'SIN_CONFIRMAR');
});

test('estado: empezada = en curso hasta su fin; termina sola; «terminé antes» la cierra; no dada; cancelada', () => {
  const s = S();
  assert.equal(estadoDeClase(s, DADA(), [], null, en(s.inicio, 20)).estado, 'EN_CURSO');
  assert.equal(estadoDeClase(s, DADA(), [], null, en(s.fin, 0)).estado, 'DADA');
  assert.equal(estadoDeClase(s, DADA({ fin_real: '2026-09-23T16:40:00.000Z' }), [], null, en(s.inicio, 45)).estado, 'DADA');
  assert.equal(estadoDeClase(s, { ...DADA(), estado: 'NO_DADA', inicio_real: null }, [], null, en(s.fin, 5)).estado, 'NO_DADA');
  assert.equal(estadoDeClase(S({ cancelada: true }), DADA(), [], null, en(s.fin, 5)).estado, 'CANCELADA');
});

test('estado: contratada con jornada que cubre la clase = dada sola; autónoma nunca por jornada', () => {
  const s = S();
  const jornada = [{ desde: '2026-09-23T15:30:00.000Z', hasta: '2026-09-23T19:00:00.000Z' }];
  assert.deepEqual(estadoDeClase(s, null, jornada, 'CONTRATADA', en(s.fin, 10)), { estado: 'DADA', porJornada: true });
  assert.deepEqual(estadoDeClase(s, null, jornada, null, en(s.fin, 10)), { estado: 'DADA', porJornada: true });
  assert.equal(estadoDeClase(s, null, jornada, 'AUTONOMA', en(s.fin, 10)).estado, 'SIN_CONFIRMAR');
});

test('jornada cubre si solapa al menos la mitad; una abierta cuenta hasta ahora', () => {
  const s = S();
  assert.equal(jornadaCubre(s, [{ desde: '2026-09-23T16:25:00.000Z', hasta: '2026-09-23T18:00:00.000Z' }], en(s.fin, 60)), true);
  assert.equal(jornadaCubre(s, [{ desde: '2026-09-23T16:35:00.000Z', hasta: '2026-09-23T18:00:00.000Z' }], en(s.fin, 60)), false);
  assert.equal(jornadaCubre(s, [{ desde: '2026-09-23T15:50:00.000Z', hasta: null }], en(s.fin, 60)), true);
});

test('clases anteriores al lanzamiento no se preguntan', () => {
  const vieja = S({ inicio: '2026-09-20T16:00:00.000Z', fin: '2026-09-20T17:00:00.000Z' });
  assert.equal(estadoDeClase(vieja, null, [], 'AUTONOMA', new Date('2026-09-23T10:00:00.000Z')).estado, 'PREVIA');
});

test('retraso: solo con el botón y solo si empezó después de la hora', () => {
  const s = S();
  assert.equal(retrasoMinutos(s, DADA({ inicio_real: '2026-09-23T16:08:00.000Z' })), 8);
  assert.equal(retrasoMinutos(s, DADA({ inicio_real: s.inicio })), 0);
  assert.equal(retrasoMinutos(s, null), 0);
});

// ── Base de datos (doble en memoria) ─────────────────────────────────────────

type Fila = Record<string, unknown>;
function crearAdmin(seed: Record<string, Fila[]> = {}) {
  const tablas: Record<string, Fila[]> = {
    sesiones: [], clases_impartidas: [], clases_impartidas_auditoria: [], instructor_tarifas: [],
    instructor_work_sessions: [], work_session_audits: [], ...seed,
  };
  const from = (tabla: string) => {
    let modo: 'select' | 'insert' | 'update' = 'select';
    let payload: Fila = {};
    let devuelve = false;
    const pred: ((f: Fila) => boolean)[] = [];
    const ejecutar = async () => {
      await Promise.resolve();
      const filas = (tablas[tabla] ??= []);
      if (modo === 'insert') {
        if (tabla === 'clases_impartidas' && filas.some((f) => f.sesion_id === payload.sesion_id)) return { data: null, error: { code: '23505', message: 'dup' } };
        if (tabla === 'instructor_work_sessions' && payload.status === 'OPEN'
          && filas.some((f) => f.status === 'OPEN' && f.instructor_id === payload.instructor_id && f.studio_id === payload.studio_id)) {
          return { data: null, error: { code: '23505', message: 'dup' } };
        }
        filas.push({ ...payload });
        return { data: null, error: null };
      }
      const hits = filas.filter((f) => pred.every((p) => p(f)));
      if (modo === 'update') { for (const f of hits) Object.assign(f, payload); return { data: devuelve ? hits.map((f) => ({ ...f })) : null, error: null }; }
      return { data: hits.map((f) => ({ ...f })), error: null };
    };
    const q = {
      select: () => { if (modo !== 'select') devuelve = true; return q; },
      insert: (p: Fila) => { modo = 'insert'; payload = p; return q; },
      update: (p: Fila) => { modo = 'update'; payload = p; return q; },
      eq: (k: string, v: unknown) => { pred.push((f) => f[k] === v); return q; },
      neq: (k: string, v: unknown) => { pred.push((f) => f[k] !== v); return q; },
      in: (k: string, v: unknown[]) => { pred.push((f) => v.includes(f[k])); return q; },
      is: (k: string, v: unknown) => { pred.push((f) => (f[k] ?? null) === v); return q; },
      gte: (k: string, v: string) => { pred.push((f) => String(f[k]) >= v); return q; },
      lte: (k: string, v: string) => { pred.push((f) => String(f[k]) <= v); return q; },
      order: () => q,
      maybeSingle: async () => { const r = await ejecutar(); return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error }; },
      then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => ejecutar().then(a, b),
    };
    return q;
  };
  return { admin: { from } as unknown as SupabaseClient, tablas };
}

const C = { studioId: 'sA', instructorId: 'i1', userId: 'u1' };
const ses = (id: string, inicio: string, min = 60, o: Fila = {}) => ({
  id, studio_id: 'sA', instructor_id: 'i1', inicio, fin: new Date(Date.parse(inicio) + min * 60_000).toISOString(),
  cancelada: false, tipos_clase: { nombre: `Clase ${id}` }, ...o,
});

test('empezar: guarda la hora real (a su hora si llega antes, la real si llega tarde) y audita', async () => {
  const { admin, tablas } = crearAdmin({ sesiones: [ses('a', '2026-09-23T16:00:00.000Z'), ses('b', '2026-09-23T18:00:00.000Z')] });
  const r1 = await empezarClase(admin, C, 'a', new Date('2026-09-23T15:50:00.000Z'));
  assert.deepEqual(r1, { ok: true, yaEmpezada: false, jornadaAbierta: false });
  assert.equal(tablas.clases_impartidas[0].inicio_real, '2026-09-23T16:00:00.000Z');
  assert.equal(tablas.clases_impartidas[0].origen, 'BOTON');
  await empezarClase(admin, C, 'b', new Date('2026-09-23T18:07:00.000Z'));
  assert.equal(tablas.clases_impartidas[1].inicio_real, '2026-09-23T18:07:00.000Z');
  assert.deepEqual(tablas.clases_impartidas_auditoria.map((a) => a.accion), ['EMPEZADA', 'EMPEZADA']);
});

test('empezar: fuera de la ventana, cancelada, ajena o ya dicha «no la di» → no escribe nada', async () => {
  const { admin, tablas } = crearAdmin({ sesiones: [
    ses('a', '2026-09-23T16:00:00.000Z'), ses('c', '2026-09-23T16:00:00.000Z', 60, { cancelada: true }),
    ses('x', '2026-09-23T16:00:00.000Z', 60, { instructor_id: 'otra' }),
  ] });
  const pronto = await empezarClase(admin, C, 'a', new Date('2026-09-23T15:40:00.000Z'));
  const tarde = await empezarClase(admin, C, 'a', new Date('2026-09-23T17:01:00.000Z'));
  const cancelada = await empezarClase(admin, C, 'c', new Date('2026-09-23T16:00:00.000Z'));
  const ajena = await empezarClase(admin, C, 'x', new Date('2026-09-23T16:00:00.000Z'));
  for (const r of [pronto, tarde, cancelada]) assert.equal(r.ok ? 0 : r.status, 409);
  assert.equal(ajena.ok ? 0 : ajena.status, 404);
  assert.equal(tablas.clases_impartidas.length, 0);
});

test('empezar dos veces: una sola fila (doble toque)', async () => {
  const { admin, tablas } = crearAdmin({ sesiones: [ses('a', '2026-09-23T16:00:00.000Z')] });
  const [r1, r2] = await Promise.all([
    empezarClase(admin, C, 'a', new Date('2026-09-23T16:01:00.000Z')),
    empezarClase(admin, C, 'a', new Date('2026-09-23T16:01:00.000Z')),
  ]);
  assert.ok(r1.ok && r2.ok);
  assert.equal(tablas.clases_impartidas.length, 1);
});

test('clases seguidas: empezar la siguiente cierra la que seguía en curso a esa hora', async () => {
  // La primera iba hasta las 17:15, la segunda empieza a las 17:00.
  const { admin, tablas } = crearAdmin({ sesiones: [ses('a', '2026-09-23T16:00:00.000Z', 75), ses('b', '2026-09-23T17:00:00.000Z')] });
  await empezarClase(admin, C, 'a', new Date('2026-09-23T16:00:00.000Z'));
  await empezarClase(admin, C, 'b', new Date('2026-09-23T17:02:00.000Z'));
  const a = tablas.clases_impartidas.find((f) => f.sesion_id === 'a')!;
  assert.equal(a.fin_real, '2026-09-23T17:02:00.000Z');
  assert.ok(tablas.clases_impartidas_auditoria.some((x) => x.sesion_id === 'a' && x.accion === 'FIN_CAMBIADO'));
});

test('contratada: empezar le abre la jornada si no la tenía; autónoma y sin definir, no', async () => {
  for (const [rel, espera] of [['CONTRATADA', true], ['AUTONOMA', false], [null, false]] as const) {
    const { admin, tablas } = crearAdmin({
      sesiones: [ses('a', '2026-09-23T16:00:00.000Z')],
      instructor_tarifas: rel ? [{ instructor_id: 'i1', studio_id: 'sA', relacion_laboral: rel }] : [],
    });
    const r = await empezarClase(admin, C, 'a', new Date('2026-09-23T16:02:00.000Z'));
    assert.equal(r.ok && r.jornadaAbierta, espera, String(rel));
    assert.equal(tablas.instructor_work_sessions.length, espera ? 1 : 0, String(rel));
  }
});

test('terminé antes: solo en curso, posterior al inicio y no en el futuro', async () => {
  const { admin, tablas } = crearAdmin({ sesiones: [ses('a', '2026-09-23T16:00:00.000Z')] });
  await empezarClase(admin, C, 'a', new Date('2026-09-23T16:00:00.000Z'));
  const antesDeEmpezar = await cambiarFinClase(admin, C, 'a', new Date('2026-09-23T15:59:00.000Z'), new Date('2026-09-23T16:40:00.000Z'));
  const futuro = await cambiarFinClase(admin, C, 'a', new Date('2026-09-23T16:55:00.000Z'), new Date('2026-09-23T16:40:00.000Z'));
  assert.equal(antesDeEmpezar.ok, false); assert.equal(futuro.ok, false);
  const ok = await cambiarFinClase(admin, C, 'a', new Date('2026-09-23T16:40:00.000Z'), new Date('2026-09-23T16:41:00.000Z'));
  assert.deepEqual(ok, { ok: true });
  assert.equal(tablas.clases_impartidas[0].fin_real, '2026-09-23T16:40:00.000Z');
  const yaTerminada = await cambiarFinClase(admin, C, 'a', new Date('2026-09-23T16:30:00.000Z'), new Date('2026-09-23T16:45:00.000Z'));
  assert.equal(yaTerminada.ok ? 0 : yaTerminada.status, 409);
});

test('confirmar olvidadas: a su hora, con otro horario y «no la di»; valida cada una por separado', async () => {
  const { admin, tablas } = crearAdmin({ sesiones: [
    ses('a', '2026-09-23T08:00:00.000Z'), ses('b', '2026-09-23T10:00:00.000Z'), ses('c', '2026-09-23T12:00:00.000Z'),
    ses('d', '2026-09-23T20:00:00.000Z'), ses('e', '2026-09-23T14:00:00.000Z'),
  ] });
  const AHORA = new Date('2026-09-23T18:00:00.000Z');
  const r = await confirmarClases(admin, C, [
    { sesionId: 'a', modo: 'A_SU_HORA' },
    { sesionId: 'b', modo: 'OTRO_HORARIO', inicio: new Date('2026-09-23T10:10:00.000Z'), fin: new Date('2026-09-23T11:00:00.000Z') },
    { sesionId: 'c', modo: 'NO_DADA' },
    { sesionId: 'd', modo: 'A_SU_HORA' }, // aún no ha pasado
    { sesionId: 'e', modo: 'OTRO_HORARIO', inicio: new Date('2026-09-23T15:00:00.000Z'), fin: new Date('2026-09-23T14:30:00.000Z') },
  ], AHORA);
  assert.ok(r.ok);
  assert.equal(r.ok && r.confirmadas, 3);
  assert.deepEqual(r.ok && r.errores.map((e) => e.sesionId), ['d', 'e']);
  const porId = Object.fromEntries(tablas.clases_impartidas.map((f) => [f.sesion_id as string, f]));
  assert.equal(porId.a.inicio_real, '2026-09-23T08:00:00.000Z'); assert.equal(porId.a.fin_real, null);
  assert.equal(porId.b.inicio_real, '2026-09-23T10:10:00.000Z'); assert.equal(porId.b.fin_real, '2026-09-23T11:00:00.000Z');
  assert.equal(porId.c.estado, 'NO_DADA');
  assert.equal(Object.values(porId).every((f) => f.origen === 'CONFIRMACION'), true);
});

test('confirmar: nunca clases anteriores al lanzamiento ni de hace más de 14 días', async () => {
  const { admin, tablas } = crearAdmin({ sesiones: [ses('vieja', '2026-09-20T08:00:00.000Z'), ses('antigua', '2026-10-01T08:00:00.000Z')] });
  const r = await confirmarClases(admin, C, [{ sesionId: 'vieja', modo: 'A_SU_HORA' }], new Date('2026-09-23T10:00:00.000Z'));
  const r2 = await confirmarClases(admin, C, [{ sesionId: 'antigua', modo: 'A_SU_HORA' }], new Date('2026-10-20T10:00:00.000Z'));
  assert.equal(r.ok && r.errores.length, 1); assert.equal(r2.ok && r2.errores.length, 1);
  assert.equal(tablas.clases_impartidas.length, 0);
});

test('pasar lista da la clase por dada a su hora, y no pisa lo que ya había', async () => {
  const { admin, tablas } = crearAdmin({ sesiones: [ses('a', '2026-09-23T16:00:00.000Z')] });
  await marcarDadaPorLista(admin, C, { id: 'a', inicio: '2026-09-23T16:00:00.000Z' });
  await marcarDadaPorLista(admin, C, { id: 'a', inicio: '2026-09-23T16:00:00.000Z' });
  assert.equal(tablas.clases_impartidas.length, 1);
  assert.equal(tablas.clases_impartidas[0].origen, 'LISTA');
  assert.equal(tablas.clases_impartidas_auditoria.length, 1);
});

test('estado de la instructora: la clase actual (en curso gana) y sus olvidadas, solo suyas', async () => {
  const AHORA = new Date('2026-09-24T16:10:00.000Z');
  const { admin } = crearAdmin({
    sesiones: [
      ses('olv', '2026-09-23T10:00:00.000Z'),
      ses('dada', '2026-09-23T12:00:00.000Z'),
      ses('ahora', '2026-09-24T16:00:00.000Z'),
      ses('luego', '2026-09-24T16:20:00.000Z'),
      ses('ajena', '2026-09-23T14:00:00.000Z', 60, { instructor_id: 'otra' }),
      ses('cancel', '2026-09-23T15:00:00.000Z', 60, { cancelada: true }),
    ],
    clases_impartidas: [
      { sesion_id: 'dada', studio_id: 'sA', instructor_id: 'i1', estado: 'DADA', inicio_real: '2026-09-23T12:00:00.000Z', fin_real: null, origen: 'LISTA' },
      { sesion_id: 'ahora', studio_id: 'sA', instructor_id: 'i1', estado: 'DADA', inicio_real: '2026-09-24T16:03:00.000Z', fin_real: null, origen: 'BOTON' },
    ],
  });
  const e = await estadoClasesInstructora(admin, C, AHORA);
  assert.equal(e.actual?.id, 'ahora');
  assert.equal(e.actual?.estado, 'EN_CURSO');
  assert.equal(e.actual?.inicioReal, '2026-09-24T16:03:00.000Z');
  assert.deepEqual(e.pendientes.map((p) => p.id), ['olv']);
  assert.equal(e.relacion, null);
});
