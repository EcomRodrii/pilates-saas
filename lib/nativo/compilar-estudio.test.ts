import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitlementsCompletos, equipoDeXcconfig, numeroDeBuild, opcionesDeExport, pngSinAlfa, urlIcono1024 } from './compilar-estudio.ts';

test('el número de build es la fecha y hora UTC, y crece', () => {
  assert.equal(numeroDeBuild(new Date('2026-10-14T07:05:00Z')), '202610140705');
  assert.ok(Number(numeroDeBuild(new Date('2026-10-14T07:06:00Z'))) > Number(numeroDeBuild(new Date('2026-10-14T07:05:00Z'))));
  assert.ok(Number(numeroDeBuild(new Date('2026-11-01T00:00:00Z'))) > Number(numeroDeBuild(new Date('2026-10-31T23:59:00Z'))));
});

test('el icono de 1024 sale de los mismos parámetros que el de 192, y solo de esos', () => {
  const u = urlIcono1024('https://www.tentare.app', '/icono-estudio?inicial=L&color=%237A8B6F&size=192&r=2&icono=https%3A%2F%2Fx.supabase.co%2Fa.png&otro=malo');
  const p = new URL(u).searchParams;
  assert.equal(new URL(u).origin, 'https://www.tentare.app');
  assert.equal(p.get('size'), '1024');
  assert.equal(p.get('inicial'), 'L');
  assert.equal(p.get('color'), '#7A8B6F');
  assert.equal(p.get('icono'), 'https://x.supabase.co/a.png');
  assert.equal(p.get('otro'), null);
  assert.equal(p.get('logo'), null);
});

/** Un PNG de cabecera mínima para probar solo lo que se lee: tamaño y tipo de color. */
function cabeceraPng(lado: number, tipoColor: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13); b.set([0x49, 0x48, 0x44, 0x52], 12);
  v.setUint32(16, lado); v.setUint32(20, lado);
  b[24] = 8; b[25] = tipoColor;
  return b;
}

test('el icono de la tienda: 1024, y sin alfa', () => {
  assert.equal(pngSinAlfa(cabeceraPng(1024, 2), 1024), true);
  assert.equal(pngSinAlfa(cabeceraPng(1024, 6), 1024), false);
  assert.equal(pngSinAlfa(cabeceraPng(1024, 4), 1024), false);
  assert.equal(pngSinAlfa(cabeceraPng(512, 2), 1024), false);
  assert.equal(pngSinAlfa(new Uint8Array(40), 1024), false);
});

test('una app archivada sin sus entitlements no se sube', () => {
  const bien = '<key>aps-environment</key><string>production</string><key>com.apple.developer.applesignin</key><array/><key>com.apple.developer.associated-domains</key><array><string>applinks:www.tentare.app</string></array>';
  assert.deepEqual(entitlementsCompletos(bien), { ok: true, faltan: [] });
  assert.equal(entitlementsCompletos('').ok, false);
  assert.equal(entitlementsCompletos('').faltan.length, 3);
  // Notificaciones en desarrollo: no vale para TestFlight.
  assert.equal(entitlementsCompletos(bien.replace('production', 'development')).ok, false);
});

test('el ExportOptions sube a App Store Connect con el equipo dado', () => {
  const x = opcionesDeExport('ABCDE12345');
  assert.match(x, /<string>app-store-connect<\/string>/);
  assert.match(x, /<key>destination<\/key><string>upload<\/string>/);
  assert.match(x, /<key>teamID<\/key><string>ABCDE12345<\/string>/);
  assert.throws(() => opcionesDeExport(''));
  assert.throws(() => opcionesDeExport('</string><x>'));
});

test('el equipo se lee del xcconfig local', () => {
  assert.equal(equipoDeXcconfig('TENTARE_BUNDLE_ID = app.tentare\nTENTARE_TEAM_ID = ABCDE12345\n'), 'ABCDE12345');
  assert.equal(equipoDeXcconfig('TENTARE_TEAM_ID =\n'), '');
  assert.equal(equipoDeXcconfig(''), '');
});
