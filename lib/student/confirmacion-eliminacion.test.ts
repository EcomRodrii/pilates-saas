import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coincideFraseEliminacion, errorConfirmacionSolicitud, ERROR_CONFIRMACION_ELIMINACION, FRASE_CONFIRMACION_ELIMINACION,
} from './confirmacion-eliminacion.ts';

test('la frase tal cual, con su tilde, vale', () => {
  assert.equal(coincideFraseEliminacion(FRASE_CONFIRMACION_ELIMINACION), true);
  assert.equal(coincideFraseEliminacion('Solicitar la eliminación de mis datos'), true);
});

test('sin tilde también vale: en el móvil es lo normal', () => {
  assert.equal(coincideFraseEliminacion('Solicitar la eliminacion de mis datos'), true);
});

test('mayúsculas y minúsculas dan igual', () => {
  assert.equal(coincideFraseEliminacion('SOLICITAR LA ELIMINACIÓN DE MIS DATOS'), true);
  assert.equal(coincideFraseEliminacion('solicitar la ELIMINACION de mis datos'), true);
});

test('espacios de más (delante, detrás, dobles, tabuladores) dan igual', () => {
  assert.equal(coincideFraseEliminacion('   Solicitar   la eliminación\tde  mis datos  '), true);
  assert.equal(coincideFraseEliminacion('Solicitar la eliminación de mis datos'), true);
});

test('una frase a medias no vale', () => {
  assert.equal(coincideFraseEliminacion('Solicitar la eliminación'), false);
  assert.equal(coincideFraseEliminacion('Solicitar la eliminación de mis dato'), false);
  assert.equal(coincideFraseEliminacion('Solicitarlaeliminacióndemisdatos'), false);
});

test('otra frase, vacío o algo que no es texto no valen', () => {
  assert.equal(coincideFraseEliminacion('Eliminar mis datos'), false);
  assert.equal(coincideFraseEliminacion('Solicitar la eliminación de mis datos, por favor'), false);
  assert.equal(coincideFraseEliminacion(''), false);
  assert.equal(coincideFraseEliminacion('   '), false);
  assert.equal(coincideFraseEliminacion(undefined), false);
  assert.equal(coincideFraseEliminacion(null), false);
  assert.equal(coincideFraseEliminacion(42), false);
  assert.equal(coincideFraseEliminacion(['Solicitar la eliminación de mis datos']), false);
});

test('un texto enorme se descarta sin normalizarlo', () => {
  assert.equal(coincideFraseEliminacion(`${FRASE_CONFIRMACION_ELIMINACION}${' '.repeat(500)}`), false);
});

test('servidor: la supresión sin la frase se rechaza con un mensaje claro', () => {
  assert.equal(errorConfirmacionSolicitud('supresion', undefined), ERROR_CONFIRMACION_ELIMINACION);
  assert.equal(errorConfirmacionSolicitud('supresion', 'sí'), ERROR_CONFIRMACION_ELIMINACION);
  assert.match(ERROR_CONFIRMACION_ELIMINACION, /Solicitar la eliminación de mis datos/);
});

test('servidor: la supresión con la frase (con o sin tilde) pasa', () => {
  assert.equal(errorConfirmacionSolicitud('supresion', 'Solicitar la eliminacion de mis datos'), null);
  assert.equal(errorConfirmacionSolicitud('supresion', FRASE_CONFIRMACION_ELIMINACION), null);
});

test('servidor: limitar u oponerse no piden confirmación escrita', () => {
  assert.equal(errorConfirmacionSolicitud('oposicion', undefined), null);
  assert.equal(errorConfirmacionSolicitud('limitacion', undefined), null);
});
