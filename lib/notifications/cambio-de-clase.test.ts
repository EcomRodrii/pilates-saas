import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { avisoDeCambioDeClase, claveAvisoSustituta } from './cambio-de-clase.ts';
import { PLANTILLAS, REGLAS } from './catalog.ts';
import { EVENTOS } from './eventos.ts';

test('solo cambia quién la da: aviso de sustituta, no «tu clase ha cambiado»', () => {
  assert.equal(avisoDeCambioDeClase({ cambiaInstructora: true }), 'sustituta');
  assert.equal(avisoDeCambioDeClase({ cambiaInstructora: true, cambioHora: false, cambioSala: false }), 'sustituta');
});

test('si se mueve la hora o la sala es una clase modificada (aunque cambie también la instructora)', () => {
  assert.equal(avisoDeCambioDeClase({ cambiaInstructora: true, cambioHora: true }), 'modificada');
  assert.equal(avisoDeCambioDeClase({ cambiaInstructora: true, cambioSala: true }), 'modificada');
  assert.equal(avisoDeCambioDeClase({ cambiaInstructora: false, cambioHora: true }), 'modificada');
  assert.equal(avisoDeCambioDeClase({ cambiaInstructora: false }), 'modificada');
});

test('el aviso de sustituta llega a la alumna por PUSH e in-app y tiene su interruptor', () => {
  const regla = REGLAS[EVENTOS.CLASE_SUSTITUTA];
  assert.ok(regla.canales.includes('PUSH'));
  assert.equal(regla.audiencia, 'socias-de-la-sesion');
  const p = PLANTILLAS[`${EVENTOS.CLASE_SUSTITUTA}#SOCIA`];
  assert.match(p.body, /\{sustituta\}/);
  assert.match(p.body, /Tu reserva no cambia/);
  const interruptores = readFileSync(join(process.cwd(), 'lib/notifications/push-por-tipo.ts'), 'utf8');
  assert.match(interruptores, /evento: EVENTOS\.CLASE_SUSTITUTA/);
});

test('UNA clave de duplicados para las dos vías (motor de sustituciones y panel): la alumna nunca recibe dos', () => {
  assert.equal(claveAvisoSustituta('ses-1', 'Laura'), 'clase-cubierta:ses-1:Laura');
  const sustituciones = readFileSync(join(process.cwd(), 'lib/sustituciones/avisos.ts'), 'utf8');
  const emit = readFileSync(join(process.cwd(), 'lib/notifications/emit.ts'), 'utf8');
  assert.match(sustituciones, /dedupKey: claveAvisoSustituta\(/);
  assert.match(emit, /dedupKey: claveAvisoSustituta\(/);
  assert.doesNotMatch(sustituciones, /`clase-cubierta:/, 'la clave se escribe en un solo sitio');
});

test('los dos caminos del panel que avisan de un cambio deciden con la misma regla', () => {
  for (const ruta of ['app/api/clases/avisar-cambio-clase/route.ts', 'app/api/clases/avisar-cambio-serie/route.ts']) {
    const codigo = readFileSync(join(process.cwd(), ruta), 'utf8');
    assert.match(codigo, /soloInstructora: avisoDeCambioDeClase\(/, ruta);
  }
});
