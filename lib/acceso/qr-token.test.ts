import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUSTITUCION_TOKEN_SECRET = 'secreto-de-prueba';
const { tokenQrDeFila, hashTokenQr, leerTokenQr, nuevoIdQr, PREFIJO_QR } = await import('./qr-token.ts');

test('el token es opaco: prefijo y 22 caracteres, sin el id de la fila dentro', () => {
  const id = nuevoIdQr();
  const token = tokenQrDeFila(id);
  assert.match(token, /^TNT1-[A-Za-z0-9_-]{22}$/);
  assert.ok(!token.includes(id.slice(4, 12)), 'el id no puede leerse en el QR');
});

test('el mismo id da siempre el mismo QR (el móvil nuevo ve el mismo); otro id, otro QR', () => {
  assert.equal(tokenQrDeFila('qra-1'), tokenQrDeFila('qra-1'));
  assert.notEqual(tokenQrDeFila('qra-1'), tokenQrDeFila('qra-2'));
});

test('sin el secreto no se fabrica: otro secreto da otro token', async () => {
  const antes = tokenQrDeFila('qra-1');
  process.env.SUSTITUCION_TOKEN_SECRET = 'otro';
  assert.notEqual(tokenQrDeFila('qra-1'), antes);
  process.env.SUSTITUCION_TOKEN_SECRET = 'secreto-de-prueba';
});

test('lo que se guarda es el hash, y es estable', () => {
  const t = tokenQrDeFila('qra-1');
  assert.equal(hashTokenQr(t), hashTokenQr(t));
  assert.match(hashTokenQr(t), /^[0-9a-f]{64}$/);
  assert.notEqual(hashTokenQr(t), t);
});

test('leerTokenQr: acepta el QR con espacios alrededor y rechaza todo lo demás', () => {
  const t = tokenQrDeFila('qra-1');
  assert.equal(leerTokenQr(`  ${t}\n`), t);
  assert.equal(leerTokenQr(t.toLowerCase()), null);
  assert.equal(leerTokenQr(`${t}x`), null);
  assert.equal(leerTokenQr('https://tentare.app'), null);
  // El pase antiguo de 2 minutos (payload.firma) no es un QR de acceso.
  assert.equal(leerTokenQr('eyJyIjoicmVzLTEifQ.abc'), null);
  assert.equal(leerTokenQr(null), null);
  assert.equal(leerTokenQr(`${PREFIJO_QR}corto`), null);
});
