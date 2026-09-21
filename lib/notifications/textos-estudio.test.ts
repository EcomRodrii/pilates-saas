import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETIQUETA_VARIABLE, TIPOS_CON_TEXTO_EDITABLE, esTextoEditable, previsualizar, textoDeFabrica,
  textoEfectivo, validarTexto, variablesPermitidas,
} from './textos-estudio.ts';

const EVENTOS = TIPOS_CON_TEXTO_EDITABLE.flatMap(g => g.tipos.map(t => t.evento));

test('todo aviso de la alumna tiene texto de fábrica que editar', () => {
  for (const e of EVENTOS) assert.ok(esTextoEditable(e), `${e} sin plantilla de alumna`);
});

test('cada variable que puede usar el estudio tiene nombre en el panel y ejemplo en la vista previa', () => {
  // Sin etiqueta el panel enseñaría `{motivoTexto}` a pelo; sin muestra, la
  // vista previa dejaría un hueco y parecería un fallo.
  for (const e of EVENTOS) {
    for (const v of variablesPermitidas(e)) {
      assert.ok(ETIQUETA_VARIABLE[v], `{${v}} (de ${e}) sin etiqueta`);
      assert.ok(!previsualizar({ title: `{${v}}`, body: 'x' }).title.includes('{'), `{${v}} sin muestra`);
    }
  }
});

test('el texto de fábrica pasa su propia validación', () => {
  for (const e of EVENTOS) assert.equal(validarTexto(e, textoDeFabrica(e)!), null, e);
});

test('rechaza lo vacío, lo largo y las variables que el aviso no trae', () => {
  const e = 'reserva.recordatorio_24h';
  assert.match(validarTexto(e, { title: '  ', body: 'x' })!, /título/);
  assert.match(validarTexto(e, { title: 'x', body: '' })!, /texto/);
  assert.match(validarTexto(e, { title: 'x'.repeat(81), body: 'x' })!, /80/);
  assert.match(validarTexto(e, { title: 'x', body: 'x'.repeat(241) })!, /240/);
  assert.match(validarTexto(e, { title: '¡Hola {nombre}!', body: '{clase}' })!, /\{nombre\}/);
  assert.equal(validarTexto(e, { title: 'Faltan {antelacion}', body: '{clase} a las {hora}, te guardamos el sitio' }), null);
  assert.match(validarTexto('sistema.stripe_desconectado', { title: 'x', body: 'x' })!, /no se puede/);
});

test('textoEfectivo: el del estudio si vale; si no, el de fábrica', () => {
  const e = 'reserva.recordatorio_1h';
  const propio = { title: 'En {antelacion} empezamos', body: '{clase} a las {hora}' };
  assert.deepEqual(textoEfectivo(e, propio), propio);
  assert.deepEqual(textoEfectivo(e, null), textoDeFabrica(e));
  // Guardado antes de un cambio del catálogo: mejor el de fábrica que uno roto.
  assert.deepEqual(textoEfectivo(e, { title: 'Hola {nombre}', body: '{clase}' }), textoDeFabrica(e));
});

test('vista previa: cada recordatorio con la antelación que le pasa la pantalla', () => {
  const corto = textoDeFabrica('reserva.recordatorio_1h')!;
  assert.equal(previsualizar(corto, { antelacion: '30 minutos' }).title, 'Tu clase es en 30 minutos');
});

test('vista previa: la instructora del cambio de clase no se pega a la sala', () => {
  const t = previsualizar(textoDeFabrica('clase.modificada')!, {}, 'clase.modificada');
  assert.doesNotMatch(t.body, /NorteAna/);
  assert.match(t.body, /Sala Norte con Ana/);
});
