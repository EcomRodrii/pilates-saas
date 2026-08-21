import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, BOTON_TERCIARIO } from './botones.ts';

test('⚠️ ningún botón tiene un hover que pinte lo mismo que el reposo', () => {
  // El defecto real: `bg-[var(--portal-surface-2)] hover:bg-[var(--portal-surface-2)]`.
  // El hover existía y no cambiaba nada, así que el botón no respondía al ratón.
  for (const clases of [BOTON_PRIMARIO, BOTON_SECUNDARIO, BOTON_TERCIARIO]) {
    const utilidades = clases.split(/\s+/).filter(Boolean);
    // Las de reposo son las que NO llevan prefijo de estado: comparar contra la
    // lista entera haría que cada `hover:` se encontrara a sí mismo.
    const reposo = new Set(utilidades.filter(u => !u.includes(':')));
    for (const u of utilidades.filter(u => u.startsWith('hover:'))) {
      const equivalente = u.slice('hover:'.length);
      assert.ok(
        !reposo.has(equivalente),
        `${u} pinta lo mismo que el estado normal: el botón no responde`,
      );
    }
  }
});

test('primario y secundario comparten alto, radio y respuesta al pulsar', () => {
  for (const clases of [BOTON_PRIMARIO, BOTON_SECUNDARIO]) {
    assert.ok(clases.includes('py-3.5'), 'alto distinto entre botones del mismo flujo');
    assert.ok(clases.includes('rounded-2xl'), 'radio distinto entre botones del mismo flujo');
    assert.ok(clases.includes('active:scale-[.99]'), 'sin respuesta al pulsar (la única señal en móvil)');
  }
});

test('deshabilitado: además de apagarse, no deja pulsar', () => {
  // La opacidad sola se lee como «cargando». El cursor es lo que dice que
  // falta algo por hacer.
  for (const clases of [BOTON_PRIMARIO, BOTON_SECUNDARIO, BOTON_TERCIARIO]) {
    assert.ok(clases.includes('disabled:opacity-40'), 'deshabilitado sin señal visual');
    assert.ok(clases.includes('disabled:cursor-not-allowed'), 'deshabilitado sin señal de cursor');
  }
});
