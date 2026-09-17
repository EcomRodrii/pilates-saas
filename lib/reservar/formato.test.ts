import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtTime, fmtLong, telefonoValido } from './formato.ts';
import { telefonoValido as telefonoValidoCsv } from '../csv.ts';

test('fmtTime formatea HH:MM con ceros a la izquierda', () => {
  assert.equal(fmtTime('2026-09-17T09:05:00'), '09:05');
});

test('fmtLong da el día de la semana y el mes en español', () => {
  const d = fmtLong(new Date('2026-09-17T12:00:00'));
  assert.match(d, /septiembre/);
});

test('telefonoValido acepta 9+ dígitos sin exigir formato español', () => {
  assert.equal(telefonoValido('600123456'), true);
  // Móvil francés: 11 dígitos, no encaja en el formato España-específico.
  assert.equal(telefonoValido('+33612345678'), true);
});

test('telefonoValido rechaza menos de 9 dígitos', () => {
  assert.equal(telefonoValido('12345'), false);
});

// FE-4 (auditoría 2026-09-16): el mismo número pasaba el botón del cliente
// (este validador, usado por app/reservar/[slug]/page.tsx) y el servidor lo
// tiraba en silencio con el validador España-específico de lib/csv.ts —
// checkout-embebido/route.ts usaba ese segundo. Este test documenta el
// desajuste que motivó el cambio: si algún día vuelven a divergir para un
// número real, este test lo verá antes que una clienta sin teléfono.
test('un móvil no español pasa este validador aunque el de lib/csv.ts lo rechace', () => {
  const numeroFrances = '+33612345678';
  assert.equal(telefonoValido(numeroFrances), true);
  assert.equal(telefonoValidoCsv(numeroFrances), false);
});
