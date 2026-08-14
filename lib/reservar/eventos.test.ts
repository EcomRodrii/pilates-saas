import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_EVENTO_WIDGET, esTipoEventoValido, sessionIdWidget, trackEventoWidget } from './eventos.ts';

test('los tipos de evento son únicos', () => {
  assert.equal(new Set(TIPOS_EVENTO_WIDGET).size, TIPOS_EVENTO_WIDGET.length);
});

test('esTipoEventoValido acepta cualquier tipo del catálogo', () => {
  for (const tipo of TIPOS_EVENTO_WIDGET) {
    assert.equal(esTipoEventoValido(tipo), true);
  }
});

test('esTipoEventoValido rechaza texto arbitrario del cliente', () => {
  assert.equal(esTipoEventoValido('cualquier_cosa'), false);
  assert.equal(esTipoEventoValido(''), false);
  // Ni siquiera un prefijo válido cuela — coincidencia exacta.
  assert.equal(esTipoEventoValido('widget_loaded_extra'), false);
});

// Sin DOM en node --test: confirma el fallback fail-soft, no el camino con
// sessionStorage real (eso solo se puede ver en un navegador de verdad).
test('sessionIdWidget() sin window no revienta — cadena vacía', () => {
  assert.equal(sessionIdWidget(), '');
});

test('trackEventoWidget() sin studioId no intenta nada — no revienta sin window', () => {
  assert.doesNotThrow(() => trackEventoWidget(null, 'widget_loaded'));
  assert.doesNotThrow(() => trackEventoWidget(undefined, 'widget_loaded'));
  assert.doesNotThrow(() => trackEventoWidget('studio-1', 'widget_loaded'));
});
