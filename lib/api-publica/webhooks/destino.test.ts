import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LookupAddress } from 'node:dns';
import { comprobarResolucionPublica, crearLookupSeguro, DestinoNoPermitido, esIpPublica, validarUrlWebhook } from './destino.ts';

test('esIpPublica: fuera todo lo interno, reservado o de documentación', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.10', '203.0.113.5',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    '64:ff9b::a00:1', '2001:db8::1', '2002:a00:1::1', '2001:0:4136:e378::1', 'no-es-ip', '',
  ]) assert.equal(esIpPublica(ip), false, ip);
});

test('esIpPublica: las públicas pasan', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4003:80e::200e']) {
    assert.equal(esIpPublica(ip), true, ip);
  }
});

test('validarUrlWebhook: solo https público en el puerto estándar', () => {
  assert.ok(validarUrlWebhook('https://contabilidad.example.com/webhooks/tentare?x=1').ok);
  assert.ok(validarUrlWebhook('https://8.8.8.8/hook').ok);
  assert.ok(validarUrlWebhook('https://ejemplo.es:443/hook').ok);
  for (const malo of [
    '', null, 42, 'contabilidad.example.com', 'http://contabilidad.example.com', 'ftp://x.example.com',
    'https://user:pass@x.example.com', 'https://x.example.com:8443/', 'https://localhost/hook', 'https://intranet/hook',
    'https://srv.internal/hook', 'https://nas.local/hook', 'https://127.0.0.1/hook', 'https://[::1]/hook',
    'https://169.254.169.254/latest/meta-data', 'https://10.0.0.5/', 'https://www.tentare.app/api/v1/estudio',
    'https://tentare.app/x', 'https://x.example.com/#frag', `https://x.example.com/${'a'.repeat(500)}`,
  ]) assert.equal(validarUrlWebhook(malo).ok, false, String(malo));
});

const resolutor = (direcciones: string[] | Error) =>
  (_host: string, cb: (err: NodeJS.ErrnoException | null, d: LookupAddress[]) => void) => {
    if (direcciones instanceof Error) cb(direcciones, []);
    else cb(null, direcciones.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
  };

function llamar(lookup: ReturnType<typeof crearLookupSeguro>, all: boolean) {
  return new Promise<{ err: Error | null; resultado: unknown }>((resolve) => {
    lookup('destino.example.com', { all } as never, ((err: Error | null, a: unknown) => resolve({ err, resultado: a })) as never);
  });
}

test('al conectar: una sola dirección interna basta para no conectar (DNS rebinding)', async () => {
  const { err } = await llamar(crearLookupSeguro(resolutor(['93.184.216.34', '10.0.0.7'])), false);
  assert.ok(err instanceof DestinoNoPermitido);
  const { err: err2 } = await llamar(crearLookupSeguro(resolutor(['169.254.169.254'])), true);
  assert.ok(err2 instanceof DestinoNoPermitido);
  const { err: err3 } = await llamar(crearLookupSeguro(resolutor([])), false);
  assert.ok(err3 instanceof DestinoNoPermitido);
});

test('al conectar: con direcciones públicas devuelve la comprobada, en las dos formas', async () => {
  const una = await llamar(crearLookupSeguro(resolutor(['93.184.216.34'])), false);
  assert.equal(una.err, null);
  assert.equal(una.resultado, '93.184.216.34');
  const todas = await llamar(crearLookupSeguro(resolutor(['93.184.216.34', '2606:4700:4700::1111'])), true);
  assert.equal(todas.err, null);
  assert.equal((todas.resultado as LookupAddress[]).length, 2);
});

test('al guardar: avisa de un dominio que no resuelve o que apunta dentro', async () => {
  const url = new URL('https://destino.example.com/h');
  assert.deepEqual(await comprobarResolucionPublica(url, resolutor(['93.184.216.34'])), { ok: true });
  assert.equal((await comprobarResolucionPublica(url, resolutor(['192.168.0.10']))).ok, false);
  assert.equal((await comprobarResolucionPublica(url, resolutor(new Error('ENOTFOUND')))).ok, false);
});

test('enviarWebhook es segura por sí sola: una IP literal interna no se intenta (Node no llama a lookup con IPs)', async () => {
  const { enviarWebhook } = await import('./envio.ts');
  for (const u of ['https://127.0.0.1/h', 'https://[::1]/h', 'https://169.254.169.254/latest', 'https://10.0.0.5/']) {
    const r = await enviarWebhook(new URL(u), '{}', {}, 1_000);
    assert.equal(r.tipo, 'error', u);
    assert.equal(r.tipo === 'error' && r.destinoNoPermitido, true, u);
    assert.equal(r.duracionMs, 0, `${u}: no debería haber llegado a conectar`);
  }
});
