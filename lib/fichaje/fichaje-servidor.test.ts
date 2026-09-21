import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { editarJornada, estadoFichaje, registrarEntrada, registrarSalida } from './fichaje-servidor.ts';

// Doble en memoria del cliente de Supabase. Modela lo que estas funciones usan y
// UNA regla de la base de datos: el índice único parcial «una jornada OPEN por
// (estudio, instructora)». Cada operación cede el turno (`await`), así que dos
// llamadas simultáneas se entrelazan como en el servidor real.

type Fila = Record<string, unknown>;
interface Op { op: string; tabla: string; filtros: Record<string, unknown> }

function crearAdmin(seed: Record<string, Fila[]> = {}, opts: { carrera?: Fila } = {}) {
  const tablas: Record<string, Fila[]> = { instructor_work_sessions: [], work_session_audits: [], sesiones: [], studio_config_tiempo: [], ...seed };
  const ops: Op[] = [];
  let carreraPendiente = opts.carrera;

  const from = (tabla: string) => {
    let modo: 'select' | 'insert' | 'update' = 'select';
    let payload: Fila | Fila[] = {};
    let devuelve = false;
    let limite = Infinity;
    let orden: string | null = null;
    const filtros: Record<string, unknown> = {};
    const pred: ((f: Fila) => boolean)[] = [];

    const ejecutar = async () => {
      await Promise.resolve();
      ops.push({ op: modo, tabla, filtros: { ...filtros } });
      const filas = tablas[tabla];
      if (modo === 'insert') {
        if (carreraPendiente && tabla === 'instructor_work_sessions') { filas.push(carreraPendiente); carreraPendiente = undefined; }
        for (const nueva of (Array.isArray(payload) ? payload : [payload])) {
          if (tabla === 'instructor_work_sessions' && nueva.status === 'OPEN'
            && filas.some((f) => f.status === 'OPEN' && f.studio_id === nueva.studio_id && f.instructor_id === nueva.instructor_id)) {
            return { data: null, error: { code: '23505', message: 'llave duplicada' } };
          }
          filas.push({ ...nueva });
        }
        return { data: null, error: null };
      }
      const coinciden = filas.filter((f) => pred.every((p) => p(f)));
      if (modo === 'update') {
        for (const f of coinciden) Object.assign(f, payload);
        return { data: devuelve ? coinciden.map((f) => ({ ...f })) : null, error: null };
      }
      let r = coinciden;
      if (orden) r = [...r].sort((a, b) => String(a[orden!]).localeCompare(String(b[orden!])));
      return { data: r.slice(0, limite).map((f) => ({ ...f })), error: null };
    };

    const q = {
      select: () => { if (modo !== 'select') devuelve = true; return q; },
      insert: (p: Fila | Fila[]) => { modo = 'insert'; payload = p; return q; },
      update: (p: Fila) => { modo = 'update'; payload = p; return q; },
      eq: (k: string, v: unknown) => { filtros[k] = v; pred.push((f) => f[k] === v); return q; },
      neq: (k: string, v: unknown) => { pred.push((f) => f[k] !== v); return q; },
      gte: (k: string, v: string) => { pred.push((f) => String(f[k]) >= v); return q; },
      order: (k: string) => { orden = k; return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: async () => { const r = await ejecutar(); return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error }; },
      then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => ejecutar().then(a, b),
    };
    return q;
  };
  return { admin: { from } as unknown as SupabaseClient, tablas, ops };
}

const A = { studioId: 'sA', instructorId: 'i1', userId: 'u1' };
const T0 = new Date('2026-09-21T09:00:00.000Z');
const abiertas = (t: Record<string, Fila[]>) => t.instructor_work_sessions.filter((f) => f.status === 'OPEN');

test('entrada: crea la jornada de quien llama, en su estudio, y deja su auditoría', async () => {
  const { admin, tablas } = crearAdmin();
  const r = await registrarEntrada(admin, A, T0);
  assert.deepEqual(r, { ok: true, yaAbierta: false, auditoriaOk: true });
  const [j] = tablas.instructor_work_sessions;
  assert.equal(j.studio_id, 'sA'); assert.equal(j.instructor_id, 'i1'); assert.equal(j.created_by, 'u1');
  assert.equal(j.status, 'OPEN'); assert.equal(j.check_in_method, 'MOBILE'); assert.equal(j.check_in_at, T0.toISOString());
  assert.equal(tablas.work_session_audits.length, 1);
  assert.equal(tablas.work_session_audits[0].action, 'CHECK_IN');
  assert.equal(tablas.work_session_audits[0].work_session_id, j.id);
});

