// Tests del motor Veri*Factu. Runner nativo de Node: `npm test`.
// La prueba clave: la cadena pre-hash coincide EXACTAMENTE con el ejemplo
// oficial de la AEAT (Orden HAC/1177/2024).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  construirCadenaAlta,
  construirCadenaAnulacion,
  calcularHuellaAlta,
  sha256Hex,
  type RegistroAltaVerifactu,
} from './verifactu.ts';
import {
  formatImporte,
  formatFechaExpedicion,
  fechaExpedicionDesdeISO,
  fechaHoraHusoMadrid,
  urlQrVerifactu,
  QR_ENDPOINT_PRODUCCION,
  QR_ENDPOINT_PRUEBAS,
} from './verifactu-qr.ts';

// Registro de ejemplo con los MISMOS valores que el documento oficial de la AEAT.
const ejemplo: RegistroAltaVerifactu = {
  idEmisorFactura: '89890001K',
  numSerieFactura: '12345678/G33',
  fechaExpedicionFactura: '01-01-2024',
  tipoFactura: 'F1',
  cuotaTotal: 12.35,
  importeTotal: 123.45,
  fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
};

// ── Cadena pre-hash (contra el ejemplo OFICIAL de la AEAT) ───────────────────
test('construirCadenaAlta coincide carácter a carácter con el ejemplo de la AEAT', () => {
  const esperada =
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024' +
    '&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00';
  assert.equal(construirCadenaAlta(ejemplo, ''), esperada);
});

test('el primer registro lleva Huella vacía; el orden de campos es estricto', () => {
  const cadena = construirCadenaAlta(ejemplo, '');
  assert.match(cadena, /&Huella=&FechaHoraHusoGenRegistro=/);
  const orden = cadena.split('&').map(p => p.split('=')[0]);
  assert.deepEqual(orden, [
    'IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura', 'TipoFactura',
    'CuotaTotal', 'ImporteTotal', 'Huella', 'FechaHoraHusoGenRegistro',
  ]);
});

// ── SHA-256 ───────────────────────────────────────────────────────────────────
test('sha256Hex devuelve 64 hex en mayúsculas y es determinista', () => {
  const h = calcularHuellaAlta(ejemplo, '');
  assert.match(h, /^[0-9A-F]{64}$/);
  assert.equal(h, calcularHuellaAlta(ejemplo, '')); // determinista
});

test('sha256Hex es el SHA-256 estándar (vector conocido)', () => {
  // SHA-256("abc") en mayúsculas.
  assert.equal(sha256Hex('abc'), 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD');
});

// ── Encadenamiento ────────────────────────────────────────────────────────────
test('el encadenamiento enlaza la huella del registro N en el N+1', () => {
  const huella1 = calcularHuellaAlta(ejemplo, '');
  const registro2: RegistroAltaVerifactu = { ...ejemplo, numSerieFactura: '12345679/G33', fechaHoraHusoGenRegistro: '2024-01-01T19:25:00+01:00' };
  const cadena2 = construirCadenaAlta(registro2, huella1);
  assert.ok(cadena2.includes(`&Huella=${huella1}&`));
  // Alterar el registro 1 cambia su huella → rompe el enlace del 2.
  const huella1Alterada = calcularHuellaAlta({ ...ejemplo, importeTotal: 999.99 }, '');
  assert.notEqual(huella1, huella1Alterada);
});

// ── Anulación ─────────────────────────────────────────────────────────────────
test('construirCadenaAnulacion usa los campos y orden de anulación', () => {
  const cadena = construirCadenaAnulacion({
    idEmisorFacturaAnulada: '89890001K',
    numSerieFacturaAnulada: '12345678/G33',
    fechaExpedicionFacturaAnulada: '01-01-2024',
    fechaHoraHusoGenRegistro: '2024-01-02T10:00:00+01:00',
  }, 'ABC');
  assert.equal(
    cadena,
    'IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345678/G33' +
    '&FechaExpedicionFacturaAnulada=01-01-2024&Huella=ABC&FechaHoraHusoGenRegistro=2024-01-02T10:00:00+01:00',
  );
});

// ── Formateadores ─────────────────────────────────────────────────────────────
test('formatImporte usa punto y 2 decimales', () => {
  assert.equal(formatImporte(123.45), '123.45');
  assert.equal(formatImporte(241.4), '241.40');
  assert.equal(formatImporte(85), '85.00');
});

test('formatFechaExpedicion devuelve dd-mm-yyyy', () => {
  assert.equal(formatFechaExpedicion(new Date(2024, 0, 1)), '01-01-2024');
  assert.equal(formatFechaExpedicion(new Date(2026, 11, 9)), '09-12-2026');
});

test('fechaExpedicionDesdeISO convierte ISO a dd-mm-yyyy sin desplazar por huso', () => {
  assert.equal(fechaExpedicionDesdeISO('2024-01-01'), '01-01-2024');
  assert.equal(fechaExpedicionDesdeISO('2026-07-09T22:30:00.000Z'), '09-07-2026');
});

test('fechaHoraHusoMadrid usa +02:00 en verano y +01:00 en invierno', () => {
  // 09-jul-2026 12:00Z → 14:00 en Madrid, huso de verano +02:00.
  assert.equal(fechaHoraHusoMadrid(new Date('2026-07-09T12:00:00Z')), '2026-07-09T14:00:00+02:00');
  // 09-ene-2026 12:00Z → 13:00 en Madrid, huso de invierno +01:00.
  assert.equal(fechaHoraHusoMadrid(new Date('2026-01-09T12:00:00Z')), '2026-01-09T13:00:00+01:00');
});

// ── QR ────────────────────────────────────────────────────────────────────────
test('urlQrVerifactu construye la URL de la AEAT con los 4 parámetros y "/" sin codificar', () => {
  const url = urlQrVerifactu({ nif: '89890001K', numSerie: '12345678/G33', fecha: '01-01-2024', importeTotal: 241.4 });
  assert.ok(url.startsWith(QR_ENDPOINT_PRODUCCION + '?'));
  assert.ok(url.includes('nif=89890001K'));
  assert.ok(url.includes('numserie=12345678/G33')); // '/' preservado como en el ejemplo AEAT
  assert.ok(url.includes('fecha=01-01-2024'));
  assert.ok(url.includes('importe=241.40'));
});

test('urlQrVerifactu apunta a preproducción cuando produccion=false', () => {
  const url = urlQrVerifactu({ nif: 'X', numSerie: 'S1', fecha: '01-01-2024', importeTotal: 10 }, { produccion: false });
  assert.ok(url.startsWith(QR_ENDPOINT_PRUEBAS + '?'));
});
