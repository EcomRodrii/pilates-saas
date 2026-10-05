// El aviso de un mensaje nuevo, tal como le llega a la alumna: sin el texto del
// mensaje (guía 4.5.4 de Apple: en sus hilos se habla de salud y el push se ve
// con el móvil bloqueado), firmado por el estudio en el hilo con el estudio, y
// abriendo el hilo al tocarlo, no la bandeja de avisos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTOS, plantillaDe, render } from './catalog.ts';
import { QUIEN_ESCRIBE_POR_DEFECTO, quienEscribeALaAlumna } from './aviso-mensaje.ts';
import { previsualizacionParaAviso } from '../mensajeria/presentacion.ts';

const SOCIA = plantillaDe(EVENTOS.MENSAJE_RECIBIDO, 'SOCIA')!;
const RESUMEN = plantillaDe(EVENTOS.MENSAJE_DIGEST_NO_LEIDO, 'SOCIA')!;

test('tocar el aviso de un mensaje abre ese hilo en la app de la alumna', () => {
  assert.equal(SOCIA.deepLink?.({ slug: 'pilates-luz', conversacionId: 'conv-1' }), '/portal/pilates-luz/mensajes/conv-1');
});

test('sin slug no hay a dónde llevarla: sin enlace, nunca un `/portal//…` roto', () => {
  assert.equal(SOCIA.deepLink?.({ slug: null, conversacionId: 'conv-1' }), null);
  assert.equal(SOCIA.deepLink?.({ slug: '', conversacionId: 'conv-1' }), null);
  assert.equal(RESUMEN.deepLink?.({ slug: '' }), null);
});

test('el resumen de mensajes sin leer lleva a Mensajes, donde está el punto de cada hilo', () => {
  assert.equal(RESUMEN.deepLink?.({ slug: 'pilates-luz', conversaciones: 2 }), '/portal/pilates-luz/mensajes');
});

test('el aviso no lleva el texto y, en el hilo con el estudio, le escribe el estudio', () => {
  const cuerpo = 'Me duele la rodilla desde la última clase, ¿vengo mañana?';
  // Los datos tal como los arma emitirMensajeRecibido para un hilo con alumna.
  const datos = (tipo: string, remitente: string, estudio: string | null) => ({
    remitente,
    quienEscribe: quienEscribeALaAlumna(tipo, remitente, estudio),
    ...(previsualizacionParaAviso(tipo, cuerpo) ? { previsualizacion: 'no debería estar' } : {}),
  });

  const conEstudio = render(SOCIA.body, datos('ALUMNA_MOSTRADOR', 'Marta López', 'Pilates Luz'));
  assert.equal(conEstudio, 'Pilates Luz te ha escrito.');
  assert.ok(!conEstudio.includes('rodilla'));
  assert.ok(!conEstudio.includes('Marta'), 'a la alumna le escribe el estudio, no quien está en recepción');

  assert.equal(render(SOCIA.body, datos('ALUMNA_INSTRUCTORA', 'Laura', null)), 'Laura te ha escrito.');

  // Sin nombre del estudio (la consulta falló o viene vacío): nunca « te ha escrito.».
  assert.equal(quienEscribeALaAlumna('ALUMNA_MOSTRADOR', 'Marta López', '  '), QUIEN_ESCRIBE_POR_DEFECTO);
  assert.equal(quienEscribeALaAlumna('ALUMNA_MOSTRADOR', 'Marta López', null), 'Tu estudio');
  assert.equal(render(SOCIA.body, datos('ALUMNA_MOSTRADOR', 'Marta López', null)), 'Tu estudio te ha escrito.');
});

test('al equipo y a la instructora tampoco les llega el texto de un hilo con alumna', () => {
  for (const rol of ['PROPIETARIO', 'RECEPCION', 'INSTRUCTOR'] as const) {
    const p = plantillaDe(EVENTOS.MENSAJE_RECIBIDO, rol)!;
    // Sin `previsualizacion` en los datos (hilo con alumna), la frase acaba en el nombre.
    assert.equal(render(p.body, { remitente: 'Lucía M.' }), 'Lucía M. te ha escrito.', rol);
  }
});
