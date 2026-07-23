import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarIBAN, normalizarIBAN, generarRemesaSEPA, construirRemesa, type AcreedorSEPA, type AdeudoSEPA } from './sepa-19-14.ts';

// ── IBAN ──────────────────────────────────────────────────────────────────────
test('validarIBAN: IBAN español válido (con y sin espacios)', () => {
  assert.equal(validarIBAN('ES9121000418450200051332'), true);
  assert.equal(validarIBAN('ES91 2100 0418 4502 0005 1332'), true);
});

test('validarIBAN: dígito de control incorrecto → false', () => {
  assert.equal(validarIBAN('ES9221000418450200051332'), false);
});

test('validarIBAN: basura / vacío → false', () => {
  assert.equal(validarIBAN(''), false);
  assert.equal(validarIBAN('no-es-un-iban'), false);
  assert.equal(validarIBAN('ES91'), false);
});

test('normalizarIBAN: quita espacios y pone mayúsculas', () => {
  assert.equal(normalizarIBAN(' es91 2100 0418 4502 0005 1332 '), 'ES9121000418450200051332');
});

// ── Generador pain.008 ────────────────────────────────────────────────────────
const acreedor: AcreedorSEPA = {
  nombre: 'Estudio Pilates Ñoño',
  titular: 'Marcos Roca Rodríguez',
  iban: 'ES91 2100 0418 4502 0005 1332',
  idAcreedor: 'ES12ZZZ12345678Z',
};
const adeudos: AdeudoSEPA[] = [
  { id: 'r1', nombreDeudor: 'Ana Pérez', iban: 'ES7921000813610123456789', refMandato: 'MND-001', fechaFirma: '2026-01-15', importe: 60, concepto: 'Cuota <julio> & agosto' },
  { id: 'r2', nombreDeudor: 'Belén Gómez', iban: 'ES6621000418401234567891', refMandato: 'MND-002', fechaFirma: '2026-02-01', importe: 45.5, concepto: 'Bono 10' },
];
const xml = generarRemesaSEPA(acreedor, adeudos, { msgId: 'MSG-2026-07', creDtTm: '2026-07-24T12:00:00', fechaCobro: '2026-07-31' });

test('XML: cabecera pain.008.001.02 + estructura raíz', () => {
  assert.match(xml, /<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain\.008\.001\.02"/);
  assert.match(xml, /<CstmrDrctDbtInitn>/);
  assert.match(xml, /<PmtMtd>DD<\/PmtMtd>/);
  assert.match(xml, /<SeqTp>RCUR<\/SeqTp>/);
});

test('XML: NbOfTxs y CtrlSum coherentes con los adeudos', () => {
  assert.match(xml, /<NbOfTxs>2<\/NbOfTxs>/);
  assert.match(xml, /<CtrlSum>105\.50<\/CtrlSum>/); // 60 + 45.5
  assert.match(xml, /<InstdAmt Ccy="EUR">60\.00<\/InstdAmt>/);
  assert.match(xml, /<InstdAmt Ccy="EUR">45\.50<\/InstdAmt>/);
});

test('XML: acreedor (id de acreedor, IBAN normalizado, fecha de cobro)', () => {
  assert.match(xml, /<Id>ES12ZZZ12345678Z<\/Id>/);
  assert.match(xml, /<IBAN>ES9121000418450200051332<\/IBAN>/); // sin espacios
  assert.match(xml, /<ReqdColltnDt>2026-07-31<\/ReqdColltnDt>/);
});

test('XML: cada adeudo trae mandato, fecha firma, IBAN deudor', () => {
  assert.match(xml, /<MndtId>MND-001<\/MndtId>/);
  assert.match(xml, /<DtOfSgntr>2026-01-15<\/DtOfSgntr>/);
  assert.match(xml, /<IBAN>ES7921000813610123456789<\/IBAN>/);
});

test('XML: saneado — acentos/ñ transliterados, XML escapado, sin caracteres inválidos', () => {
  assert.match(xml, /<Nm>Estudio Pilates Nono<\/Nm>/);      // Ñoño → Nono
  assert.match(xml, /<Nm>Marcos Roca Rodriguez<\/Nm>/);      // acento fuera
  assert.match(xml, /<Nm>Ana Perez<\/Nm>/);
  // '<julio>' y '&' no son del juego SEPA → se sustituyen por espacio (no rompen XML)
  assert.match(xml, /<Ustrd>Cuota julio agosto<\/Ustrd>/);
  assert.ok(!xml.includes('<julio>'));
});

// ── construirRemesa (join recibos × mandatos) ─────────────────────────────────
test('construirRemesa: solo entran los recibos cuya socia tiene mandato vigente', () => {
  const r = construirRemesa({
    acreedor,
    recibosPendientes: [
      { id: 'rec1', socioId: 'a', importe: 60, concepto: 'Julio' },
      { id: 'rec2', socioId: 'b', importe: 45, concepto: 'Julio' },   // b sin mandato
      { id: 'rec3', socioId: null, importe: 10, concepto: 'Mostrador' }, // sin socia
    ],
    mandatosVigentes: [{ socioId: 'a', iban: 'ES7921000813610123456789', refMandato: 'M-A', fechaFirma: '2026-01-01' }],
    nombreSocio: id => (id === 'a' ? 'Ana' : 'X'),
    msgId: 'M1', creDtTm: '2026-07-24T12:00:00', fechaCobro: '2026-07-31',
  });
  assert.equal(r.nAdeudos, 1);
  assert.equal(r.sinMandato, 1);          // rec2 (b sin mandato); rec3 no cuenta (sin socia)
  assert.match(r.xml, /<NbOfTxs>1<\/NbOfTxs>/);
  assert.match(r.xml, /<MndtId>M-A<\/MndtId>/);
});

test('XML: remesa vacía → NbOfTxs 0 y CtrlSum 0.00, XML válido', () => {
  const vacio = generarRemesaSEPA(acreedor, [], { msgId: 'M', creDtTm: '2026-07-24T12:00:00', fechaCobro: '2026-07-31' });
  assert.match(vacio, /<NbOfTxs>0<\/NbOfTxs>/);
  assert.match(vacio, /<CtrlSum>0\.00<\/CtrlSum>/);
  assert.ok(!vacio.includes('<DrctDbtTxInf>'));
});
