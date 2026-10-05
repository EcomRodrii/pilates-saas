import test from 'node:test';
import assert from 'node:assert/strict';
import { accionDeFila, topeSemanalLleno, cerradaPorAntelacion, estadoTemporalDeFila, type CondicionesFila } from './fila-horario.ts';

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
  requiereAutorizacion: false, aperturaSuave: false, online: true, relojListo: true, recienReservada: false, topeLleno: false,
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
    { online: false }, { relojListo: false }, { recienReservada: true }, { topeLleno: true },
  ];
  for (const a of apagan) assert.equal(accionDeFila({ ...verde, ...a }), 'ninguna', JSON.stringify(a));
});

test('la cuota con el tope semanal lleno no ofrece el atajo (cuenta como el servidor, también la de recuperación)', () => {
  const cuota = { tipoPlan: 'MENSUAL' as const, limiteSemanal: 2, limitePorTipo: { 'tc-r': 1 }, tiposClaseIds: [] };
  const clases = [
    { id: 'lun', fecha: '2026-10-05', tipoClaseId: 'tc-r' },
    { id: 'mar', fecha: '2026-10-06', tipoClaseId: 'tc-m' },
    { id: 'jue', fecha: '2026-10-08', tipoClaseId: 'tc-m' },
    { id: 'sig', fecha: '2026-10-13', tipoClaseId: 'tc-m' },
  ];
  const hoy = '2026-10-05';
  const jue = clases[2];
  // Dos de la semana (una, la del Reformer, pudo pagarla una recuperación: cuenta igual) → lleno.
  assert.equal(topeSemanalLleno(jue, cuota, [{ claseId: 'lun', estado: 'asistida' }, { claseId: 'mar', estado: 'confirmada' }], clases, hoy), true);
  // Una sola, y otra cancelada → queda sitio.
  assert.equal(topeSemanalLleno(jue, cuota, [{ claseId: 'mar', estado: 'confirmada' }, { claseId: 'lun', estado: 'cancelada' }], clases, hoy), false);
  // La falta sin avisar también gasta la semana.
  assert.equal(topeSemanalLleno(jue, cuota, [{ claseId: 'mar', estado: 'no-asistida' }, { claseId: 'lun', estado: 'confirmada' }], clases, hoy), true);
  // Otra semana no cuenta.
  assert.equal(topeSemanalLleno(clases[3], cuota, [{ claseId: 'lun', estado: 'asistida' }, { claseId: 'mar', estado: 'confirmada' }], clases, hoy), false);
  // El tope de la actividad: un Reformer ya esta semana → el siguiente Reformer, lleno.
  assert.equal(topeSemanalLleno({ fecha: '2026-10-09', tipoClaseId: 'tc-r' }, cuota, [{ claseId: 'lun', estado: 'confirmada' }], clases, hoy), true);
  // Ante la duda (reserva que cuenta y cuya clase no está cargada), lleno si es la semana de hoy.
  assert.equal(topeSemanalLleno(jue, cuota, [{ claseId: 'pasada', estado: 'asistida' }, { claseId: 'mar', estado: 'confirmada' }], clases, hoy), true);
  // Un bono no tiene tope semanal, ni una cuota sin tope.
  assert.equal(topeSemanalLleno(jue, { ...cuota, tipoPlan: 'BONO' }, [{ claseId: 'lun', estado: 'asistida' }, { claseId: 'mar', estado: 'confirmada' }], clases, hoy), false);
  assert.equal(topeSemanalLleno(jue, { ...cuota, limiteSemanal: null, limitePorTipo: {} }, [{ claseId: 'mar', estado: 'confirmada' }], clases, hoy), false);
});
