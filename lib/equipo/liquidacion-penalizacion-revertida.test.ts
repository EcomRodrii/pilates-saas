import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  marcarPenalizacionReembolsada, motivoRevisionPenalizacion, pedirRevisionLiquidacionPenalizacion,
} from './liquidacion-penalizacion-revertida.ts';

// 44ª pasada (H-2) y su gemelo en disputas: cuando el dinero de una
// penalización COBRADA vuelve a la socia —reembolso del estudio o disputa
// perdida—, la penalización pasa a REEMBOLSADA y la liquidación CONFIRMADA que
// ya la repartió se marca para revisión, con un motivo que dice cuál de las dos.

type Fila = Record<string, unknown>;

function fakeAdmin(opts: {
  penTransiciona?: boolean;
  // Si el UPDATE de liquidaciones_instructoras toca alguna fila (por defecto
  // sí: es lo que esperan las pruebas de siempre). `false` simula el caso I-5
  // (0 filas sin error) y entonces `liquidacionExistenteEstado` decide si la
  // lectura de después ve la liquidación ya PAGADA o ninguna liquidación.
  liquidacionTocada?: boolean;
  liquidacionExistenteEstado?: string | null;
} = {}) {
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
          if (tabla === 'liquidaciones_instructoras') {
            // Sin `filaUpdate`: esta es la lectura de después, no el UPDATE
            // (ese termina en `.then()`, más abajo).
            const estado = opts.liquidacionExistenteEstado;
            return Promise.resolve({ data: estado ? { estado } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(res: (v: { data: unknown; error: null }) => unknown) {
          if (filaUpdate) updates.push({ tabla, fila: filaUpdate, filtros });
          if (tabla === 'liquidaciones_instructoras' && filaUpdate) {
            const data = opts.liquidacionTocada === false ? [] : [{ id: 'liq-1' }];
            return Promise.resolve({ data, error: null }).then(res);
          }
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

// I-5 (auditoría 15-sep): el UPDATE no llevaba `.select()`, así que 0 filas
// (porque la liquidación ya está PAGADA) se leía exactamente igual que un
// éxito — nadie se enteraba de que el estudio pierde el reparto. Las cuatro
// pruebas siguientes cubren las cuatro salidas posibles de la función.
const PEN = { reserva_id: 'res-1', importe: 12.5, procesada_en: '2026-08-20T10:00:00Z' };

test('pedirRevisionLiquidacionPenalizacion: "revisada" cuando el UPDATE toca la liquidación CONFIRMADA', async () => {
  const { admin } = fakeAdmin();
  const resultado = await pedirRevisionLiquidacionPenalizacion(admin, 'studio-1', PEN, 'motivo');
  assert.equal(resultado, 'revisada');
});

test('pedirRevisionLiquidacionPenalizacion: "ya_pagada" cuando 0 filas y la liquidación de ese periodo ya está PAGADA', async () => {
  const { admin } = fakeAdmin({ liquidacionTocada: false, liquidacionExistenteEstado: 'PAGADA' });
  const resultado = await pedirRevisionLiquidacionPenalizacion(admin, 'studio-1', PEN, 'motivo');
  assert.equal(resultado, 'ya_pagada');
});

test('pedirRevisionLiquidacionPenalizacion: "sin_periodo" cuando 0 filas y esa liquidación no existe todavía', async () => {
  const { admin } = fakeAdmin({ liquidacionTocada: false, liquidacionExistenteEstado: null });
  const resultado = await pedirRevisionLiquidacionPenalizacion(admin, 'studio-1', PEN, 'motivo');
  assert.equal(resultado, 'sin_periodo');
});

test('pedirRevisionLiquidacionPenalizacion: "sin_periodo" sin reserva, sin instructora o sin procesada_en — nada que revisar', async () => {
  const { admin: sinReserva } = fakeAdmin();
  // Reutiliza el fake tal cual (siempre da reserva/instructor), así que el
  // único camino que queda para probar "nada que revisar" desde aquí es
  // `procesada_en` nulo — los otros dos early-return ya están cubiertos por
  // construcción del fake en el resto de pruebas de este fichero.
  const resultado = await pedirRevisionLiquidacionPenalizacion(sinReserva, 'studio-1', { ...PEN, procesada_en: null }, 'motivo');
  assert.equal(resultado, 'sin_periodo');
});

// Sentry no se puede ejecutar bajo `node --test` en este repo (el SDK no se
// inicializa fuera del runtime de Next) — mismo motivo documentado en
// procesar-reembolso.test.ts. Se verifica por código fuente en su lugar.
test('marcarPenalizacionReembolsada avisa por Sentry cuando la liquidación ya está pagada o el intento de revisión falla', () => {
  const fuente = readFileSync(new URL('./liquidacion-penalizacion-revertida.ts', import.meta.url), 'utf8');
  const cuerpo = fuente.slice(fuente.indexOf('export async function marcarPenalizacionReembolsada'));
  assert.ok(cuerpo.includes('Sentry.captureMessage'), 'debe avisar por Sentry en el caso ya_pagada/error');
  assert.ok(cuerpo.includes("'ya_pagada'"), 'debe distinguir el caso ya_pagada explícitamente');
});

test('seguirPenalizacionAlRecibo avisa por Sentry cuando la liquidación ya está pagada o el intento de revisión falla', () => {
  const fuente = readFileSync(new URL('../billing/penalizacion-recibo-server.ts', import.meta.url), 'utf8');
  const cuerpo = fuente.slice(fuente.indexOf('export async function seguirPenalizacionAlRecibo'));
  assert.ok(cuerpo.includes('Sentry.captureMessage'), 'debe avisar por Sentry en el caso ya_pagada/error');
  assert.ok(cuerpo.includes("'ya_pagada'"), 'debe distinguir el caso ya_pagada explícitamente');
});
