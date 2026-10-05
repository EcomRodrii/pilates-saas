import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selloDelCobro } from './sello-del-cobro.ts';

const HASH = 'b'.repeat(64);
const CREADO = Date.parse('2026-10-05T09:30:12.000Z') / 1000;

test('la aceptación se fecha con el momento en que se creó el cobro en Stripe', () => {
  assert.deepEqual(selloDelCobro({ terminosHash: HASH }, CREADO), {
    terminosHash: HASH, terminosAceptadosEn: '2026-10-05T09:30:12.000Z',
  });
});

test('reentregar el mismo cobro (webhook repetido, conciliador) deja la MISMA fecha', () => {
  assert.deepEqual(selloDelCobro({ terminosHash: HASH }, CREADO), selloDelCobro({ terminosHash: HASH }, CREADO));
});

test('sin huella no hay aceptación que fechar', () => {
  assert.deepEqual(selloDelCobro({}, CREADO), { terminosHash: null, terminosAceptadosEn: null });
  assert.deepEqual(selloDelCobro(null, CREADO), { terminosHash: null, terminosAceptadosEn: null });
  assert.deepEqual(selloDelCobro({ terminosHash: '' }, CREADO), { terminosHash: null, terminosAceptadosEn: null });
});

test('un cobro creado antes del cambio (fecha en la metadata) se sigue fechando', () => {
  const legado = { terminosHash: HASH, terminosAceptadosEn: '2026-10-04T08:00:00.000Z' };
  // Con `created` manda Stripe (es el mismo instante, ±milisegundos).
  assert.equal(selloDelCobro(legado, CREADO).terminosAceptadosEn, '2026-10-05T09:30:12.000Z');
  // Sin `created` (no debería pasar), la de la metadata.
  assert.equal(selloDelCobro(legado, null).terminosAceptadosEn, '2026-10-04T08:00:00.000Z');
  assert.equal(selloDelCobro({ terminosHash: HASH }, undefined).terminosAceptadosEn, null);
});

test('el webhook (las dos ramas) y el conciliador fechan con el `created` de Stripe', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const webhook = readFileSync(join(raiz, 'app/api/stripe/webhook/route.ts'), 'utf8');
  assert.match(webhook, /\.\.\.selloDelCobro\(session\.metadata, session\.created\)/);
  assert.match(webhook, /\.\.\.selloDelCobro\(pi\.metadata, pi\.created\)/);
  assert.doesNotMatch(webhook, /terminosAceptadosEn: /);
  const conciliador = readFileSync(join(raiz, 'lib/inngest/conciliar-cobros.ts'), 'utf8');
  assert.match(conciliador, /selloDelCobro\(sesion\.metadata, sesion\.created\)/);
  assert.match(conciliador, /selloDelCobro\(pi\?\.metadata, pi\?\.created\)/);
  assert.doesNotMatch(conciliador, /terminosAceptadosEn: /);
});