test('doble clic secuencial: la segunda entrada no crea otra jornada', async () => {
  const { admin, tablas } = crearAdmin();
  await registrarEntrada(admin, A, T0);
  const r2 = await registrarEntrada(admin, A, new Date(T0.getTime() + 1000));
  assert.deepEqual(r2, { ok: true, yaAbierta: true, auditoriaOk: true });
  assert.equal(tablas.instructor_work_sessions.length, 1);
  assert.equal(tablas.work_session_audits.length, 1);
});

test('doble clic simultáneo: una sola jornada y las dos respuestas son correctas', async () => {
  const { admin, tablas } = crearAdmin();
  const [r1, r2] = await Promise.all([registrarEntrada(admin, A, T0), registrarEntrada(admin, A, T0)]);
  assert.ok(r1.ok && r2.ok);
  assert.equal(abiertas(tablas).length, 1);
  assert.equal(tablas.instructor_work_sessions.length, 1);
  assert.equal([r1, r2].filter((r) => r.ok && !r.yaAbierta).length, 1, 'exactamente una la creó');
  assert.equal(tablas.work_session_audits.length, 1);
});

test('carrera: otra petición abre justo entre la lectura y el insert (23505) → yaAbierta', async () => {
  const rival = { id: 'rival', studio_id: 'sA', instructor_id: 'i1', status: 'OPEN', check_in_at: T0.toISOString() };
  const { admin, tablas } = crearAdmin({}, { carrera: rival });
  const r = await registrarEntrada(admin, A, T0);
  assert.deepEqual(r, { ok: true, yaAbierta: true, auditoriaOk: true });
  assert.equal(tablas.instructor_work_sessions.length, 1);
});

test('dos instructoras (y dos estudios) pueden tener cada una su jornada abierta', async () => {
  const { admin, tablas } = crearAdmin();
  await registrarEntrada(admin, A, T0);
  await registrarEntrada(admin, { ...A, instructorId: 'i2', userId: 'u2' }, T0);
  await registrarEntrada(admin, { studioId: 'sB', instructorId: 'i3', userId: 'u3' }, T0);
  assert.equal(abiertas(tablas).length, 3);
});

test('salida: cierra solo la jornada abierta de quien llama, con su duración', async () => {
  const { admin, tablas } = crearAdmin();
  await registrarEntrada(admin, A, T0);
  await registrarEntrada(admin, { ...A, instructorId: 'i2', userId: 'u2' }, T0);
  const r = await registrarSalida(admin, A, new Date(T0.getTime() + 95 * 60_000));
  assert.deepEqual(r, { ok: true, yaCerrada: false, minutos: 95, auditoriaOk: true });
  const propia = tablas.instructor_work_sessions.find((f) => f.instructor_id === 'i1')!;
  assert.equal(propia.status, 'CLOSED'); assert.equal(propia.check_out_method, 'MOBILE');
  assert.equal(tablas.instructor_work_sessions.find((f) => f.instructor_id === 'i2')!.status, 'OPEN', 'la de otra no se toca');
});

test('doble clic en salir: una única salida y una única auditoría CHECK_OUT', async () => {
  const { admin, tablas } = crearAdmin();
  await registrarEntrada(admin, A, T0);
  const t1 = new Date(T0.getTime() + 60 * 60_000);
  const [r1, r2] = await Promise.all([registrarSalida(admin, A, t1), registrarSalida(admin, A, t1)]);
  assert.ok(r1.ok && r2.ok);
  assert.equal([r1, r2].filter((r) => r.ok && r.yaCerrada).length, 1);
  assert.equal(tablas.work_session_audits.filter((f) => f.action === 'CHECK_OUT').length, 1);
  assert.equal(tablas.instructor_work_sessions[0].check_out_at, t1.toISOString());
});

test('salida sin jornada abierta: no falla, dice que ya estaba cerrada', async () => {
  const { admin, tablas } = crearAdmin();
  assert.deepEqual(await registrarSalida(admin, A, T0), { ok: true, yaCerrada: true, minutos: null, auditoriaOk: true });
  assert.equal(tablas.work_session_audits.length, 0);
});

test('salida no cruza estudios: una jornada abierta con el mismo instructor_id en otro estudio no se cierra', async () => {
  const otra = { id: 'x', studio_id: 'sB', instructor_id: 'i1', status: 'OPEN', check_in_at: T0.toISOString() };
  const { admin, tablas } = crearAdmin({ instructor_work_sessions: [otra] });
  const r = await registrarSalida(admin, A, new Date(T0.getTime() + 3600_000));
  assert.ok(r.ok && r.yaCerrada);
  assert.equal(tablas.instructor_work_sessions[0].status, 'OPEN');
});

