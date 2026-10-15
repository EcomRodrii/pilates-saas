import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appIdDeEstudio, contenidoAasa, idsDeApps } from './aasa.ts';

test('sin el Team ID de Apple no se publica nada', () => {
  assert.deepEqual(idsDeApps({}), []);
});

test('la app de Tentare y las de los estudios, sin duplicados ni basura', () => {
  assert.deepEqual(idsDeApps({ APPLE_TEAM_ID: 'ABCDE12345' }), ['ABCDE12345.app.tentare']);
  assert.deepEqual(
    idsDeApps({ APPLE_TEAM_ID: 'ABCDE12345', APPLE_APP_IDS: 'ZZZZZ99999.es.zenpilates, nada-valido ,ABCDE12345.app.tentare' }),
    ['ABCDE12345.app.tentare', 'ZZZZZ99999.es.zenpilates'],
  );
});

test('abre en la app la entrada y la app de cada estudio, nada más', () => {
  const c = contenidoAasa(['T.app.tentare']);
  assert.deepEqual(c.applinks.details[0].components.map((x) => x['/']), ['/app', '/app/*', '/portal/*']);
  assert.deepEqual(c.webcredentials.apps, ['T.app.tentare']);
});

test('sin apps de estudio, el fichero es el de siempre: una sola entrada', () => {
  assert.equal(contenidoAasa(['T.app.tentare']).applinks.details.length, 1);
  assert.equal(contenidoAasa(['T.app.tentare'], []).applinks.details.length, 1);
});

test('cada app de estudio reclama SOLO su estudio, y va antes que la entrada general', () => {
  const c = contenidoAasa(['TEAMID1234.app.tentare'], [{ appId: 'TEAMID1234.app.tentare.luz', slug: 'luz-pilates' }]);
  assert.equal(c.applinks.details.length, 2);
  const [estudio, general] = c.applinks.details;
  assert.deepEqual(estudio.appIDs, ['TEAMID1234.app.tentare.luz']);
  assert.deepEqual(estudio.components.map((x) => x['/']), ['/portal/luz-pilates', '/portal/luz-pilates/*']);
  // La general no pierde nada, y va detrás: iOS toma la primera que encaja.
  assert.deepEqual(general.appIDs, ['TEAMID1234.app.tentare']);
  assert.deepEqual(general.components.map((x) => x['/']), ['/app', '/app/*', '/portal/*']);
  assert.deepEqual(c.webcredentials.apps, ['TEAMID1234.app.tentare', 'TEAMID1234.app.tentare.luz']);
});

test('el appID de un estudio exige el Team y un bundle limpio', () => {
  assert.equal(appIdDeEstudio('ABCDE12345', 'app.tentare.luz'), 'ABCDE12345.app.tentare.luz');
  assert.equal(appIdDeEstudio(' ABCDE12345 ', 'app.tentare.luz'), 'ABCDE12345.app.tentare.luz');
  assert.equal(appIdDeEstudio(undefined, 'app.tentare.luz'), null);
  assert.equal(appIdDeEstudio('corto', 'app.tentare.luz'), null);
  assert.equal(appIdDeEstudio('ABCDE12345', 'app tentare/luz'), null);
});

test('un slug con comodines no entra: reclamaría rutas de otros estudios', () => {
  const c = contenidoAasa(['T.app.tentare'], [
    { appId: 'T.app.tentare.bien', slug: 'pilates-bien' },
    { appId: 'T.app.tentare.mal', slug: 'p*' },
    { appId: 'T.app.tentare.mal2', slug: 'a?b' },
  ]);
  const ids = c.applinks.details.map((d) => d.appIDs[0]);
  assert.deepEqual(ids, ['T.app.tentare.bien', 'T.app.tentare']);
});

test('la app de una cadena reclama las rutas de todas sus sedes, en un solo bloque', () => {
  const c = contenidoAasa(['T.app.tentare'], [
    { appId: 'T.app.tentare.cupo-001', slug: 'luz-norte' },
    { appId: 'T.app.tentare.cupo-001', slug: 'luz-sur' },
    { appId: 'T.app.tentare.cupo-001', slug: 'luz-norte' },
  ]);
  assert.equal(c.applinks.details.length, 2);
  const cadena = c.applinks.details[0];
  assert.deepEqual(cadena.appIDs, ['T.app.tentare.cupo-001']);
  assert.deepEqual(cadena.components.map((x) => x['/']), ['/portal/luz-norte', '/portal/luz-norte/*', '/portal/luz-sur', '/portal/luz-sur/*']);
  // La general, siempre la última.
  assert.deepEqual(c.applinks.details[1].appIDs, ['T.app.tentare']);
});
