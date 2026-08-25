import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identidadDemostradaEnCompra } from './identidad-compra.ts';

test('socia autenticada: el socioId venía validado contra el JWT', () => {
  assert.equal(
    identidadDemostradaEnCompra({ socioIdVerificado: 'soc-1', fichaCreada: false }),
    true,
  );
});

test('invitada cuya ficha nace de esta compra: no hay nadie a quien suplantar', () => {
  assert.equal(
    identidadDemostradaEnCompra({ socioIdVerificado: null, fichaCreada: true }),
    true,
  );
});

test('invitada que cae sobre una ficha PREEXISTENTE: identidad NO demostrada', () => {
  // El caso del ataque: se conoce el email de una socia del estudio, se paga
  // un plan MENSUAL a su nombre y el webhook le sobrescribía la tarjeta
  // guardada con la del atacante.
  assert.equal(
    identidadDemostradaEnCompra({ socioIdVerificado: null, fichaCreada: false }),
    false,
  );
  assert.equal(
    identidadDemostradaEnCompra({ socioIdVerificado: undefined, fichaCreada: false }),
    false,
  );
  assert.equal(
    identidadDemostradaEnCompra({ socioIdVerificado: '', fichaCreada: false }),
    false,
  );
});
