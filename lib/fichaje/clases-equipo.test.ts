import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { corregirClases, marcarRevisada, resumirClases, type ClaseEquipo } from './clases-equipo.ts';

// Lo que quien gestiona el equipo puede cambiar de una clase, y lo que no. Doble
// en memoria del cliente de Supabase: solo lo que estas funciones usan.

type Fila = Record<string, unknown>;

function crearAdmin(tablas: Record<string, Fila[]>) {
  const from = (tabla: string) => {
    let modo: 'select' | 'insert' | 'update' = 'select';
    let payload: Fila = {};
    const pred: ((f: Fila) => boolean)[] = [];
    const ejecutar = async () => {
      const filas = (tablas[tabla] ??= []);
      if (modo === 'insert') {
        if (tabla === 'clases_impartidas' && filas.some((f) => f.sesion_id === payload.sesion_id)) {
          return { data: null, error: { code: '23505', message: 'duplicada' } };
        }
        filas.push({ ...payload });
        return { data: [{ ...payload }], error: null };
      }
      const coinciden = filas.filter((f) => pred.every((p) => p(f)));
      if (modo === 'update') { for (const f of coinciden) Object.assign(f, payload); }
      return { data: coinciden.map((f) => ({ ...f })), error: null };
    };
    const q = {
      select: () => q,
      insert: (p: Fila) => { modo = 'insert'; payload = p; return q; },
      update: (p: Fila) => { modo = 'update'; payload = p; return q; },
      eq: (k: string, v: unknown) => { pred.push((f) => f[k] === v); return q; },
      in: (k: string, v: unknown[]) => { pred.push((f) => v.includes(f[k])); return q; },
      is: (k: string, v: unknown) => { pred.push((f) => (f[k] ?? null) === v); return q; },
      maybeSingle: async () => { const r = await ejecutar(); return { data: (r.data as Fila[] | null)?.[0] ?? null, error: r.error }; },
      then: (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => ejecutar().then(a, b),
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

const AHORA = new Date('2026-10-10T12:00:00.000Z');
const ctx = { studioId: 's1', userId: 'duena' };

function tablas(): Record<string, Fila[]> {
  return {
    sesiones: [
      { id: 'c1', studio_id: 's1', instructor_id: 'i1', cancelada: false, inicio: '2026-10-05T17:00:00.000Z', fin: '2026-10-05T18:00:00.000Z' },
      { id: 'c2', studio_id: 's1', instructor_id: 'i1', cancelada: false, inicio: '2026-10-06T17:00:00.000Z', fin: '2026-10-06T18:00:00.000Z' },
      { id: 'ajena', studio_id: 's1', instructor_id: 'gerente', cancelada: false, inicio: '2026-10-05T17:00:00.000Z', fin: '2026-10-05T18:00:00.000Z' },
      { id: 'futura', studio_id: 's1', instructor_id: 'i1', cancelada: false, inicio: '2026-10-20T17:00:00.000Z', fin: '2026-10-20T18:00:00.000Z' },
      { id: 'otro-estudio', studio_id: 's2', instructor_id: 'i1', cancelada: false, inicio: '2026-10-05T17:00:00.000Z', fin: '2026-10-05T18:00:00.000Z' },
    ],
    clases_impartidas: [
      { sesion_id: 'c2', studio_id: 's1', instructor_id: 'i1', estado: 'NO_DADA', inicio_real: null, fin_real: null, origen: 'CONFIRMACION', revisada_en: null },
    ],
    clases_impartidas_auditoria: [],
  };
}

test('dar por dada una clase sin confirmar: fila de la propietaria, revisada y con su motivo en el historial', async () => {
  const t = tablas();
  const r = await corregirClases(crearAdmin(t), ctx, ['i1'], [{ sesionId: 'c1', estado: 'DADA' }], 'Las dio a su hora', AHORA);
  assert.deepEqual(r, { ok: true, corregidas: 1 });
  const fila = t.clases_impartidas.find((f) => f.sesion_id === 'c1')!;
  assert.equal(fila.origen, 'PROPIETARIA');
  assert.equal(fila.estado, 'DADA');
  assert.equal(fila.inicio_real, '2026-10-05T17:00:00.000Z');
  assert.equal(fila.fin_real, null); // a su hora: termina a su hora
  assert.equal(fila.revisada_por, 'duena');
  const a = t.clases_impartidas_auditoria[0];
  assert.equal(a.accion, 'CORREGIDA');
  assert.equal(a.valor_antes, 'sin confirmar');
  assert.equal(a.motivo, 'Las dio a su hora');
});

test('corregir una «no la di» a dada con otro horario: actualiza la fila y deja el antes y el después', async () => {
  const t = tablas();
  const r = await corregirClases(crearAdmin(t), ctx, ['i1'],
    [{ sesionId: 'c2', estado: 'DADA', inicio: '2026-10-06T17:10:00.000Z', fin: '2026-10-06T18:00:00.000Z' }], 'Sí la dio', AHORA);
  assert.equal(r.ok, true);
  const fila = t.clases_impartidas.find((f) => f.sesion_id === 'c2')!;
  assert.equal(fila.estado, 'DADA');
  assert.equal(fila.edited_by, 'duena');
  assert.equal(fila.origen, 'CONFIRMACION'); // cómo se supo al principio no se reescribe
  assert.equal(t.clases_impartidas_auditoria[0].valor_antes, 'no dada');
  assert.match(String(t.clases_impartidas_auditoria[0].valor_despues), /^dada \d{2}:\d{2}–\d{2}:\d{2}$/);
});

test('sin motivo, una clase ajena, futura, de otro estudio o con un horario disparatado: no se toca nada', async () => {
  const casos: [Parameters<typeof corregirClases>[3], string, number][] = [
    [[{ sesionId: 'c1', estado: 'DADA' }], '   ', 400],
    [[{ sesionId: 'ajena', estado: 'DADA' }], 'x', 404],
    [[{ sesionId: 'otro-estudio', estado: 'DADA' }], 'x', 404],
    [[{ sesionId: 'futura', estado: 'DADA' }], 'x', 400],
    [[{ sesionId: 'c1', estado: 'DADA', inicio: '2026-10-05T08:00:00.000Z', fin: '2026-10-05T09:00:00.000Z' }], 'x', 400],
    [[{ sesionId: 'c1', estado: 'DADA', inicio: '2026-10-05T18:00:00.000Z', fin: '2026-10-05T17:30:00.000Z' }], 'x', 400],
    // Una válida con una ajena: todo o nada.
    [[{ sesionId: 'c1', estado: 'DADA' }, { sesionId: 'ajena', estado: 'DADA' }], 'x', 404],
  ];
  for (const [items, motivo, status] of casos) {
    const t = tablas();
    const r = await corregirClases(crearAdmin(t), ctx, ['i1'], items, motivo, AHORA);
    assert.equal(r.ok, false, JSON.stringify(items));
    assert.equal(!r.ok && r.status, status, JSON.stringify(items));
    assert.equal(t.clases_impartidas.length, 1);
    assert.equal(t.clases_impartidas_auditoria.length, 0);
  }
});

test('marcar revisada: solo una «no la di» de una ficha que gestiona, y dos veces no duplica el historial', async () => {
  const t = tablas();
  const admin = crearAdmin(t);
  assert.equal((await marcarRevisada(admin, ctx, ['otra'], 'c2', AHORA)).ok, false);
  assert.deepEqual(await marcarRevisada(admin, ctx, ['i1'], 'c2', AHORA), { ok: true, corregidas: 1 });
  assert.equal(t.clases_impartidas[0].revisada_por, 'duena');
  assert.equal(t.clases_impartidas[0].estado, 'NO_DADA'); // revisada no es pagada
  assert.deepEqual(await marcarRevisada(admin, ctx, ['i1'], 'c2', AHORA), { ok: true, corregidas: 0 });
  assert.equal(t.clases_impartidas_auditoria.length, 1);
});

test('resumen por instructora', () => {
  const c = (estado: ClaseEquipo['estado'], extra: Partial<ClaseEquipo> = {}): ClaseEquipo => ({
    sesionId: Math.random().toString(), instructorId: 'i1', nombre: 'Mat', inicio: '2026-10-05T17:00:00.000Z', fin: '2026-10-05T17:55:00.000Z',
    estado, origen: null, inicioReal: null, finReal: null, retrasoMin: 0, porJornada: false, fueraDeJornada: false, revisada: false, ...extra,
  });
  const [r] = resumirClases([c('DADA'), c('PREVIA'), c('SIN_CONFIRMAR'), c('NO_DADA'), c('NO_DADA', { revisada: true }), c('DADA', { fueraDeJornada: true })]);
  assert.deepEqual(r, { instructorId: 'i1', dadas: 3, minutosDados: 165, sinConfirmar: 1, noDadasPorRevisar: 1, fueraDeJornada: 1 });
});
