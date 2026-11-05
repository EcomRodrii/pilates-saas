import test from 'node:test';
import assert from 'node:assert/strict';
import { vistaPreviaSolicitada } from './vista-previa.ts';

test('solo acepta las dos vistas previas conocidas, con o sin otros parámetros', () => {
  assert.equal(vistaPreviaSolicitada('?vista-previa=felicidades'), 'felicidades');
  assert.equal(vistaPreviaSolicitada('?a=1&vista-previa=review-boost'), 'review-boost');
  for (const s of ['', '?', '?vista-previa=', '?vista-previa=otra', '?vista-previa=FELICIDADES', '?preview=felicidades']) {
    assert.equal(vistaPreviaSolicitada(s), null, s);
  }
});