test('todas las consultas sobre jornadas van acotadas a estudio (y a instructora salvo la edición)', async () => {
  const { admin, ops } = crearAdmin();
  await registrarEntrada(admin, A, T0);
  await registrarSalida(admin, A, new Date(T0.getTime() + 60_000));
  await estadoFichaje(admin, A, T0);
  for (const o of ops.filter((x) => x.tabla === 'instructor_work_sessions' && x.op !== 'insert')) {
    assert.equal(o.filtros.studio_id, 'sA', `${o.op} sin studio_id`);
    assert.equal(o.filtros.instructor_id, 'i1', `${o.op} sin instructor_id`);
  }
});

test('estado: la próxima clase es la SUYA (no la de otra), sin canceladas ni pasadas, con nombre', async () => {
  const cl = (id: string, instr: string, inicio: string, extra: Fila = {}) =>
    ({ id, studio_id: 'sA', instructor_id: instr, inicio, fin: new Date(Date.parse(inicio) + 3600_000).toISOString(), tipos_clase: { nombre: `C-${id}` }, ...extra });
  const { admin } = crearAdmin({ sesiones: [
    cl('ajena', 'i2', '2026-09-21T09:30:00.000Z'),
    cl('cancelada', 'i1', '2026-09-21T09:15:00.000Z', { cancelada: true }),
    cl('pasada', 'i1', '2026-09-21T07:00:00.000Z'),
    cl('lejos', 'i1', '2026-09-22T10:00:00.000Z'),
    cl('suya', 'i1', '2026-09-21T11:00:00.000Z'),
  ] });
  const e = await estadoFichaje(admin, A, T0);
  assert.equal(e.proxima?.id, 'suya'); assert.equal(e.proxima?.nombre, 'C-suya');
  assert.equal(e.abierta, null); assert.equal(e.ventanaMinutos, 10);
});

test('estado: requiere revisión pasado el límite del estudio (12 h por defecto)', async () => {
  const j = (h: number) => ({ id: 'j', studio_id: 'sA', instructor_id: 'i1', status: 'OPEN', check_in_at: new Date(T0.getTime() - h * 3600_000).toISOString() });
  assert.equal((await estadoFichaje(crearAdmin({ instructor_work_sessions: [j(2)] }).admin, A, T0)).abierta?.requiereRevision, false);
  assert.equal((await estadoFichaje(crearAdmin({ instructor_work_sessions: [j(13)] }).admin, A, T0)).abierta?.requiereRevision, true);
  const cfg = { studio_id: 'sA', check_in_window_minutes: 30, open_session_limit_hours: 1 };
  const e = await estadoFichaje(crearAdmin({ instructor_work_sessions: [j(2)], studio_config_tiempo: [cfg] }).admin, A, T0);
  assert.equal(e.abierta?.requiereRevision, true); assert.equal(e.ventanaMinutos, 30);
});

const G = { studioId: 'sA', userId: 'gestora' };
const cerrada = { id: 'j1', studio_id: 'sA', instructor_id: 'i1', status: 'CLOSED', check_in_at: '2026-09-20T08:00:00.000Z', check_out_at: '2026-09-20T12:00:00.000Z' };

test('editar: sin motivo se rechaza y no se toca nada', async () => {
  const { admin, tablas } = crearAdmin({ instructor_work_sessions: [{ ...cerrada }] });
  const r = await editarJornada(admin, G, { id: 'j1', checkInAt: new Date('2026-09-20T07:00:00Z'), motivo: '  ' }, T0);
  assert.deepEqual(r, { ok: false, status: 400, error: 'Indica el motivo del cambio' });
  assert.equal(tablas.instructor_work_sessions[0].check_in_at, cerrada.check_in_at);
});

test('editar: una jornada de otro estudio responde 404 y no cambia', async () => {
  const { admin, tablas } = crearAdmin({ instructor_work_sessions: [{ ...cerrada, studio_id: 'sB' }] });
  const r = await editarJornada(admin, G, { id: 'j1', checkInAt: new Date('2026-09-20T07:00:00Z'), motivo: 'x' }, T0);
  assert.equal(r.ok, false); assert.equal(!r.ok && r.status, 404);
  assert.equal(tablas.instructor_work_sessions[0].check_in_at, cerrada.check_in_at);
  assert.equal(tablas.work_session_audits.length, 0);
});

test('editar: mismo valor que ya había = sin cambios y sin auditoría (aunque sea otro objeto Date)', async () => {
  const { admin, tablas } = crearAdmin({ instructor_work_sessions: [{ ...cerrada }] });
  const r = await editarJornada(admin, G, { id: 'j1', checkInAt: new Date(cerrada.check_in_at), motivo: 'repasar' }, T0);
  assert.deepEqual(r, { ok: true, cambios: 0 });
  assert.equal(tablas.work_session_audits.length, 0);
});

