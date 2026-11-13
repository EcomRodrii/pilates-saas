import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarSolicitudDemo, correoSolicitudDemo } from './solicitud-demo.ts';

test('sin un correo válido no hay solicitud', () => {
  for (const email of ['', 'sin-arroba', 'a@b', 5, null]) {
    assert.equal(validarSolicitudDemo({ email }).ok, false, String(email));
  }
});

test('solo el correo es obligatorio, y se normaliza y se recorta', () => {
  const r = validarSolicitudDemo({ email: '  Ana@Example.COM ', mensaje: 'x'.repeat(5000), nombre: 7 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.solicitud.email, 'ana@example.com');
  assert.equal(r.solicitud.mensaje.length, 2000);
  assert.equal(r.solicitud.nombre, '');
});

test('el correo al equipo escapa lo que escribió la persona y no admite saltos de línea en el asunto', () => {
  const r = validarSolicitudDemo({ email: 'a@example.com', estudio: 'Pilates\r\nBcc: x@example.com', mensaje: '<script>alert(1)</script>' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const c = correoSolicitudDemo(r.solicitud);
  assert.doesNotMatch(c.asunto, /[\r\n]/);
  assert.doesNotMatch(c.html, /<script>/);
  assert.match(c.html, /&lt;script&gt;/);
});
