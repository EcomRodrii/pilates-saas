import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeParaSocia, enlaceWhatsApp, telefonoE164 } from './mensajes-socia.ts';

test('mensajeParaSocia: RECUPERAR_SOCIA usa el nombre y el estudio, tono para la SOCIA', () => {
  const m = mensajeParaSocia('RECUPERAR_SOCIA', { nombre: 'Marta' }, 'Pilates Boutique');
  assert.ok(m);
  assert.match(m!.cuerpo, /Marta/);
  assert.match(m!.cuerpo, /Pilates Boutique/);
  // No debe filtrar la jerga orientada al propietario.
  assert.doesNotMatch(m!.cuerpo, /yo le|lleva \d+ días sin aparecer/i);
});

test('mensajeParaSocia: cubre lead, prueba y cobro pendiente', () => {
  assert.ok(mensajeParaSocia('CONTACTAR_LEAD', { nombre: 'Ana' }, 'X'));
  assert.ok(mensajeParaSocia('CONVERTIR_PRUEBA', { nombre: 'Ana' }, 'X'));
  const cobro = mensajeParaSocia('COBRAR_PENDIENTE', { nombre: 'Ana', total: 60 }, 'X');
  assert.match(cobro!.cuerpo, /60€/);
});

test('mensajeParaSocia: tipos sin contacto (FUSIONAR_SESIONES) o sin nombre → null', () => {
  assert.equal(mensajeParaSocia('FUSIONAR_SESIONES', { ocupacionMediaPct: 40 }, 'X'), null);
  assert.equal(mensajeParaSocia('RECUPERAR_SOCIA', {}, 'X'), null);
});

test('enlaceWhatsApp: móvil español sin prefijo → +34, texto url-encoded', () => {
  const href = enlaceWhatsApp('612 34 56 78', 'Hola Marta');
  assert.equal(href, 'https://wa.me/34612345678?text=Hola%20Marta');
});

test('enlaceWhatsApp: respeta prefijo internacional existente; sin teléfono → null', () => {
  assert.equal(enlaceWhatsApp('+44 7700 900000', 'x'), 'https://wa.me/447700900000?text=x');
  assert.equal(enlaceWhatsApp(null, 'x'), null);
  assert.equal(enlaceWhatsApp('', 'x'), null);
});

test('telefonoE164: normaliza a E.164 (móvil ES → +34, respeta intl y 00)', () => {
  assert.equal(telefonoE164('612 34 56 78'), '+34612345678');   // móvil ES sin prefijo
  assert.equal(telefonoE164('+44 7700 900000'), '+447700900000'); // intl con +
  assert.equal(telefonoE164('0034 612345678'), '+34612345678');   // prefijo 00 internacional
  assert.equal(telefonoE164('34612345678'), '+34612345678');      // ya con 34, sin +
  assert.equal(telefonoE164(null), null);
  assert.equal(telefonoE164('sin numero'), null);
});

test('mensajeParaSocia: CONGELAR_MEMBRESIA propone la pausa a la socia', () => {
  const m = mensajeParaSocia('CONGELAR_MEMBRESIA', { nombre: 'Lucía' }, 'Pilates Boutique');
  assert.ok(m);
  assert.match(m!.cuerpo, /Lucía/);
  assert.match(m!.cuerpo, /congel|pausa/i);
});
