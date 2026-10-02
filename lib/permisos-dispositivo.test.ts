import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// `camera=()` apaga la cámara TAMBIÉN para el propio origen: el lector QR del pase y
// de la lista de clase, las notas de voz y «cerca de mí» dejaron de poder pedir
// permiso (30-sep → 2-oct-2026). Solo `(self)`: ningún marco ajeno las hereda.
const raiz = join(import.meta.dirname, '..');
for (const fichero of ['proxy.ts', 'next.config.ts']) {
  test(`${fichero}: cámara, micro y ubicación solo para el propio origen, nunca apagadas del todo`, () => {
    const s = readFileSync(join(raiz, fichero), 'utf8');
    assert.doesNotMatch(s, /(camera|microphone|geolocation)=\(\)/);
    assert.match(s, /camera=\(self\), microphone=\(self\), geolocation=\(self\)/);
  });
}
