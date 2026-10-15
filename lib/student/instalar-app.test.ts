import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoInstalacion, textoInstalacion, seOfrece, fraseResultado, type ContextoInstalacion } from './instalar-app.ts';

const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const INSTAGRAM_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0';

const base: ContextoInstalacion = { esNativa: false, esStandalone: false, esIOS: false, hayPrompt: false, userAgent: CHROME_ANDROID };

test('abierta desde el icono o dentro de la app nativa: no hay nada que ofrecer', () => {
  assert.equal(estadoInstalacion({ ...base, esStandalone: true, hayPrompt: true }), 'ya-instalada');
  assert.equal(estadoInstalacion({ ...base, esNativa: true, esIOS: true, userAgent: SAFARI_IOS }), 'ya-instalada');
});

test('con el prompt del navegador guardado se ofrece el botón', () => {
  assert.equal(estadoInstalacion({ ...base, hayPrompt: true }), 'instalable');
});

test('en Android sin prompt (ya rechazado, o no cumple) no se pinta un botón muerto', () => {
  assert.equal(estadoInstalacion(base), 'sin-opcion');
  assert.equal(seOfrece('sin-opcion'), false);
});

test('iPhone en Safari: guía de tres pasos y sin botón', () => {
  const e = estadoInstalacion({ ...base, esIOS: true, userAgent: SAFARI_IOS });
  assert.equal(e, 'ios-guia');
  const t = textoInstalacion(e, 'Luz');
  assert.equal(t.accion, null);
  assert.equal(t.pasos.length, 3);
  assert.match(t.pasos[1], /Añadir a pantalla de inicio/);
});

test('iPhone dentro del navegador de otra app: se manda a Safari, no a un botón que no existe', () => {
  const e = estadoInstalacion({ ...base, esIOS: true, userAgent: INSTAGRAM_IOS });
  assert.equal(e, 'ios-incrustado');
  assert.match(textoInstalacion(e, 'Luz').cuerpo, /Safari/);
});

test('solo el estado instalable lleva botón, y nombra al estudio', () => {
  const todos = ['ya-instalada', 'instalable', 'ios-guia', 'ios-incrustado', 'sin-opcion'] as const;
  for (const e of todos) assert.equal(textoInstalacion(e, 'Luz').accion === 'instalar', e === 'instalable', e);
  assert.match(textoInstalacion('instalable', 'Luz Pilates').titulo, /Luz Pilates/);
});

test('seOfrece: los tres estados con algo que hacer', () => {
  assert.deepEqual(
    (['ya-instalada', 'instalable', 'ios-guia', 'ios-incrustado', 'sin-opcion'] as const).filter(seOfrece),
    ['instalable', 'ios-guia', 'ios-incrustado'],
  );
  assert.equal(seOfrece(null), false);
});

test('nada promete la tienda de aplicaciones', () => {
  for (const e of ['instalable', 'ios-guia', 'ios-incrustado'] as const) {
    const t = textoInstalacion(e, 'Luz');
    assert.doesNotMatch(`${t.titulo} ${t.resumen} ${t.cuerpo} ${t.pasos.join(' ')}`, /App Store|Google Play|tienda/i, e);
  }
});

test('la frase del resultado distingue aceptar, rechazar y no poder', () => {
  const f = (['aceptada', 'rechazada', 'no-disponible'] as const).map(r => fraseResultado(r, 'Luz'));
  assert.equal(new Set(f).size, 3);
  assert.match(f[0], /Luz/);
});

test('con la app publicada, en el iPhone se ofrece la de la App Store (y en ningún otro sitio)', async () => {
  const { ofreceTienda } = await import('./instalar-app.ts');
  assert.equal(ofreceTienda('ios-guia', true), true);
  assert.equal(ofreceTienda('ios-incrustado', true), true);
  assert.equal(ofreceTienda('ios-guia', false), false);
  for (const e of ['instalable', 'ya-instalada', 'sin-opcion', null] as const) assert.equal(ofreceTienda(e, true), false, String(e));
});
