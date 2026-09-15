import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcarPenalizacionReembolsada, motivoRevisionPenalizacion } from './liquidacion-penalizacion-revertida.ts';

// 44ª pasada (H-2) y su gemelo en disputas: cuando el dinero de una
// penalización COBRADA vuelve a la socia —reembolso del estudio o disputa
// perdida—, la penalización pasa a REEMBOLSADA y la liquidación CONFIRMADA que
// ya la repartió se marca para revisión, con un motivo que dice cuál de las dos.

type Fila = Record<string, unknown>;

function fakeAdmin(opts: { penTransiciona?: boolean } = {}) {
  const updates: { tabla: string; fila: Fila; filtros: Record<string, unknown> }[] = [];
  const admin = {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      let filaUpdate: Fila | null = null;
      const c = {
        update(fila: Fila) { filaUpdate = fila; return c; },
        select() { return c; },
        eq(campo: string, valor: unknown) { filtros[campo] = valor; return c; },
        maybeSingle() {
          if (filaUpdate) updates.push({ tabla, fila: filaUpdate, filtros });
          if (tabla === 'penalizaciones') {
            // Compare-and-set desde COBRADA: 0 filas si ya no lo estaba.
            return Promise.resolve({
              data: opts.penTransiciona === false ? null
                : { reserva_id: 'res-1', importe: 12.5, procesada_en: '2026-08-20T10:00:00Z' },
              error: null,
            });
          }
          if (tabla === 'reservas') return Promise.resolve({ data: { sesion_id: 'ses-1' }, error: null });
          if (tabla === 'sesiones') return Promise.resolve({ data: { instructor_id: 'ins-1' }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(res: (v: { data: null; error: null }) => unknown) {
          if (filaUpdate) updates.push({ tabla, fila: filaUpdate, filtros });
          return Promise.resolve({ data: null, error: null }).then(res);
        },
      };
      return c;
    },
  };
  return { admin: admin as never, updates };
}

test('disputa perdida: la penalización pasa a REEMBOLSADA desde COBRADA y la liquidación CONFIRMADA pide revisión con motivo de disputa', async () => {
  const { admin, updates } = fakeAdmin();
  await marcarPenalizacionReembolsada(admin, 'studio-1', 'rec-penaliz-pen-1', 'disputa');

  const pen = updates.find(u => u.tabla === 'penalizaciones')!;
  assert.equal(pen.fila.estado, 'REEMBOLSADA');
  assert.equal(pen.filtros.estado, 'COBRADA', 'compare-and-set: solo desde COBRADA');
  assert.equal(pen.filtros.recibo_id, 'rec-penaliz-pen-1');

  const liq = updates.find(u => u.tabla === 'liquidaciones_instructoras')!;
  assert.equal(liq.fila.requiere_revision, true);
  assert.equal(liq.fila.revision_motivo, motivoRevisionPenalizacion(12.5, 'disputa'));
  assert.match(String(liq.fila.revision_motivo), /disputa/);
  assert.equal(liq.filtros.estado, 'CONFIRMADA', 'nunca una PAGADA: ese ajuste es manual');
  assert.equal(liq.filtros.instructor_id, 'ins-1');
  // El periodo es el mes en que se COBRÓ la penalización.
  assert.equal(liq.filtros.periodo_anio, 2026);
  assert.equal(liq.filtros.periodo_mes, 8);
});

test('sin causa explícita sigue siendo un reembolso (el llamador de siempre no cambia)', async () => {
  const { admin, updates } = fakeAdmin();
  await marcarPenalizacionReembolsada(admin, 'studio-1', 'rec-penaliz-pen-1');
  const liq = updates.find(u => u.tabla === 'liquidaciones_instructoras')!;
  assert.equal(liq.fila.revision_motivo, motivoRevisionPenalizacion(12.5, 'reembolso'));
  assert.match(String(liq.fila.revision_motivo), /reembolsado/);
});

test('si la penalización no transiciona (ya revertida, o el recibo no era de una penalización), no toca la liquidación', async () => {
  const { admin, updates } = fakeAdmin({ penTransiciona: false });
  await marcarPenalizacionReembolsada(admin, 'studio-1', 'rec-otro', 'disputa');
  assert.equal(updates.some(u => u.tabla === 'liquidaciones_instructoras'), false);
});

test('los dos motivos se distinguen y llevan el importe', () => {
  const disputa = motivoRevisionPenalizacion(10, 'disputa');
  const reembolso = motivoRevisionPenalizacion(10, 'reembolso');
  assert.notEqual(disputa, reembolso);
  assert.ok(disputa.includes('10.00€'));
  assert.ok(reembolso.includes('10.00€'));
});
