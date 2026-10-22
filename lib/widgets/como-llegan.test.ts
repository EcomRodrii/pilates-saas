import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fraseComoLlegan } from './como-llegan.ts';

const boton = 'Publicar en mi web';

test('dentro de una página, por id y con el estilo: lo de la maqueta aprobada', () => {
  assert.equal(
    fraseComoLlegan({ metodo: 'iframe', porId: true, sigueElEstilo: true, boton }),
    'Lo pegas una vez. Tus clases, precios y plazas se actualizan solos; el estilo y lo que enseña llegan cuando pulsas «Publicar en mi web».',
  );
});

test('un código de antes (sin id): lo que enseña pide pegarlo otra vez, y se dice', () => {
  const f = fraseComoLlegan({ metodo: 'popup', porId: false, sigueElEstilo: true, boton });
  assert.match(f, /el estilo llega cuando pulsas «Publicar en mi web»/);
  assert.match(f, /Si cambias lo que enseña, tendrás que pegarlo otra vez\./);
});

test('con un diseño propio, el estilo de tus widgets no le llega: nunca se promete', () => {
  const porId = fraseComoLlegan({ metodo: 'iframe', porId: true, sigueElEstilo: false, boton });
  assert.doesNotMatch(porId, /el estilo/);
  assert.match(porId, /lo que enseña y su diseño propio llegan cuando pulsas/);
  const congelado = fraseComoLlegan({ metodo: 'nativa', porId: false, sigueElEstilo: false, boton });
  assert.doesNotMatch(congelado, /«Publicar en mi web»/);
  assert.match(congelado, /Si cambias lo que enseña o su diseño propio, tendrás que pegarlo otra vez\./);
});

test('un enlace o un botón a la página: nada que publicar, la página se ve como su app', () => {
  for (const metodo of ['enlace', 'boton'] as const) {
    for (const porId of [true, false]) {
      const f = fraseComoLlegan({ metodo, porId, sigueElEstilo: true, boton });
      assert.doesNotMatch(f, /Publicar/);
      assert.match(f, /como tu app/);
    }
  }
});

test('nunca las tres etiquetas de antes', () => {
  for (const metodo of ['iframe', 'nativa', 'popup', 'boton', 'enlace'] as const) {
    for (const porId of [true, false]) {
      for (const sigueElEstilo of [true, false]) {
        const f = fraseComoLlegan({ metodo, porId, sigueElEstilo, boton });
        assert.doesNotMatch(f, /Siempre al día|Pegar el código otra vez|Con «/);
      }
    }
  }
});
