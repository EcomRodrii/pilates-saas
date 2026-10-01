import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoQuitarExterna, filaReserva } from './fila-reserva.ts';

const nombre = (id: string) => (id === 's-1' ? 'Ana García' : 'Clienta');

test('una socia: su nombre, enlace a la ficha y todas las acciones', () => {
  const f = filaReserva({ socioId: 's-1', origen: 'TENTARE' }, nombre);
  assert.equal(f.nombre, 'Ana García');
  assert.equal(f.enlaceFicha, '/clientas/s-1');
  assert.equal(f.plataforma, null);
  assert.ok(f.puedeRepetir && f.puedeHacerFija && f.conSemaforo);
});

test('una reserva de ClassPass: el nombre que dio la plataforma, sin ficha ni Repetir/Fija/semáforo', () => {
  const f = filaReserva({ socioId: null, origen: 'CLASSPASS', nombreExterno: 'Eva Ruiz' }, nombre);
  assert.equal(f.nombre, 'Eva Ruiz');
  assert.equal(f.enlaceFicha, null);
  assert.equal(f.plataforma, 'CLASSPASS');
  assert.equal(f.siglaPlataforma, 'ClassPass');
  assert.ok(!f.puedeRepetir && !f.puedeHacerFija && !f.conSemaforo);
});

test('Urban Sports Club se etiqueta como USC y, sin nombre, dice de dónde viene', () => {
  const f = filaReserva({ socioId: null, origen: 'URBAN_SPORTS_CLUB', nombreExterno: '  ' }, nombre);
  assert.equal(f.siglaPlataforma, 'USC');
  assert.equal(f.nombre, 'Clienta de Urban Sports Club');
});

test('sin origen (código antiguo) se trata como socia; sin socia nunca enlaza a /clientas/null', () => {
  assert.equal(filaReserva({ socioId: 's-1' }, nombre).enlaceFicha, '/clientas/s-1');
  assert.equal(filaReserva({ socioId: null }, nombre).enlaceFicha, null);
});

test('al quitar una externa se avisa de cancelarla también en la plataforma', () => {
  assert.match(avisoQuitarExterna('CLASSPASS') ?? '', /ClassPass/);
  assert.equal(avisoQuitarExterna(null), null);
});
