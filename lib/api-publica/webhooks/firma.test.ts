import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PREFIJO_SECRETO, firmar, generarSecretoWebhook, verificarFirma } from './firma.ts';

const CUERPO = '{"id":"evt_1","tipo":"recibo.creado"}';

test('el secreto es largo, aleatorio y con su prefijo', () => {
  const a = generarSecretoWebhook();
  const b = generarSecretoWebhook();
  assert.ok(a.startsWith(PREFIJO_SECRETO) && a.length >= 40);
  assert.notEqual(a, b);
});

test('la firma es HMAC-SHA256 de "<t>.<cuerpo>", la que documenta la guía', () => {
  const s = 'whsec_prueba';
  const cab = firmar(CUERPO, [s], 1_700_000_000);
  const esperada = createHmac('sha256', s).update(`1700000000.${CUERPO}`).digest('hex');
  assert.equal(cab, `t=1700000000,v1=${esperada}`);
});

test('verifica lo que firma, y nada más', () => {
  const s = generarSecretoWebhook();
  const t = 1_700_000_000;
  const cab = firmar(CUERPO, [s], t);
  assert.deepEqual(verificarFirma(CUERPO, cab, s, t), { ok: true });
  assert.deepEqual(verificarFirma(CUERPO + ' ', cab, s, t), { ok: false, motivo: 'no_cuadra' });
  assert.deepEqual(verificarFirma(CUERPO, cab, generarSecretoWebhook(), t), { ok: false, motivo: 'no_cuadra' });
  assert.deepEqual(verificarFirma(CUERPO, cab, s, t + 301), { ok: false, motivo: 'caducada' });
  assert.deepEqual(verificarFirma(CUERPO, null, s, t), { ok: false, motivo: 'cabecera' });
  assert.deepEqual(verificarFirma(CUERPO, 'v1=abc', s, t), { ok: false, motivo: 'cabecera' });
});

test('tras rotar firma con los dos secretos, y vale cualquiera', () => {
  const nuevo = generarSecretoWebhook();
  const viejo = generarSecretoWebhook();
  const t = 1_700_000_000;
  const cab = firmar(CUERPO, [nuevo, viejo], t);
  assert.equal(cab.split(',').filter((p) => p.startsWith('v1=')).length, 2);
  assert.deepEqual(verificarFirma(CUERPO, cab, nuevo, t), { ok: true });
  assert.deepEqual(verificarFirma(CUERPO, cab, viejo, t), { ok: true });
});

test('sin secreto no firma', () => {
  assert.throws(() => firmar(CUERPO, []));
});

test('el ejemplo de Node de la guía (docs/api-publica.md) verifica lo que firma Tentare', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const guia = readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'api-publica.md'), 'utf8');
  const bloque = /```js\n([\s\S]*?function firmaValida[\s\S]*?)```/.exec(guia);
  assert.ok(bloque, 'la guía ya no trae el ejemplo de Node');
  const firmaValida = new Function('require', `${bloque![1]}\nreturn firmaValida;`)(createRequire(import.meta.url)) as
    (cuerpo: string, cabecera: string | null, secreto: string) => boolean;
  const s = generarSecretoWebhook();
  const viejo = generarSecretoWebhook();
  const cab = firmar(CUERPO, [s, viejo]);
  assert.equal(firmaValida(CUERPO, cab, s), true);
  assert.equal(firmaValida(CUERPO, cab, viejo), true);
  assert.equal(firmaValida(CUERPO + 'x', cab, s), false);
  assert.equal(firmaValida(CUERPO, cab, generarSecretoWebhook()), false);
  assert.equal(firmaValida(CUERPO, firmar(CUERPO, [s], Math.floor(Date.now() / 1000) - 600), s), false);
  assert.equal(firmaValida(CUERPO, null, s), false);
});
