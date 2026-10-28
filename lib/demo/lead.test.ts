import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarTexto, normalizarTelefono, validarDatosDemo } from './lead.ts';

const bueno = { tipoCentro: 'pilates', nombre: '  Marta   Gil ', estudio: 'Estudio  Luna', email: ' Marta@Luna.COM ', telefono: '600 11 22 33' };

test('datos válidos: se normalizan (espacios, minúsculas, teléfono en formato internacional)', () => {
  const r = validarDatosDemo(bueno);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.datos, { tipoCentro: 'pilates', nombre: 'Marta Gil', estudio: 'Estudio Luna', email: 'marta@luna.com', telefono: '+34600112233', comercial: false });
});

test('el consentimiento comercial nace desmarcado y solo cuenta con un true explícito', () => {
  for (const v of [undefined, null, 'true', 1, 'on', 'sí']) {
    const r = validarDatosDemo({ ...bueno, comercial: v });
    assert.ok(r.ok && r.datos.comercial === false, String(v));
  }
  const r = validarDatosDemo({ ...bueno, comercial: true });
  assert.ok(r.ok && r.datos.comercial === true);
});

test('cada campo inválido da su propio mensaje y no se pierde el resto', () => {
  const r = validarDatosDemo({ tipoCentro: 'gimnasio', nombre: 'A', estudio: '', email: 'no-es-un-correo', telefono: '123' });
  assert.ok(!r.ok);
  if (!r.ok) assert.deepEqual(Object.keys(r.errores).sort(), ['email', 'estudio', 'nombre', 'telefono', 'tipoCentro']);
});

test('teléfonos: España con y sin prefijo, extranjero con +, y lo que no es un teléfono', () => {
  assert.equal(normalizarTelefono('600112233'), '+34600112233');
  assert.equal(normalizarTelefono('+34 911 22 33 44'), '+34911223344');
  assert.equal(normalizarTelefono('0034600112233'), '+34600112233');
  assert.equal(normalizarTelefono('34600112233'), '+34600112233');
  assert.equal(normalizarTelefono('+351 912 345 678'), '+351912345678');
  for (const x of ['', '12345', '500112233', 'abc', '+0123456789', '600112233; drop', 7, null]) assert.equal(normalizarTelefono(x), null, String(x));
});

test('correos con formas peligrosas se rechazan', () => {
  for (const email of ['a@b', 'a b@c.com', '<a@c.com>', 'a@c.com, b@c.com', 'a@c.com;b@c.com', '"a"@c.com', 'a@@c.com']) {
    const r = validarDatosDemo({ ...bueno, email });
    assert.ok(!r.ok && r.errores.email, email);
  }
});

test('limpiarTexto: controles fuera, longitud acotada, no-string → vacío', () => {
  assert.equal(limpiarTexto('a\u0000b\nc', 10), 'a b c');
  assert.equal(limpiarTexto('x'.repeat(500), 5), 'xxxxx');
  assert.equal(limpiarTexto({ toString: () => 'x' }, 5), '');
});
