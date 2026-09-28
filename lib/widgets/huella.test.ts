import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huella } from './huella.ts';

test('⚠️ huella: es el FNV-1a de 32 bits de siempre (vectores de referencia), en base 36', () => {
  // Si esto cambia, cambian `firmaCodigo` (todo lo copiado saldría como
  // «Lo cambiaste después de copiarlo») y `firmaDeUrl` (todo lo visto, como
  // «una versión distinta»).
  assert.equal(huella(''), (0x811c9dc5).toString(36));
  assert.equal(huella('a'), (0xe40c292c).toString(36));
  assert.equal(huella('foobar'), (0xbf9cf968).toString(36));
});

test('huella: corta y sin signo', () => {
  for (const t of ['', 'x', 'embed=1&tab=clases', 'ñ'.repeat(1000)]) assert.match(huella(t), /^[0-9a-z]{1,7}$/);
});
