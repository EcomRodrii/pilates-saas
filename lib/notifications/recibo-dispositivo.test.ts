import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { interpretarRecibo } from './recibo-dispositivo.ts';

const NID = 'not-123e4567-e89b-12d3-a456-426614174000';

test('acepta un id de notificación y un evento conocido', () => {
  assert.deepEqual(interpretarRecibo({ nid: NID, evento: 'shown' }), { nid: NID, evento: 'shown' });
  assert.deepEqual(interpretarRecibo({ nid: NID, evento: 'click' }), { nid: NID, evento: 'click' });
});

test('rechaza lo que no es exactamente eso', () => {
  for (const malo of [null, undefined, 'x', 3, {}, { nid: NID }, { nid: NID, evento: 'otro' },
    { nid: 'not-1', evento: 'shown' }, { nid: `${NID}'; drop table notification;--`, evento: 'shown' }, { nid: 5, evento: 'shown' }]) {
    assert.equal(interpretarRecibo(malo), null, JSON.stringify(malo));
  }
});

// El service worker es un fichero estático sin imports: se comprueba su texto.
const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

test('sw.js: avisa al servidor al mostrar y al pulsar, y el aviso no puede tumbar la notificación', () => {
  assert.match(sw, /\/api\/notifications\/receipt/);
  assert.match(sw, /avisarServidor\('shown'/);
  assert.match(sw, /avisarServidor\('click'/);
  // showNotification va SIEMPRE, aunque el aviso al servidor falle.
  assert.match(sw, /\.catch\(\(\) => \{\}\)/);
});

test('sw.js: la instalación no depende de que la página offline se pueda guardar', () => {
  assert.doesNotMatch(sw, /c\.addAll\(\[OFFLINE_URL\]\)/);
});

test('sw.js: al pulsar navega a la URL del aviso (no solo enfoca una ventana que ya la contenga)', () => {
  assert.match(sw, /\.navigate\(/);
  assert.match(sw, /new URL\(url, self\.location\.origin\)/);
});