test('editar: guarda el valor anterior, el nuevo, quién y por qué; una fila por campo', async () => {
  const { admin, tablas } = crearAdmin({ instructor_work_sessions: [{ ...cerrada }] });
  const r = await editarJornada(admin, G, {
    id: 'j1', checkInAt: new Date('2026-09-20T07:45:00Z'), checkOutAt: new Date('2026-09-20T12:30:00Z'), motivo: 'Olvidó fichar',
  }, T0);
  assert.deepEqual(r, { ok: true, cambios: 2 });
  const j = tablas.instructor_work_sessions[0];
  assert.equal(j.check_in_at, '2026-09-20T07:45:00.000Z'); assert.equal(j.check_out_at, '2026-09-20T12:30:00.000Z');
  assert.equal(j.edited_by, 'gestora'); assert.equal(j.edited_at, T0.toISOString());
  const aud = tablas.work_session_audits;
  assert.equal(aud.length, 2);
  const ent = aud.find((a) => a.field_name === 'check_in_at')!;
  assert.deepEqual([ent.action, ent.value_before, ent.value_after, ent.reason, ent.created_by],
    ['EDITED', cerrada.check_in_at, '2026-09-20T07:45:00.000Z', 'Olvidó fichar', 'gestora']);
  assert.equal(aud.find((a) => a.field_name === 'check_out_at')!.value_before, cerrada.check_out_at);
});

test('editar: poner salida a una jornada abierta la cierra y lo audita', async () => {
  const abierta = { ...cerrada, status: 'OPEN', check_out_at: null };
  const { admin, tablas } = crearAdmin({ instructor_work_sessions: [abierta] });
  const r = await editarJornada(admin, G, { id: 'j1', checkOutAt: new Date('2026-09-20T13:00:00Z'), motivo: 'Cierre manual' }, T0);
  assert.deepEqual(r, { ok: true, cambios: 2 });
  assert.equal(tablas.instructor_work_sessions[0].status, 'CLOSED');
  assert.ok(tablas.work_session_audits.some((a) => a.field_name === 'status' && a.value_before === 'OPEN' && a.value_after === 'CLOSED'));
});

test('editar: rechaza salida anterior a la entrada y fechas futuras o inválidas', async () => {
  const { admin, tablas } = crearAdmin({ instructor_work_sessions: [{ ...cerrada }] });
  const antes = await editarJornada(admin, G, { id: 'j1', checkOutAt: new Date('2026-09-20T07:00:00Z'), motivo: 'x' }, T0);
  const futura = await editarJornada(admin, G, { id: 'j1', checkOutAt: new Date('2026-09-22T00:00:00Z'), motivo: 'x' }, T0);
  const rota = await editarJornada(admin, G, { id: 'j1', checkInAt: new Date('no'), motivo: 'x' }, T0);
  for (const r of [antes, futura, rota]) { assert.equal(r.ok, false); assert.equal(!r.ok && r.status, 400); }
  assert.deepEqual(tablas.instructor_work_sessions[0], cerrada);
});

test('estado: lo cerrado HOY en hora de Madrid (no ayer, no lo abierto, no de otra)', async () => {
  // 21-sep 12:00 UTC = 14:00 en Madrid. El día del estudio empieza el 20-sep a las 22:00 UTC.
  const AHORA = new Date('2026-09-21T12:00:00.000Z');
  const f = (o: Fila) => ({ studio_id: 'sA', instructor_id: 'i1', status: 'CLOSED', ...o });
  const { admin } = crearAdmin({ instructor_work_sessions: [
    f({ id: 'hoy1', check_in_at: '2026-09-21T06:00:00.000Z', check_out_at: '2026-09-21T08:30:00.000Z' }), // 150
    f({ id: 'hoy-madrugada', check_in_at: '2026-09-20T22:30:00.000Z', check_out_at: '2026-09-20T23:00:00.000Z' }), // 00:30 Madrid → hoy, 30
    f({ id: 'ayer', check_in_at: '2026-09-20T21:30:00.000Z', check_out_at: '2026-09-20T21:45:00.000Z' }), // 23:30 Madrid del 20 → no
    f({ id: 'abierta', status: 'OPEN', check_in_at: '2026-09-21T10:00:00.000Z', check_out_at: null }),
    f({ id: 'otra', instructor_id: 'i2', check_in_at: '2026-09-21T06:00:00.000Z', check_out_at: '2026-09-21T09:00:00.000Z' }),
  ] });
  const e = await estadoFichaje(admin, A, AHORA);
  assert.deepEqual(e.hoy, { minutosCerrados: 180, jornadasCerradas: 2 });
  assert.equal(e.abierta?.id, 'abierta');
});
