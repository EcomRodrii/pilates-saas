import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeTrasCancelar } from './cancelar-mensajes.ts';

const fechaCorta = (iso: string) => `el ${iso.slice(8)}/${iso.slice(5, 7)}`;
const normal = { esClaseFija: false, fechaCorta };
const fija = { esClaseFija: true, fechaCorta };

test('salir de la lista de espera no es cancelar una clase, sea fija o no', () => {
  assert.equal(mensajeTrasCancelar({ eraConfirmada: false }, normal), 'Has salido de la lista de espera');
  assert.equal(mensajeTrasCancelar({ eraConfirmada: false }, fija), 'Has salido de la lista de espera');
});

test('una clase normal: dice lo que hizo el servidor con la sesión, como siempre', () => {
  assert.equal(mensajeTrasCancelar({ eraConfirmada: true, bonoDevuelto: true }, normal), 'Cancelada · sesión devuelta a tu bono ✓');
  assert.equal(mensajeTrasCancelar({ eraConfirmada: true }, normal), 'Cancelada — la sesión no se devuelve');
  assert.equal(
    mensajeTrasCancelar({ eraConfirmada: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-10-31' }, normal),
    'Cancelada · tienes una clase para recuperar hasta el el 31/10 ✓',
  );
});

test('una clase fija: nunca habla de «sesión devuelta» ni de «no se devuelve», dice que su clase fija sigue', () => {
  const sinNada = mensajeTrasCancelar({ eraConfirmada: true }, fija);
  assert.equal(sinNada, 'Cancelada solo esta semana · tu clase fija sigue activa ✓');
  assert.doesNotMatch(sinNada, /devuel/);
  // Aunque una respuesta rara trajera `bonoDevuelto`, una clase fija no toca el bono.
  assert.doesNotMatch(mensajeTrasCancelar({ eraConfirmada: true, bonoDevuelto: true }, fija), /bono/);
});

test('una clase fija cancelada a tiempo con cuota limitada: se guarda una recuperación y lo dice', () => {
  assert.equal(
    mensajeTrasCancelar({ eraConfirmada: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-10-31' }, fija),
    'Cancelada solo esta semana · tienes una clase para recuperar hasta el el 31/10 ✓',
  );
  assert.match(
    mensajeTrasCancelar({ eraConfirmada: true, recuperacionAlCerrarSemana: true }, fija),
    /^Cancelada solo esta semana · si no usas ese hueco esta semana/,
  );
});
