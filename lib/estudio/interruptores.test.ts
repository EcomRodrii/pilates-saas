import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interruptoresDe, interruptoresPara } from './interruptores.ts';

// El formato (`on` / `estudios:`) lo prueba lib/interruptor-por-estudio.test.ts.
test('apagado de serie; «estudios:» solo para esos', () => {
  assert.deepEqual(interruptoresDe('s1', {}), { filtrosClientas: false, invitarWhatsApp: false });
  assert.deepEqual(interruptoresDe('s1', { CLIENTAS_FILTROS: 'estudios:s0' }), { filtrosClientas: false, invitarWhatsApp: false });
  assert.deepEqual(interruptoresDe('s1', { CLIENTAS_FILTROS: 'estudios:s1' }), { filtrosClientas: true, invitarWhatsApp: false });
  assert.deepEqual(interruptoresDe('s1', { EQUIPO_INVITAR_WHATSAPP: 'estudios:s1' }), { filtrosClientas: false, invitarWhatsApp: true });
});

test('guardia: las variables solo se leen en el servidor', () => {
  const ruta = readFileSync(new URL('../../app/api/estudio/interruptores/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, /process\.env/);
  const cliente = readFileSync(new URL('./interruptores-cliente.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cliente, /process\.env/);
});

test('si el navegador pregunta por otra sede que la de la sesión, no hay respuesta que recordar (409)', () => {
  const entorno = { CLIENTAS_FILTROS: 'estudios:s1' };
  assert.deepEqual(interruptoresPara('s1', 's1', entorno), { filtrosClientas: true, invitarWhatsApp: false });
  assert.deepEqual(interruptoresPara('s1', null, entorno), { filtrosClientas: true, invitarWhatsApp: false });
  assert.equal(interruptoresPara('s1', 's2', entorno), null, 'ni el «sí» de una sede bajo la otra');
  assert.equal(interruptoresPara('s2', 's1', { CLIENTAS_FILTROS: 'on' }), null, 'ni un «no» falso que se recuerde 30 min');
  const ruta = readFileSync(new URL('../../app/api/estudio/interruptores/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, /status: 409/);
});
