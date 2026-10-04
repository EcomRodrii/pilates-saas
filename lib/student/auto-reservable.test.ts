import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoReservableDe, trasAnularla, trasDejarla, trasPedirla, type DatosAutoReservable } from './auto-reservable.ts';
import type { ClaseSueltaVista } from './clases-fijas.ts';

// «Clase fija»: qué enseña el interruptor de la ficha de una clase que se repite. Es el ÚNICO camino para pedirla desde la app
// (4-oct-2026). El 2026-10-14 es miércoles (dow 3).
const HOY = '2026-10-07';
const CLASE = { fecha: '2026-10-14', hora: '10:00', salaId: 'sala-1' };

const suelta = (estado: ClaseSueltaVista['estado']): ClaseSueltaVista => ({
  serieId: 'serie-1', diaSemana: 3, hora: '10:00', tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: null,
  tipo: 'Reformer', sala: 'Sala 1', instructora: null, logoUrl: null, color: null, proximaSesionId: 'ses-prox', ultimaFecha: '2026-12-30',
  estado,
});
const plaza = (c: Record<string, unknown> = {}) => ({
  id: 'pf-1', diaSemana: 3, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', vigenciaDesde: '2026-01-01',
  vigenciaHasta: null, estado: 'ACTIVA' as const, claseFijaId: null, ...c,
});
const datos = (d: Partial<DatosAutoReservable>): DatosAutoReservable => ({ sueltas: [], plazas: [], ...d });

test('una clase que no se repite (o sin catálogo, o con otra forma) no pinta nada', () => {
  assert.equal(autoReservableDe(null, CLASE, HOY), null);
  assert.equal(autoReservableDe({} as never, CLASE, HOY), null);
  assert.equal(autoReservableDe(datos({}), CLASE, HOY), null);
  assert.equal(autoReservableDe(datos({ sueltas: [suelta({ estado: 'PUEDE_PEDIR' })] }), { ...CLASE, hora: '11:00' }, HOY), null);
  assert.equal(autoReservableDe(datos({ sueltas: [suelta({ estado: 'PUEDE_PEDIR' })] }), { ...CLASE, salaId: 'otra' }, HOY), null);
});

test('puede pedirla → apagado, y el toque pide la clase fija de ESTA franja', () => {
  const e = autoReservableDe(datos({ sueltas: [suelta({ estado: 'PUEDE_PEDIR' })] }), CLASE, HOY);
  assert.equal(e?.visual, 'apagado');
  assert.deepEqual(e?.accion, { tipo: 'PEDIR', sesionId: 'ses-prox' });
});

test('la hora casa aunque la franja o la clase vengan con segundos', () => {
  const conSegundos = { ...suelta({ estado: 'PUEDE_PEDIR' }), hora: '10:00:00' };
  assert.equal(autoReservableDe(datos({ sueltas: [conSegundos] }), CLASE, HOY)?.visual, 'apagado');
  assert.equal(autoReservableDe(datos({ sueltas: [suelta({ estado: 'PUEDE_PEDIR' })] }), { ...CLASE, hora: '10:00:00' }, HOY)?.visual, 'apagado');
});

test('pedida → pendiente con su petición (para anularla); sin cuota → apagado, sin nada que pedir', () => {
  const p = autoReservableDe(datos({ sueltas: [suelta({ estado: 'PEDIDA', peticionId: 'spf-1' })] }), CLASE, HOY);
  assert.equal(p?.visual, 'pendiente');
  assert.equal(p?.peticionId, 'spf-1');
  const b = autoReservableDe(datos({ sueltas: [suelta({ estado: 'SOLO_CON_CUOTA' })] }), CLASE, HOY);
  assert.equal(b?.visual, 'apagado');
  assert.deepEqual(b?.accion, { tipo: 'SOLO_CON_CUOTA' });
});

test('⚠️ su plaza manda: encendido con la plaza que se deja, también la que salió de una clase fija con nombre', () => {
  const s = autoReservableDe(datos({ sueltas: [suelta({ estado: 'TIENE_PLAZA' })], plazas: [plaza()] }), CLASE, HOY);
  assert.equal(s?.visual, 'encendido');
  assert.deepEqual(s?.plaza, { id: 'pf-1', deClaseFija: false });
  const o = autoReservableDe(datos({ sueltas: [suelta({ estado: 'PUEDE_PEDIR' })], plazas: [plaza({ claseFijaId: 'cf-1' })] }), CLASE, HOY);
  assert.equal(o?.visual, 'encendido');
  assert.deepEqual(o?.plaza, { id: 'pf-1', deClaseFija: true });
});

test('una plaza de baja, vencida o de otra franja no la enciende', () => {
  for (const p of [plaza({ estado: 'BAJA' }), plaza({ vigenciaHasta: '2026-10-01' }), plaza({ horaInicio: '11:00:00' }), plaza({ salaId: 'otra' }), plaza({ diaSemana: 4 })]) {
    const e = autoReservableDe(datos({ sueltas: [suelta({ estado: 'PUEDE_PEDIR' })], plazas: [p] }), CLASE, HOY);
    assert.equal(e?.visual, 'apagado', JSON.stringify(p));
  }
  // En pausa SÍ cuenta: la tiene.
  assert.equal(autoReservableDe(datos({ sueltas: [suelta({ estado: 'TIENE_PLAZA' })], plazas: [plaza({ estado: 'PAUSADA' })] }), CLASE, HOY)?.visual, 'encendido');
});

test('⚠️ el interruptor solo cambia con lo que contesta el servidor: dada → encendido; pendiente → con su petición', () => {
  const e = autoReservableDe(datos({ sueltas: [suelta({ estado: 'PUEDE_PEDIR' })] }), CLASE, HOY)!;
  assert.equal(trasPedirla(e, { solicitudId: 'spf-9', resuelta: true }).visual, 'encendido');
  const pendiente = trasPedirla(e, { solicitudId: 'spf-9' });
  assert.equal(pendiente.visual, 'pendiente');
  assert.equal(pendiente.peticionId, 'spf-9');
  assert.equal(pendiente.accion, null);
});

test('tras dejarla o anularla vuelve a poder pedirse', () => {
  const s = autoReservableDe(datos({ sueltas: [suelta({ estado: 'TIENE_PLAZA' })], plazas: [plaza()] }), CLASE, HOY)!;
  assert.deepEqual(trasDejarla(s).accion, { tipo: 'PEDIR', sesionId: 'ses-prox' });
  assert.equal(trasDejarla(s).visual, 'apagado');
  assert.equal(trasDejarla(s).plaza, null);
  const p = autoReservableDe(datos({ sueltas: [suelta({ estado: 'PEDIDA', peticionId: 'spf-1' })] }), CLASE, HOY)!;
  assert.deepEqual(trasAnularla(p).accion, { tipo: 'PEDIR', sesionId: 'ses-prox' });
  assert.equal(trasAnularla(p).peticionId, null);
});
