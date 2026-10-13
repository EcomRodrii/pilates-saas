import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AJUSTES_POR_DEFECTO, FORMATO_CODIGO, huellaCodigo, huellasIguales, normalizarCodigo, pareceCodigo,
  validarDatosRegalo, validarImporte, diasParaCaducar,
} from './reglas.ts';

test('normalizar: guiones, espacios, minúsculas y prefijo RG opcional dan el mismo núcleo', () => {
  const base = 'ABCD2345EFGH6789';
  assert.equal(normalizarCodigo('RG-ABCD-2345-EFGH-6789'), base);
  assert.equal(normalizarCodigo(' rg abcd 2345 efgh 6789 '), base);
  assert.equal(normalizarCodigo('abcd-2345-efgh-6789'), base);
  assert.equal(huellaCodigo('RG-ABCD-2345-EFGH-6789'), huellaCodigo('abcd2345efgh6789'));
});

test('la huella es SHA-256 hex del núcleo (la misma que calcula la base de datos)', () => {
  assert.match(huellaCodigo('RG-ABCD-2345-EFGH-6789'), /^[0-9a-f]{64}$/);
  assert.notEqual(huellaCodigo('RG-ABCD-2345-EFGH-6789'), huellaCodigo('RG-ABCD-2345-EFGH-6788'));
});

test('pareceCodigo rechaza basura y símbolos que el alfabeto no usa (0, O, 1, I)', () => {
  assert.equal(pareceCodigo('RG-ABCD-2345-EFGH-6789'), true);
  assert.equal(pareceCodigo('RG-ABCD-2345-EFGH-678'), false);
  assert.equal(pareceCodigo('RG-ABCD-2345-EFGH-67O9'), false);
  assert.equal(pareceCodigo("' or 1=1 --"), false);
  assert.equal(pareceCodigo(''), false);
  assert.match('RG-ABCD-2345-EFGH-6789', FORMATO_CODIGO);
});

test('huellasIguales: tiempo constante, longitudes distintas = falso', () => {
  const h = huellaCodigo('ABCD2345EFGH6789');
  assert.equal(huellasIguales(h, h), true);
  assert.equal(huellasIguales(h, h.slice(1)), false);
  assert.equal(huellasIguales(h, huellaCodigo('ABCD2345EFGH6788')), false);
});

test('importe: fijo, libre dentro de rango, y todo lo demás rechazado', () => {
  const a = { ...AJUSTES_POR_DEFECTO, activo: true };
  assert.deepEqual(validarImporte(a, 50), { ok: true, centimos: 5000 });
  assert.deepEqual(validarImporte(a, 37), { ok: true, centimos: 3700 });
  for (const mal of [0, -5, 9, 301, 12.5, '50', null, undefined, NaN, Infinity]) {
    assert.equal(validarImporte(a, mal).ok, false, `debió rechazar ${String(mal)}`);
  }
  const soloFijos = { ...a, permiteImporteLibre: false };
  assert.equal(validarImporte(soloFijos, 37).ok, false);
  assert.equal(validarImporte(soloFijos, 100).ok, true);
});

test('datos: exige nombres y emails, recorta, quita control y pasa el email a minúsculas', () => {
  const r = validarDatosRegalo({
    compradorNombre: '  Ana\n', compradorEmail: 'ANA@Example.com', destinatarioNombre: 'Bea',
    destinatarioEmail: 'bea@example.com', mensaje: 'x'.repeat(900),
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.datos.compradorNombre, 'Ana');
    assert.equal(r.datos.compradorEmail, 'ana@example.com');
    assert.equal(r.datos.mensaje.length, 400);
  }
  assert.equal(validarDatosRegalo({ compradorNombre: 'A', compradorEmail: 'no', destinatarioNombre: 'B', destinatarioEmail: 'b@example.com' }).ok, false);
  assert.equal(validarDatosRegalo({ compradorNombre: 'A', compradorEmail: 'a@example.com', destinatarioNombre: '', destinatarioEmail: 'b@example.com' }).ok, false);
});

test('diasParaCaducar cuenta días de calendario', () => {
  assert.equal(diasParaCaducar('2026-12-31', '2026-12-01'), 30);
  assert.equal(diasParaCaducar('2026-12-01', '2026-12-01'), 0);
  assert.equal(diasParaCaducar('2026-11-30', '2026-12-01'), -1);
});
