import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarFacturaHTML } from './factura-pdf.ts';
import type { Factura } from './types.ts';

const factura: Factura = {
  id: 'fac-1', studioId: 'studio-1', reciboId: 'rec-1', numeroCompleto: 'F-2026-001',
  fechaEmision: '2026-07-15T10:00:00Z', receptorNombre: 'Marta Ruiz', receptorNIF: '12345678Z',
  baseImponible: 40, tipoIVA: 21, cuotaIVA: 8.4, total: 48.4,
  verifactuHash: null, verifactuPrevHash: null, verifactuTs: null, verifactuSeq: null,
};

test('generarFacturaHTML escapa el nombre/NIF del receptor: no se puede inyectar un <script>', () => {
  const maliciosa = { ...factura, receptorNombre: '<script>alert(1)</script>', receptorNIF: '"><img src=x onerror=alert(2)>' };
  const html = generarFacturaHTML(maliciosa, { nombre: 'Estudio', nif: 'B123', direccion: 'C/ Falsa 1' }, null);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('generarFacturaHTML escapa el nombre/NIF/dirección del emisor', () => {
  const emisorMalicioso = { nombre: '<img src=x onerror=alert(1)>', nif: 'B<1>', direccion: '<b>x</b>' };
  const html = generarFacturaHTML(factura, emisorMalicioso, null);
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(!html.includes('<b>x</b>'));
});

test('generarFacturaHTML escapa el teléfono/email del receptor', () => {
  const receptor = { telefono: '"><script>alert(3)</script>', email: 'a@b.com<script>alert(4)</script>' };
  const html = generarFacturaHTML(factura, { nombre: 'Estudio', nif: 'B123', direccion: 'C/ Falsa 1' }, receptor);
  assert.ok(!html.includes('<script>alert(3)</script>'));
  assert.ok(!html.includes('<script>alert(4)</script>'));
});

test('generarFacturaHTML sigue pintando los datos normales sin escapar de más', () => {
  const html = generarFacturaHTML(factura, { nombre: 'Tentare Pilates', nif: 'B12345678', direccion: 'C/ Mayor 1' }, null);
  assert.ok(html.includes('Marta Ruiz'));
  assert.ok(html.includes('Tentare Pilates'));
  assert.ok(html.includes('F-2026-001'));
});
