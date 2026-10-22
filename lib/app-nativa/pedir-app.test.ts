import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bloqueoParaPedir, idDeTienda,
  ESTADOS_APP, LETRAS_BAJO_EL_ICONO, bundleDeSlug, bundlesCandidatos, esCupo, esEstadoApp, nombreSugerido, textoDeEstado, urlTiendaValida, validarNombreApp,
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
  assert.equal(urlTiendaValida('https://apps.apple.com/es/app/marta/id6822491721'), true);
  for (const malo of ['http://apps.apple.com/x', 'https://evil.com/https://apps.apple.com/x', 'javascript:alert(1)', '', 5, 'https://apps.apple.com/ x']) {
    assert.equal(urlTiendaValida(malo), false, String(malo));
  }
});

test('primero el hueco del lote; si no hay, los del slug', () => {
  assert.deepEqual(bundlesCandidatos('app.tentare.cupo-003', 'luz', 2), ['app.tentare.cupo-003', 'app.tentare.luz', 'app.tentare.luz-2']);
  assert.deepEqual(bundlesCandidatos(null, 'luz', 2), ['app.tentare.luz', 'app.tentare.luz-2']);
  // Un slug que no da identificador deja solo el hueco.
  assert.deepEqual(bundlesCandidatos('app.tentare.cupo-001', '___', 3), ['app.tentare.cupo-001']);
  assert.deepEqual(bundlesCandidatos(null, '___', 3), []);
});

test('se reconoce un hueco del lote', () => {
  assert.equal(esCupo('app.tentare.cupo-001'), true);
  assert.equal(esCupo('app.tentare.marta'), false);
  assert.equal(esCupo('app.tentare.cupo-1'), false);
});

test('el slug nunca da el identificador de un hueco del lote', () => {
  assert.equal(bundleDeSlug('cupo-001'), null);
  assert.equal(bundleDeSlug('cupo-00', 2), 'app.tentare.cupo-00-2');
  assert.deepEqual(bundlesCandidatos(null, 'cupo-007', 1), []);
});

test('pedir la app: solo con Estudio o Cadena pagado, y en una cadena desde la sede principal', () => {
  const base = { planIncluye: true, estado: 'active', esSedeSecundaria: false };
  assert.equal(bloqueoParaPedir(base), null);
  assert.equal(bloqueoParaPedir({ ...base, planIncluye: false }), 'plan');
  assert.equal(bloqueoParaPedir({ ...base, estado: 'trialing' }), 'prueba');
  for (const e of ['past_due', 'unpaid', 'incomplete']) assert.equal(bloqueoParaPedir({ ...base, estado: e }), 'cobro', e);
  for (const e of ['gratis', 'canceled', 'trial_expirado', null]) assert.equal(bloqueoParaPedir({ ...base, estado: e }), 'sin-plan', String(e));
  assert.equal(bloqueoParaPedir({ ...base, esSedeSecundaria: true }), 'sede');
});

test('nombres con caracteres que no se ven o que parten un emoji', () => {
  for (const raro of ['Luz\u200bPilates', 'Pilates\u202eLuz', 'Luz\u0007']) {
    assert.equal(validarNombreApp(raro).ok, false, JSON.stringify(raro));
  }
  // Un salto de línea Unicode es un espacio más: se normaliza, no se cuela.
  assert.deepEqual(validarNombreApp('Luz\u2028Pilates'), { ok: true, nombre: 'Luz Pilates' });
  // 30 letras con un emoji al final: es válido (Apple cuenta letras, no unidades de código).
  assert.equal(validarNombreApp('a'.repeat(29) + '🧘').ok, true);
  // El sugerido nunca parte un emoji ni deja un nombre inválido.
  const sug = nombreSugerido('a'.repeat(29) + '🧘🧘');
  assert.equal([...sug].length, 30);
  assert.equal(validarNombreApp(sug).ok, true);
  assert.equal(nombreSugerido('\u200b'), 'Mi estudio');
});

test('el enlace de la tienda es el de la ficha de una app, y de él sale su id', () => {
  assert.equal(urlTiendaValida('https://apps.apple.com/app/id6822491721'), true);
  for (const malo of ['https://apps.apple.com/a', 'https://apps.apple.com/es/developer/x/id6822491721', 'https://apps.apple.com/es/app/x/id12']) {
    assert.equal(urlTiendaValida(malo), false, malo);
  }
  assert.equal(idDeTienda('https://apps.apple.com/es/app/marta/id6822491721'), '6822491721');
  assert.equal(idDeTienda('https://apps.apple.com/a'), null);
  assert.equal(idDeTienda(null), null);
});
