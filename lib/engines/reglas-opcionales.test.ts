import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reglaEjecutable, reglasOpcionalesEncendidas, TRIGGERS_OPCIONALES } from './reglas-opcionales.ts';

test('el cumpleaños solo existe donde su interruptor está encendido; el resto de reglas, siempre', () => {
  const antes = process.env.AUTOMATIZACION_CUMPLEANOS;
  try {
    delete process.env.AUTOMATIZACION_CUMPLEANOS;
    assert.equal(reglasOpcionalesEncendidas('e1').size, 0, 'apagado de serie');
    assert.equal(reglaEjecutable('CUMPLEANOS', reglasOpcionalesEncendidas('e1')), false);
    assert.equal(reglaEjecutable('AUSENCIA_DIAS', reglasOpcionalesEncendidas('e1')), true, 'las de siempre no dependen de nada');

    process.env.AUTOMATIZACION_CUMPLEANOS = 'estudios:e1';
    assert.equal(reglaEjecutable('CUMPLEANOS', reglasOpcionalesEncendidas('e1')), true);
    assert.equal(reglaEjecutable('CUMPLEANOS', reglasOpcionalesEncendidas('e2')), false, 'solo en los estudios que nombra');

    process.env.AUTOMATIZACION_CUMPLEANOS = 'on';
    assert.equal(reglaEjecutable('CUMPLEANOS', reglasOpcionalesEncendidas('e2')), true);
  } finally {
    if (antes === undefined) delete process.env.AUTOMATIZACION_CUMPLEANOS;
    else process.env.AUTOMATIZACION_CUMPLEANOS = antes;
  }
  assert.deepEqual([...TRIGGERS_OPCIONALES], ['CUMPLEANOS']);
});
