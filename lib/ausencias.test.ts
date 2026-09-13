import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausenciaVisiblePara, ausenciaEnFecha, sufijoAusencia } from './ausencias.ts';
import type { AusenciaInstructora } from './api-client.ts';

const BAJA: AusenciaInstructora = {
  id: 'aus-1', instructorId: 'ins-1', tipo: 'BAJA_MEDICA',
  desde: '2026-09-10', hasta: '2026-09-20', motivo: 'texto libre de la baja',
};

test('ausenciaVisiblePara: sin detalle, quién y qué días — ni tipo ni motivo', () => {
  const r = ausenciaVisiblePara(BAJA, false);
  assert.deepEqual(r, {
    id: 'aus-1', instructorId: 'ins-1', desde: '2026-09-10', hasta: '2026-09-20',
    tipo: 'OTRO', motivo: null,
  });
  // Una baja médica no se distingue de cualquier otra ausencia.
  assert.equal(JSON.stringify(r).includes('BAJA'), false);
  assert.equal(JSON.stringify(r).includes('texto libre'), false);
});

test('ausenciaVisiblePara: con detalle, la ausencia tal cual', () => {
  assert.deepEqual(ausenciaVisiblePara(BAJA, true), BAJA);
});

test('recepción sigue viendo que la instructora no está ese día (para no asignarle la clase)', () => {
  const recortadas = [ausenciaVisiblePara(BAJA, false)];
  const au = ausenciaEnFecha(recortadas, 'ins-1', '2026-09-15T10:00:00');
  assert.ok(au, 'la ausencia sigue cubriendo la fecha');
  assert.equal(sufijoAusencia(au), ' · ausente');
  assert.equal(ausenciaEnFecha(recortadas, 'ins-1', '2026-09-21T10:00:00'), null);
});
