import test from 'node:test';
import assert from 'node:assert/strict';
import { accionDeFila, cerradaPorAntelacion, estadoTemporalDeFila, type CondicionesFila } from './fila-horario.ts';

// La fila del horario: qué dice a la derecha y si ofrece «Reservar» (P11/P12).

const clase = { inicio: '2026-10-07T10:00:00+02:00', fin: '2026-10-07T10:50:00+02:00', seAbreEl: null as string | null };
const ms = (iso: string) => Date.parse(iso);

test('estado temporal: en curso, terminada, aún no se abre o las plazas', () => {
  assert.equal(estadoTemporalDeFila(clase, 'disponible', ms('2026-10-07T10:20:00+02:00')), 'en-curso');
  assert.equal(estadoTemporalDeFila(clase, 'disponible', ms('2026-10-07T11:00:00+02:00')), 'terminada');
  assert.equal(estadoTemporalDeFila(clase, 'disponible', ms('2026-10-07T08:00:00+02:00')), 'plazas');
  const conApertura = { ...clase, seAbreEl: '2026-10-07T09:00:00+02:00' };
  assert.equal(estadoTemporalDeFila(conApertura, 'disponible', ms('2026-10-07T08:00:00+02:00')), 'se-abre');
  // Si ya es suya, la apertura no aplica; sin reloj, nada temporal.
  assert.equal(estadoTemporalDeFila(conApertura, 'reservada', ms('2026-10-07T08:00:00+02:00')), 'plazas');
  assert.equal(estadoTemporalDeFila(conApertura, 'disponible', null), 'plazas');
});

test('cerrada por la antelación mínima: desde `cierraEl`; sin reloj no se afirma', () => {
  const c = { cierraEl: '2026-10-07T09:00:00+02:00' };
  assert.equal(cerradaPorAntelacion(c, ms('2026-10-07T08:59:00+02:00')), false);
  assert.equal(cerradaPorAntelacion(c, ms('2026-10-07T09:00:00+02:00')), true);
  assert.equal(cerradaPorAntelacion(c, null), false);
  assert.equal(cerradaPorAntelacion({ cierraEl: null }, ms('2026-10-07T09:30:00+02:00')), false);
});

const verde: CondicionesFila = {
  disp: 'disponible', sinPagar: true, temporal: 'plazas', cerrada: false, salaConSitios: false, requiereAprobacion: false,
  requiereAutorizacion: false, aperturaSuave: false, online: true, relojListo: true, recienReservada: false,
};

test('«Reservar» en la fila: con plaza y sin pagar nada', () => {
  assert.equal(accionDeFila(verde), 'reservar');
  assert.equal(accionDeFila({ ...verde, disp: 'pocas' }), 'reservar');
});

test('sin plaza, ya suya o en espera: sin botón (la lista de espera se pide desde la ficha)', () => {
  for (const disp of ['completa', 'no-disponible', 'reservada', 'lista-espera'] as const) {
    assert.equal(accionDeFila({ ...verde, disp }), 'ninguna', disp);
  }
});

test('cada condición apaga el botón por separado', () => {
  const apagan: Partial<CondicionesFila>[] = [
    { sinPagar: false }, { temporal: 'en-curso' }, { temporal: 'terminada' }, { temporal: 'se-abre' }, { cerrada: true },
    { salaConSitios: true }, { requiereAprobacion: true }, { requiereAutorizacion: true }, { aperturaSuave: true },
    { online: false }, { relojListo: false }, { recienReservada: true },
  ];
  for (const a of apagan) assert.equal(accionDeFila({ ...verde, ...a }), 'ninguna', JSON.stringify(a));
});
