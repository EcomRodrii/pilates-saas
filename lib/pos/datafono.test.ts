import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAJE_CODIGO_NO_VALE, datafonoCobra, direccionDelEstudio, direccionValida, estadoBotonDatafono, mensajeErrorLector,
  mensajeSinConexion, nombreModelo, normalizarCodigo, normalizarEtiqueta, type LectorDatafono,
} from './datafono.ts';

const lector = (estado: LectorDatafono['estado']): LectorDatafono => ({ etiqueta: 'Mostrador', modelo: 'Stripe Reader S700', estado });

test('el botón: sin Stripe se apaga como siempre; sin lector, CONECTA (antes salía apagado sin decir dónde)', () => {
  assert.equal(estadoBotonDatafono({ stripeConectado: false, emparejado: true, lector: lector('online') }), 'sin-stripe');
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: false, lector: undefined }), 'sin-conectar');
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: true, lector: null }), 'sin-conectar', 'borrado en Stripe');
});

test('el botón: con lector, lo que diga Stripe; sin respuesta, «comprobando» y se deja cobrar', () => {
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: true, lector: lector('online') }), 'listo');
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: true, lector: lector('offline') }), 'sin-conexion');
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: true, lector: lector(null) }), 'listo', 'sin estado = no se le cierra el paso');
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: true, lector: undefined }), 'comprobando');
  assert.equal(datafonoCobra('comprobando'), true, 'si no responde, lo dice el servidor al mandar el importe');
  assert.equal(datafonoCobra('listo'), true);
  for (const e of ['sin-stripe', 'sin-conectar', 'sin-conexion'] as const) assert.equal(datafonoCobra(e), false, e);
});

test('el código: tres palabras como salen en el datáfono, con lo que se teclea de más arreglado', () => {
  assert.equal(normalizarCodigo('sepia-cerulean-aqua'), 'sepia-cerulean-aqua');
  assert.equal(normalizarCodigo('  Sepia Cerulean  Aqua '), 'sepia-cerulean-aqua');
  assert.equal(normalizarCodigo('sepia--cerulean_aqua'), 'sepia-cerulean-aqua');
  assert.equal(normalizarCodigo('simulated-wpe'), 'simulated-wpe');
  for (const malo of ['', 'sepia', 'sepia-cerulean-aqua; drop', 'a-b', 'ñandú-cerulean-aqua', 42, null, 'x'.repeat(70)]) {
    assert.equal(normalizarCodigo(malo), null, String(malo));
  }
});

test('el nombre: sin espacios de más, con tope, y «Mostrador» si llega vacío', () => {
  assert.equal(normalizarEtiqueta('  Sala   grande '), 'Sala grande');
  assert.equal(normalizarEtiqueta(''), 'Mostrador');
  assert.equal(normalizarEtiqueta(undefined), 'Mostrador');
  assert.equal(normalizarEtiqueta('x'.repeat(80)).length, 40);
});

test('la dirección: calle, CP de 5 cifras y ciudad, o nada (Stripe la exige entera)', () => {
  assert.deepEqual(direccionValida({ linea: ' Calle de Ejemplo 12 ', codigoPostal: '28 010', ciudad: 'Madrid' }),
    { linea: 'Calle de Ejemplo 12', codigoPostal: '28010', ciudad: 'Madrid' });
  assert.equal(direccionValida({ linea: 'Calle de Ejemplo 12', codigoPostal: '2801', ciudad: 'Madrid' }), null);
  assert.equal(direccionValida({ linea: '', codigoPostal: '28010', ciudad: 'Madrid' }), null);
  assert.equal(direccionValida({ linea: 'Calle 1', codigoPostal: '28010', ciudad: '' }), null);
  assert.equal(direccionValida(null), null);
  assert.deepEqual(direccionDelEstudio({ direccion: 'Calle 1', codigo_postal: '08001', ciudad: 'Barcelona' }),
    { linea: 'Calle 1', codigoPostal: '08001', ciudad: 'Barcelona' });
  assert.equal(direccionDelEstudio({ direccion: null, codigo_postal: null, ciudad: null }), null);
});

test('el modelo, dicho para personas; los simulados del modo de prueba, como tal', () => {
  assert.equal(nombreModelo('stripe_s700'), 'Stripe Reader S700');
  assert.equal(nombreModelo('bbpos_wisepos_e'), 'BBPOS WisePOS E');
  assert.equal(nombreModelo('simulated_wisepos_e'), 'Datáfono de prueba');
  assert.equal(nombreModelo('otro_cacharro'), null);
  assert.equal(nombreModelo(null), null);
});

test('los errores de Stripe, en el idioma del mostrador; lo que no se reconoce no se traduce a ciegas', () => {
  assert.equal(mensajeErrorLector({ code: 'terminal_reader_offline' }, 'Mostrador'), mensajeSinConexion('Mostrador'));
  assert.equal(mensajeErrorLector({ code: 'terminal_reader_timeout' }), mensajeSinConexion(null));
  assert.match(mensajeErrorLector({ code: 'terminal_reader_busy' }, 'Mostrador'), /ocupado/);
  assert.equal(mensajeErrorLector({ param: 'registration_code', message: 'x' }), MENSAJE_CODIGO_NO_VALE);
  assert.equal(mensajeErrorLector({ message: 'The registration code is invalid.' }), MENSAJE_CODIGO_NO_VALE);
  assert.match(mensajeErrorLector({ code: 'api_error', message: 'Something broke' }), /No se ha podido conectar/);
  assert.match(mensajeSinConexion(null), /datáfono Mostrador/);
});
