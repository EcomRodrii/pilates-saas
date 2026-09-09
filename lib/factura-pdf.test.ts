import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarFacturaHTML, type FacturaImprimible } from './factura-pdf.ts';
import { LEYENDA_VERIFACTU } from './factura-sello-cliente.ts';

const factura: FacturaImprimible = {
  numeroCompleto: 'F-2026-001',
  fechaEmision: '2026-07-15T10:00:00Z', receptorNombre: 'Marta Ruiz', receptorNIF: '12345678Z',
  baseImponible: 40, tipoIVA: 21, cuotaIVA: 8.4, total: 48.4,
};

test('generarFacturaHTML escapa el nombre/NIF del receptor: no se puede inyectar un <script>', () => {
  const maliciosa = { ...factura, receptorNombre: '<script>alert(1)</script>', receptorNIF: '"><img src=x onerror=alert(2)>' };
  const html = generarFacturaHTML(maliciosa, { nombre: 'Estudio', nif: 'B123', direccion: 'C/ Falsa 1' }, null, null);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('generarFacturaHTML escapa el nombre/NIF/dirección del emisor', () => {
  const emisorMalicioso = { nombre: '<img src=x onerror=alert(1)>', nif: 'B<1>', direccion: '<b>x</b>' };
  const html = generarFacturaHTML(factura, emisorMalicioso, null, null);
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(!html.includes('<b>x</b>'));
});

test('generarFacturaHTML escapa el teléfono/email del receptor', () => {
  const receptor = { telefono: '"><script>alert(3)</script>', email: 'a@b.com<script>alert(4)</script>' };
  const html = generarFacturaHTML(factura, { nombre: 'Estudio', nif: 'B123', direccion: 'C/ Falsa 1' }, receptor, null);
  assert.ok(!html.includes('<script>alert(3)</script>'));
  assert.ok(!html.includes('<script>alert(4)</script>'));
});

test('generarFacturaHTML sigue pintando los datos normales sin escapar de más', () => {
  const html = generarFacturaHTML(factura, { nombre: 'Tentare Pilates', nif: 'B12345678', direccion: 'C/ Mayor 1' }, null, null);
  assert.ok(html.includes('Marta Ruiz'));
  assert.ok(html.includes('Tentare Pilates'));
  assert.ok(html.includes('F-2026-001'));
});

// ─────────────────────────────────────────────────────────────────────────────
// El documento de la clienta NO es el registro fiscal del estudio.
//
// Antes lo era: la misma plantilla imprimía la huella SHA-256 de la cadena
// Veri*Factu, la URL de cotejo en texto plano y —porque el portal no pasaba el
// flag de entorno— el aviso «Entorno de PRUEBAS, pendiente de validación con la
// AEAT», en la factura que se descargaba la alumna.
// ─────────────────────────────────────────────────────────────────────────────

const EMISOR = { nombre: 'Pilates Centro SL', nif: 'B00000000', direccion: 'C/ Mayor 1' };

test('sin sello, la factura de la clienta no menciona Veri*Factu por ninguna parte', () => {
  const html = generarFacturaHTML(factura, EMISOR, null, null);
  assert.ok(!/veri\*?factu/i.test(html), 'no debe nombrar Veri*Factu');
  assert.ok(!html.includes('Huella'), 'la huella es del registro del estudio, no de la clienta');
  assert.ok(!html.includes('<svg'), 'sin sello no hay QR');
  assert.ok(!/prewww2\.aeat\.es/.test(html), 'jamás el entorno de pruebas de la AEAT');
  assert.ok(!/PRUEBAS/i.test(html), 'ningún aviso de entorno en el papel de la clienta');
});

test('con sello, aparece el QR y la leyenda — y sigue sin aparecer nada interno', () => {
  const sello = { url: 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B00000000', leyenda: LEYENDA_VERIFACTU };
  const html = generarFacturaHTML(factura, EMISOR, null, sello);
  assert.ok(html.includes('<svg'), 'el QR se pinta');
  assert.ok(html.includes(LEYENDA_VERIFACTU));
  assert.ok(html.includes('VERI*FACTU'));
  // Lo que NO debe estar aunque haya sello: la cadena interna y la URL cruda.
  assert.ok(!html.includes('Huella'));
  assert.ok(!html.includes(sello.url), 'la URL va DENTRO del QR, no impresa como texto');
});

test('la factura de la clienta lleva lo que legalmente le corresponde', () => {
  const html = generarFacturaHTML(
    factura,
    EMISOR,
    { telefono: '600111222', email: 'marta@example.com' },
    null,
  );
  assert.ok(html.includes('Pilates Centro SL'), 'datos del estudio');
  assert.ok(html.includes('B00000000'), 'NIF del estudio');
  assert.ok(html.includes('Marta Ruiz'), 'datos de la clienta');
  assert.ok(html.includes('12345678Z'), 'NIF de la clienta');
  assert.ok(html.includes('F-2026-001'), 'número de factura');
  assert.ok(html.includes('IVA (21%)'), 'desglose de impuestos');
  assert.ok(html.includes('40,00 €') && html.includes('8,40 €') && html.includes('48,40 €'));
});

// ── Escenarios de IVA ────────────────────────────────────────────────────────
// El desglose sale de la factura ya emitida, no se recalcula aquí: lo que se
// comprueba es que cualquier tipo se imprime entero y con el formato español.

test('IVA al 10 %: se imprime el tipo real, no uno fijo', () => {
  const reducido = { ...factura, baseImponible: 50, tipoIVA: 10, cuotaIVA: 5, total: 55 };
  const html = generarFacturaHTML(reducido, EMISOR, null, null);
  assert.ok(html.includes('IVA (10%)'));
  assert.ok(html.includes('5,00 €') && html.includes('55,00 €'));
});

test('exenta de IVA (0 %): sigue apareciendo la línea, con cuota cero', () => {
  // Un servicio exento NO puede imprimirse sin su línea de impuestos: la
  // factura tiene que decir que la cuota es cero, no callarse el concepto.
  const exenta = { ...factura, baseImponible: 60, tipoIVA: 0, cuotaIVA: 0, total: 60 };
  const html = generarFacturaHTML(exenta, EMISOR, null, null);
  assert.ok(html.includes('IVA (0%)'));
  assert.ok(html.includes('0,00 €'));
  assert.ok(html.includes('60,00 €'));
});

test('importes con decimales que no son redondos se imprimen a dos decimales', () => {
  const rara = { ...factura, baseImponible: 82.64, tipoIVA: 21, cuotaIVA: 17.36, total: 100 };
  const html = generarFacturaHTML(rara, EMISOR, null, null);
  assert.ok(html.includes('82,64 €'));
  assert.ok(html.includes('17,36 €'));
  assert.ok(html.includes('100,00 €'));
});

test('una factura ANTIGUA sigue saliendo entera: el cambio no rompe lo ya emitido', () => {
  // Las 27 facturas de producción anteriores a la cola de transmisión llegan
  // aquí igual que siempre. Lo único que cambia es que ya no arrastran la
  // huella al papel — el documento comercial está completo sin ella.
  const html = generarFacturaHTML(factura, EMISOR, { telefono: '600111222', email: 'marta@example.com' }, null);
  assert.ok(html.includes('F-2026-001'));
  assert.ok(html.includes('Base imponible'));
  assert.ok(html.includes('TOTAL'));
  assert.ok(html.includes('Fecha de emisión'));
  assert.ok(html.includes('600111222'));
  assert.ok(html.includes('marta@example.com'));
});
