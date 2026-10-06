import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { avisoDeCambioDeClase, claveAvisoSustituta, selloDelMotor, selloDelPanel } from './cambio-de-clase.ts';
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

test('cada cambio tiene su clave: motor(Marta) → panel(Lucía) → panel(Marta) avisa las tres veces', () => {
  const ses = 'ses-1';
  const motorMarta = claveAvisoSustituta({ sesionId: ses, instructora: 'Marta', sello: selloDelMotor('sust-9') });
  const panelLucia = claveAvisoSustituta({ sesionId: ses, instructora: 'Lucía', sello: selloDelPanel(new Date('2026-10-05T10:00:00Z')) });
  const panelMarta = claveAvisoSustituta({ sesionId: ses, instructora: 'Marta', sello: selloDelPanel(new Date('2026-10-06T09:30:00Z')) });
  assert.equal(new Set([motorMarta, panelLucia, panelMarta]).size, 3, 'volver a Marta no choca con el aviso del motor');
  // Y un mismo cambio no avisa dos veces: la misma sustitución, o el mismo guardado (doble envío en el mismo segundo).
  assert.equal(motorMarta, claveAvisoSustituta({ sesionId: ses, instructora: 'Marta', sello: selloDelMotor('sust-9') }));
  assert.equal(selloDelPanel(new Date('2026-10-05T10:00:00.100Z')), selloDelPanel(new Date('2026-10-05T10:00:00.900Z')));
  // Otra sustitución posterior con la misma sustituta, también.
  assert.notEqual(motorMarta, claveAvisoSustituta({ sesionId: ses, instructora: 'Marta', sello: selloDelMotor('sust-10') }));
});

test('motor y panel ponen cada uno su sello; ninguno escribe la clave a mano', () => {
  const sustituciones = readFileSync(join(process.cwd(), 'lib/sustituciones/avisos.ts'), 'utf8');
  const confirmar = readFileSync(join(process.cwd(), 'lib/sustituciones/confirmar.ts'), 'utf8');
  const emit = readFileSync(join(process.cwd(), 'lib/notifications/emit.ts'), 'utf8');
  assert.match(sustituciones, /dedupKey: claveAvisoSustituta\(\{[^}]*sello: selloDelMotor\(params\.sustitucionId/);
  assert.match(confirmar, /tipo: 'cubierta'[\s\S]{0,200}sustitucionId: p\.sustitucionId/);
  assert.match(confirmar, /emitirSustitucionAceptada\(admin, \{[^}]*sello: selloDelMotor\(p\.sustitucionId\)/);
  assert.match(emit, /dedupKey: claveAvisoSustituta\(\{[^}]*sello: p\.sello \?\? selloDelPanel\(/);
  assert.doesNotMatch(sustituciones, /`clase-cubierta:/, 'la clave se escribe en un solo sitio');
  // La instructora que entra, por el panel, también con el sello del cambio.
  assert.match(emit, /dedupKey: `sustitucion-aceptada:\$\{p\.sesionId\}:\$\{p\.instructorId\}\$\{p\.sello \?/);
  for (const ruta of ['app/api/clases/avisar-cambio-clase/route.ts', 'app/api/clases/avisar-cambio-serie/route.ts']) {
    assert.match(readFileSync(join(process.cwd(), ruta), 'utf8'), /selloDelPanel\(new Date\(\)\)/, ruta);
  }
});

test('los dos caminos del panel que avisan de un cambio deciden con la misma regla', () => {
  for (const ruta of ['app/api/clases/avisar-cambio-clase/route.ts', 'app/api/clases/avisar-cambio-serie/route.ts']) {
    const codigo = readFileSync(join(process.cwd(), ruta), 'utf8');
    assert.match(codigo, /soloInstructora: avisoDeCambioDeClase\(/, ruta);
  }
});
