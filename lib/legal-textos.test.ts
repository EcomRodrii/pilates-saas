import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  politicaPrivacidadPorDefecto, terminosServicioPorDefecto,
  identificacionResponsable, faltanDatosFiscales, textoLegalCompleto,
} from './legal-textos.ts';

const ESTUDIO = {
  nombre: 'Pilates Centro',
  razonSocial: 'Pilates Cloe SL',
  nif: 'B67891234',
  direccion: 'Carrer de Balmes 145, 3r 1a',
  ciudad: 'Barcelona',
  codigoPostal: '08008',
  email: 'hola@pilatescentro.es',
  cancelacionVentanaHoras: 24,
};

test('la política identifica al responsable con sus datos fiscales (RGPD 13.1.a)', () => {
  const t = politicaPrivacidadPorDefecto(ESTUDIO);
  assert.ok(t.includes('Pilates Cloe SL'), 'debe llevar la razón social');
  assert.ok(t.includes('B67891234'), 'debe llevar el NIF');
  assert.ok(t.includes('Carrer de Balmes 145, 3r 1a'), 'debe llevar el domicilio');
  assert.ok(t.includes('08008 Barcelona'));
  assert.ok(t.includes('hola@pilatescentro.es'));
  // Y ya no puede quedar la fórmula anónima que había antes.
  assert.ok(!t.includes('es el estudio de pilates'));
});

test('la razón social manda sobre el nombre comercial (es quien factura)', () => {
  const t = identificacionResponsable(ESTUDIO)!;
  assert.ok(t.startsWith('Pilates Cloe SL'));
});

test('sin razón social se usa el nombre comercial', () => {
  const t = identificacionResponsable({ nombre: 'Pilates Centro', nif: 'B1' })!;
  assert.ok(t.startsWith('Pilates Centro'));
});

test('sin ningún dato fiscal, el documento lo DICE en vez de fingir', () => {
  assert.equal(identificacionResponsable({}), null);
  assert.ok(faltanDatosFiscales({}));
  const t = politicaPrivacidadPorDefecto({});
  assert.ok(t.includes('no ha completado sus datos fiscales'));
  assert.ok(t.includes('Configuración'), 'debe decir dónde se arregla');
});

test('los términos usan la ventana de cancelación REAL del estudio', () => {
  assert.ok(terminosServicioPorDefecto(ESTUDIO).includes('menos de 24 horas'));
  assert.ok(terminosServicioPorDefecto({ ...ESTUDIO, cancelacionVentanaHoras: 8 }).includes('menos de 8 horas'));
  // Singular cuando toca: "menos de 1 hora", no "1 horas".
  assert.ok(terminosServicioPorDefecto({ ...ESTUDIO, cancelacionVentanaHoras: 1 }).includes('menos de 1 hora '));
});

test('sin ventana configurada cae a 12 h, que es lo que decía el texto anterior', () => {
  assert.ok(terminosServicioPorDefecto({ ...ESTUDIO, cancelacionVentanaHoras: null }).includes('menos de 12 horas'));
});

test('los términos también identifican al prestador del servicio', () => {
  const t = terminosServicioPorDefecto(ESTUDIO);
  assert.ok(t.includes('PRESTADOR DEL SERVICIO'));
  assert.ok(t.includes('Pilates Cloe SL'));
  assert.ok(t.includes('B67891234'));
});

test('un estudio a medio rellenar no rompe el texto', () => {
  const t = politicaPrivacidadPorDefecto({ nombre: 'Pilates Centro' });
  assert.ok(t.includes('Pilates Centro'));
  assert.ok(!t.includes('undefined'));
  assert.ok(!t.includes('NIF/CIF:'), 'sin NIF no se pinta la etiqueta vacía');
  assert.ok(!faltanDatosFiscales({ nombre: 'Pilates Centro' }));
});

test('se informa del derecho a reclamar ante la AEPD', () => {
  assert.ok(politicaPrivacidadPorDefecto(ESTUDIO).includes('Agencia Española de Protección de Datos'));
});

// Lo que se ENSEÑA y lo que se GUARDA como evidencia tienen que ser el mismo
// texto. El portal mostraba solo los términos con una casilla que decía "y la
// política de privacidad", y guardaba 'v1.1' fijo como versión aceptada.
test('el texto legal completo lleva los DOS documentos', () => {
  const t = textoLegalCompleto({ politicaPrivacidad: 'POLÍTICA X', terminosServicio: 'TÉRMINOS Y' });
  assert.ok(t.includes('POLÍTICA X'));
  assert.ok(t.includes('TÉRMINOS Y'));
  assert.ok(t.indexOf('POLÍTICA X') < t.indexOf('TÉRMINOS Y'), 'la política va primero');
});

test('sirve como evidencia: cambia si cambian los textos del estudio', () => {
  const a = textoLegalCompleto({ politicaPrivacidad: 'P1', terminosServicio: 'T' });
  const b = textoLegalCompleto({ politicaPrivacidad: 'P2', terminosServicio: 'T' });
  assert.notEqual(a, b, "una versión fija ('v1.1') no distinguía qué se aceptó");
});
