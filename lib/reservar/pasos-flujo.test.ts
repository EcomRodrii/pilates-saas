import test from 'node:test';
import assert from 'node:assert/strict';
import { recorridoDe, textoPaso } from './pasos-flujo.ts';

test('⚠️ el camino de invitada que paga ya NO se numera (Fase 2 del rediseño)', () => {
  // Hasta el rediseño de la pantalla de reserva eran dos hojas separadas con
  // «‹ Datos»/«‹ Pago» y un «Paso 1 de 2». `PantallaReserva`
  // (components/reserva/pantalla-reserva.tsx) las funde en un único scroll
  // continuo a propósito — numerarlas otra vez reintroduciría justo la
  // sensación de wizard que ese rediseño pidió evitar.
  assert.equal(recorridoDe('datos'), null);
  assert.equal(recorridoDe('pago'), null);
});

test('el alta con contrato son tres, y se conocen al llegar a la primera', () => {
  assert.equal(recorridoDe('registro')!.etiquetas.length, 3);
  assert.equal(recorridoDe('registro')!.actual, 0);
  assert.equal(recorridoDe('contrato')!.actual, 1);
  assert.equal(textoPaso(recorridoDe('contrato')!), 'Paso 2 de 3');
});

test('⚠️ lo que NO se sabe no se numera', () => {
  // `login` tiene dos continuaciones posibles según lo que responda el
  // servidor, y `confirm` se alcanza por dos caminos distintos. Numerarlos
  // obligaría a inventar un total que se contradiría a mitad de flujo.
  assert.equal(recorridoDe('login'), null);
  assert.equal(recorridoDe('confirm'), null);
});

test('los pasos terminales no llevan indicador', () => {
  for (const paso of ['done', 'espera', 'pendiente'] as const) {
    assert.equal(recorridoDe(paso), null);
  }
});
