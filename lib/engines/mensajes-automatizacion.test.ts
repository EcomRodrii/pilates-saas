import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAJES_AUTOMATIZACION, mensajesDeTrigger, plantillaDe, mensajeDe,
  renderMensaje, vistaPreviaMensaje, mensajesPersonalizados,
} from './mensajes-automatizacion.ts';
import type { AutomationRule } from '../types.ts';

const regla = (condicion: Record<string, unknown> = {}) =>
  ({ condicion } as unknown as AutomationRule);

test('sin personalizar, se usa el texto de fábrica', () => {
  const t = plantillaDe(regla(), 'ausencia_recordatorio');
  assert.match(t, /\{nombre\}/);
  assert.match(t, /\{dias\}/);
});

test('el estudio puede reescribir el mensaje entero', () => {
  const r = regla({ dias: 7, mensajes: { ausencia_recordatorio: 'Oye {nombre}, ¿te vemos el jueves?' } });
  assert.equal(
    mensajeDe(r, 'ausencia_recordatorio', { nombre: 'Elena', dias: 9 }),
    'Oye Elena, ¿te vemos el jueves?',
  );
});

test('reescribir un mensaje no pisa los umbrales de la regla', () => {
  const r = regla({ dias: 7, diasCritico: 25, mensajes: { ausencia_recordatorio: 'x' } });
  assert.equal((r.condicion as Record<string, unknown>).dias, 7);
  assert.equal((r.condicion as Record<string, unknown>).diasCritico, 25);
});

test('las variables se sustituyen por el dato de cada clienta', () => {
  assert.equal(
    mensajeDe(regla(), 'pago_primer_aviso', { nombre: 'Pilar', importe: 75, concepto: 'Cuota mensual', dias: 3 }),
    'Pilar, tienes un pago pendiente de 75€ (Cuota mensual) desde hace 3 días. Puedes regularizarlo fácilmente desde tu área de socia o pasando por el estudio — si ya lo has hecho, ignora este aviso. ¡Gracias!',
  );
});

// Si una variable inventada desapareciera sin dejar rastro, el estudio mandaría
// «Hola , te esperamos» sin enterarse. Mejor que se vea.
test('una variable que no existe se queda a la vista, no se borra', () => {
  assert.equal(renderMensaje('Hola {nombre}, {inventada}', { nombre: 'Ana' }), 'Hola Ana, {inventada}');
});

test('un mensaje vacío o en blanco no cuenta como personalización', () => {
  assert.deepEqual(mensajesPersonalizados(regla({ mensajes: { a: '   ', b: '' } })), {});
});

test('la vista previa usa los ejemplos de cada variable, sin llaves sueltas', () => {
  for (const def of MENSAJES_AUTOMATIZACION) {
    const previa = vistaPreviaMensaje(regla(), def.clave);
    assert.ok(previa.length > 0, def.clave);
    assert.ok(!/\{\w+\}/.test(previa), `«${def.clave}» deja una variable sin ejemplo: ${previa}`);
  }
});

// Cada variable que una plantilla nombra tiene que estar declarada, o la
// pantalla no sabría explicarla y la vista previa la dejaría en crudo.
test('toda variable usada en una plantilla está declarada', () => {
  for (const def of MENSAJES_AUTOMATIZACION) {
    const usadas = [...def.plantilla.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    for (const u of usadas) {
      assert.ok(def.variables.some(v => v.clave === u), `«${def.clave}» usa {${u}} sin declararla`);
    }
  }
});

test('las claves de mensaje no se repiten', () => {
  const claves = MENSAJES_AUTOMATIZACION.map(m => m.clave);
  assert.equal(new Set(claves).size, claves.length);
});

test('cada regla que escribe a clientas tiene al menos un mensaje que leer', () => {
  for (const trigger of ['AUSENCIA_DIAS', 'PAGO_PENDIENTE_DIAS', 'CLASE_MANANA', 'NUEVA_SOCIA', 'RENOVACION_COBRADA'] as const) {
    assert.ok(mensajesDeTrigger(trigger).length > 0, trigger);
  }
});
