import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAJE_CODIGO_NO_VALE, datafonoCobra, direccionDelEstudio, direccionValida, estadoBotonDatafono, mensajeErrorLector, motivoRechazoDatafono, provinciaDeCodigoPostal,
  mensajeSinConexion, nombreModelo, normalizarCodigo, normalizarEtiqueta, type LectorDatafono,
} from './datafono.ts';

const lector = (estado: LectorDatafono['estado']): LectorDatafono => ({ etiqueta: 'Mostrador', modelo: 'Stripe Reader S700', estado });

test('el botón: sin Stripe se apaga como siempre; sin lector, CONECTA (antes salía apagado sin decir dónde)', () => {
  assert.equal(estadoBotonDatafono({ stripeConectado: false, emparejado: true, lector: lector('online') }), 'sin-stripe');
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: false, lector: undefined }), 'sin-conectar');
  assert.equal(estadoBotonDatafono({ stripeConectado: true, emparejado: true, lector: null }), 'sin-conectar', 'borrado en Stripe');
});

test('el botón con SumUp: sin Stripe, un Solo emparejado cobra y, si SumUp se ofrece, se puede conectar', () => {
  const solo = { ...lector('online'), modelo: 'SumUp Solo' };
  assert.equal(estadoBotonDatafono({ stripeConectado: false, proveedor: 'sumup', emparejado: true, lector: solo }), 'listo');
  assert.equal(estadoBotonDatafono({ stripeConectado: false, proveedor: 'sumup', emparejado: true, lector: undefined }), 'comprobando');
  assert.equal(estadoBotonDatafono({ stripeConectado: false, proveedor: 'sumup', emparejado: true, lector: null }), 'sin-conectar');
  assert.equal(estadoBotonDatafono({ stripeConectado: false, sumupDisponible: true, emparejado: false, lector: null }), 'sin-conectar');
  // Un datáfono de Stripe guardado sin Stripe conectado no sirve: SumUp disponible solo deja conectar otro.
  assert.equal(estadoBotonDatafono({ stripeConectado: false, sumupDisponible: true, proveedor: 'stripe', emparejado: true, lector: lector('online') }), 'sin-conectar');
  assert.equal(estadoBotonDatafono({ stripeConectado: false, sumupDisponible: false, emparejado: false, lector: null }), 'sin-stripe');
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

test('⚠️ la provincia sale del código postal (Stripe no registra un datáfono en España sin ella)', () => {
  assert.equal(provinciaDeCodigoPostal('28010'), 'M');
  assert.equal(provinciaDeCodigoPostal('08001'), 'B');
  assert.equal(provinciaDeCodigoPostal('15001'), 'C');
  assert.equal(provinciaDeCodigoPostal('07001'), 'PM');
  assert.equal(provinciaDeCodigoPostal('01001'), 'VI');
  assert.equal(provinciaDeCodigoPostal('52001'), 'ML');
  // Las 52 provincias tienen la suya; fuera de 01–52 no es un código postal español.
  for (let n = 1; n <= 52; n++) assert.ok(provinciaDeCodigoPostal(`${String(n).padStart(2, '0')}123`), `prefijo ${n}`);
  for (const cp of ['00123', '53123', '99999', '2801', '280100', 'abcde', '']) assert.equal(provinciaDeCodigoPostal(cp), null, cp);
  // Y una dirección con un código postal sin provincia no vale: Stripe la rechazaría.
  assert.equal(direccionValida({ linea: 'Calle de Ejemplo 12', codigoPostal: '00123', ciudad: 'Madrid' }), null);
  assert.equal(direccionValida({ linea: 'Calle de Ejemplo 12', codigoPostal: '99999', ciudad: 'Madrid' }), null);
});

test('el rechazo de una tarjeta se dice en español, nunca con el texto de Stripe', () => {
  assert.equal(motivoRechazoDatafono({ code: 'card_declined', decline_code: 'generic_decline' }),
    'El banco ha rechazado la tarjeta. No se ha cobrado nada: prueba con otra.');
  assert.match(motivoRechazoDatafono({ code: 'card_declined', decline_code: 'insufficient_funds' }), /no tiene saldo suficiente/);
  assert.match(motivoRechazoDatafono({ code: 'expired_card' }), /caducada/);
  assert.match(motivoRechazoDatafono({ code: 'incorrect_pin' }), /PIN no es correcto/);
  // Reintento con PIN abandonado: vale la misma tarjeta, no «prueba con otra».
  assert.match(motivoRechazoDatafono({ code: 'card_declined', decline_code: 'offline_pin_required' }), /insértala y marca el PIN/);
  assert.match(motivoRechazoDatafono(null), /rechazado la tarjeta/);
  // Ninguno trae el inglés de Stripe.
  for (const c of ['card_declined', 'insufficient_funds', 'expired_card', 'lost_card', 'xyz']) {
    assert.doesNotMatch(motivoRechazoDatafono({ decline_code: c }), /declined|card/i);
  }
});

