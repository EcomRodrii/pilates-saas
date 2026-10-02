import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contenidoAasa, idsDeApps } from './aasa.ts';

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
