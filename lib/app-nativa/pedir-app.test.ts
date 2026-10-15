import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_APP, LETRAS_BAJO_EL_ICONO, bundleDeSlug, esEstadoApp, nombreSugerido, textoDeEstado, urlTiendaValida, validarNombreApp,
} from './pedir-app.ts';
import { esBundleDeEstudio } from './app-estudio.ts';

test('el nombre de la app: se limpia y se acota', () => {
  assert.deepEqual(validarNombreApp('  Luz   Pilates '), { ok: true, nombre: 'Luz Pilates' });
  assert.equal(validarNombreApp('').ok, false);
  assert.equal(validarNombreApp('   ').ok, false);
  assert.equal(validarNombreApp(null).ok, false);
  assert.equal(validarNombreApp('x'.repeat(31)).ok, false);
  assert.equal(validarNombreApp('x'.repeat(30)).ok, true);
  for (const malo of ['Luz $', 'a//b', 'a\u0000b']) assert.equal(validarNombreApp(malo).ok, false, malo);
});

test('el nombre sugerido siempre es un nombre válido', () => {
  for (const nombre of ['Luz Pilates', 'marta', 'Estudio $$ de // prueba', 'x'.repeat(80), '   ', '$$$']) {
    assert.equal(validarNombreApp(nombreSugerido(nombre)).ok, true, nombre);
  }
  assert.equal(nombreSugerido('x'.repeat(80)).length, 30);
  assert.equal(nombreSugerido('$$$'), 'Mi estudio');
  assert.ok(LETRAS_BAJO_EL_ICONO < 30);
});

test('el bundle id sale del slug y es siempre el de una app de estudio', () => {
  assert.equal(bundleDeSlug('marta'), 'app.tentare.marta');
  assert.equal(bundleDeSlug('luz-pilates'), 'app.tentare.luz-pilates');
  assert.equal(bundleDeSlug('luz-pilates', 2), 'app.tentare.luz-pilates-2');
  assert.equal(bundleDeSlug('--Luz__Pilates--'), 'app.tentare.luzpilates');
  assert.equal(bundleDeSlug('a--b'), 'app.tentare.a-b');
  assert.equal(bundleDeSlug('___'), null);
  assert.equal(bundleDeSlug('x'.repeat(200)), null);
  for (const slug of ['marta', 'luz-pilates', '123-estudio', 'a']) assert.equal(esBundleDeEstudio(bundleDeSlug(slug)), true, slug);
});

test('los estados: todos tienen texto, sin plazos ni avisos prometidos', () => {
  for (const e of ESTADOS_APP) {
    const t = textoDeEstado(e);
    assert.ok(t.titulo && t.detalle, e);
    assert.doesNotMatch(`${t.titulo} ${t.detalle}`, /\b\d+\s*(d[ií]as?|horas?|semanas?)\b|te avisamos|te avisaremos/i, e);
  }
  assert.equal(esEstadoApp('PEDIDA'), true);
  assert.equal(esEstadoApp('pedida'), false);
  assert.equal(esEstadoApp(3), false);
});

test('solo un enlace de la App Store vale como enlace de la tienda', () => {
  assert.equal(urlTiendaValida('https://apps.apple.com/es/app/marta/id123'), true);
  for (const malo of ['http://apps.apple.com/x', 'https://evil.com/https://apps.apple.com/x', 'javascript:alert(1)', '', 5, 'https://apps.apple.com/ x']) {
    assert.equal(urlTiendaValida(malo), false, String(malo));
  }
});
