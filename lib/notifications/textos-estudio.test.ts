import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ETIQUETA_VARIABLE, TIPOS_CON_TEXTO_EDITABLE, esTextoEditable, previsualizar, textoDeFabrica,
  textoEfectivo, textoEnLista, validarTexto, variablesPermitidas,
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
  assert.equal(validarTexto(e, { title: 'Tu clase es en {antelacion}', body: '{clase} a las {hora}, te guardamos el sitio' }), null);
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

test('«falta… (con el verbo)» se puede usar en los recordatorios y en nada más', () => {
  const t = { title: 'Ya {faltan}', body: '{clase} a las {hora}' };
  assert.equal(validarTexto('reserva.recordatorio_1h', t), null);
  assert.equal(validarTexto('reserva.recordatorio_24h', t), null);
  // Otro aviso no la trae: se quedaría en blanco.
  assert.match(validarTexto('clase.cancelada', { title: 'Ya {faltan}', body: '{clase}' })!, /\{faltan\}/);
  assert.equal(previsualizar(t, { faltan: 'falta 1 hora' }).title, 'Ya falta 1 hora');
});

test('«faltan {antelacion}» no se deja guardar: con 1 hora diría «faltan 1 hora»', () => {
  for (const frase of ['Faltan {antelacion}', 'Falta {antelacion} para tu clase', 'Quedan {antelacion}', 'queda {antelacion}']) {
    assert.match(validarTexto('reserva.recordatorio_1h', { title: frase, body: '{clase}' })!, /falta… \(con el verbo\)/, frase);
  }
  // Y el motor, si se encontrara uno guardado así, manda el de fábrica.
  const guardado = { title: 'Faltan {antelacion}', body: '{clase} a las {hora}' };
  assert.deepEqual(textoEfectivo('reserva.recordatorio_1h', guardado), textoDeFabrica('reserva.recordatorio_1h'));
  // «es en {antelacion}» concuerda siempre: se puede.
  assert.equal(validarTexto('reserva.recordatorio_1h', { title: 'Tu clase es en {antelacion}', body: '{clase}' }), null);
});

test('mensaje nuevo: un texto propio con el principio del mensaje o con quien atiende cae al de fábrica', () => {
  const e = 'mensaje.recibido';
  // El de fábrica ya no lleva el texto del mensaje (guía 4.5.4 de Apple) y, en
  // el hilo con el estudio, firma el estudio, no la persona de recepción.
  assert.deepEqual(variablesPermitidas(e), ['quienEscribe']);
  const conTexto = { title: 'Nuevo mensaje', body: '{quienEscribe}{previsualizacion}' };
  assert.match(validarTexto(e, conTexto)!, /\{previsualizacion\}/);
  assert.deepEqual(textoEfectivo(e, conTexto), textoDeFabrica(e));
  // Tampoco en el título.
  assert.deepEqual(textoEfectivo(e, { title: '{previsualizacion}', body: '{quienEscribe} te ha escrito' }), textoDeFabrica(e));
  // Ni con el nombre de quien atiende.
  assert.deepEqual(textoEfectivo(e, { title: 'Nuevo mensaje', body: '{remitente} te ha escrito' }), textoDeFabrica(e));
  // Uno propio con {quienEscribe} sí vale.
  const propio = { title: 'Te han contestado', body: '{quienEscribe} te ha respondido en la app' };
  assert.deepEqual(textoEfectivo(e, propio), propio);
});

test('{quienEscribe} tiene nombre en el panel y ejemplo en la vista previa', () => {
  assert.ok(ETIQUETA_VARIABLE.quienEscribe);
  assert.equal(previsualizar(textoDeFabrica('mensaje.recibido')!).body, 'Pilates Luz te ha escrito.');
});

test('Configuración no enseña como «tuyo» un texto que ya no sale: el de fábrica, y aviso', () => {
  const e = 'mensaje.recibido';
  // Guardado con el principio del mensaje, que el aviso ya no lleva.
  const viejo = { title: 'Mensaje de {remitente}', body: '{remitente}{previsualizacion}' };
  const r = textoEnLista(e, viejo);
  assert.deepEqual(r, { texto: textoDeFabrica(e), propio: false, yaNoSeUsa: true });
  // Y su vista previa no trae el principio de ningún mensaje.
  assert.doesNotMatch(`${previsualizar(r.texto).title} ${previsualizar(r.texto).body}`, /Nos vemos/);
  // Uno que vale sigue siendo suyo; sin texto propio, el de fábrica sin aviso.
  const vale = { title: 'Te han contestado', body: '{quienEscribe} te ha respondido' };
  assert.deepEqual(textoEnLista(e, vale), { texto: vale, propio: true, yaNoSeUsa: false });
  assert.deepEqual(textoEnLista(e, undefined), { texto: textoDeFabrica(e), propio: false, yaNoSeUsa: false });
});
