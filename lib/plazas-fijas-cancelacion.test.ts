import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoQuitarReserva, marcaReserva, textoTrasQuitar } from './plazas-fijas-cancelacion.ts';

test('marcaReserva: la que gastó una recuperación, la del motor de plaza fija, y el resto sin marca', () => {
  const recuperaciones = [
    { estado: 'USADA' as const, usadaEnReservaId: 'res-1' },
    { estado: 'DISPONIBLE' as const, usadaEnReservaId: null },
  ];
  assert.equal(marcaReserva({ id: 'res-1' }, recuperaciones), 'recuperacion');
  assert.equal(marcaReserva({ id: 'res-pf-abc' }, recuperaciones), 'fija');
  assert.equal(marcaReserva({ id: 'res-2' }, recuperaciones), null);
});

test('marcaReserva: una recuperación devuelta (DISPONIBLE) no marca la reserva que la tuvo', () => {
  assert.equal(marcaReserva({ id: 'res-1' }, [{ estado: 'DISPONIBLE', usadaEnReservaId: 'res-1' }]), null);
});

test('marcaReserva: una recuperación gastada en una clase de plaza fija manda la recuperación', () => {
  assert.equal(marcaReserva({ id: 'res-pf-1' }, [{ estado: 'USADA', usadaEnReservaId: 'res-pf-1' }]), 'recuperacion');
});

test('avisoQuitarReserva: a una fija no se le dice que pierde su plaza', () => {
  assert.match(avisoQuitarReserva('CONFIRMADA', 'fija'), /^Sigue con su plaza fija/);
  assert.match(avisoQuitarReserva('CONFIRMADA', 'recuperacion'), /Vuelve a tener su clase para recuperar/);
  assert.match(avisoQuitarReserva('CONFIRMADA', null), /^Se libera su plaza/);
  assert.equal(avisoQuitarReserva('LISTA_ESPERA', 'fija'), 'Perderá su sitio en la lista de espera.');
  assert.equal(avisoQuitarReserva('PENDIENTE_APROBACION', null), 'Perderá su sitio en la lista de espera.');
});

test('textoTrasQuitar: dice lo que decidió el servidor', () => {
  assert.equal(
    textoTrasQuitar({ recuperacionCreada: true, recuperacionCaducaEl: '2026-10-31' }, 'fija'),
    'Quitada · tendrá una clase para recuperar hasta el 31 de octubre',
  );
  assert.equal(textoTrasQuitar({ recuperacionCreada: true, recuperacionCaducaEl: null }, 'fija'), 'Quitada · tendrá una clase para recuperar');
  assert.match(textoTrasQuitar({ recuperacionAlCerrarSemana: true }, 'fija') ?? '', /al acabarla$/);
  assert.equal(textoTrasQuitar({}, 'fija'), 'Quitada de esta clase · sigue con su plaza fija');
  assert.equal(textoTrasQuitar({}, 'recuperacion'), 'Quitada · vuelve a tener su clase para recuperar');
  assert.equal(textoTrasQuitar({}, null), null);
});
