import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoDeAviso } from './tipo-aviso.ts';

test('el evento manda sobre la categoría: «valora tu clase» es ⭐, no 🎉', () => {
  assert.equal(tipoDeAviso('clase.valorar', 'reservas'), 'valorar');
  assert.equal(tipoDeAviso('reserva.recordatorio_24h', 'reservas'), 'recordatorio');
});

test('sin evento conocido, por categoría; sin nada, estudio', () => {
  assert.equal(tipoDeAviso('reserva.plaza_liberada', 'reservas'), 'plaza-liberada');
  assert.equal(tipoDeAviso(null, 'pagos'), 'bono');
  assert.equal(tipoDeAviso(undefined, 'clases'), 'recordatorio');
  assert.equal(tipoDeAviso(null, null), 'estudio');
  assert.equal(tipoDeAviso('lo.que.sea', 'mensajeria'), 'estudio');
});
