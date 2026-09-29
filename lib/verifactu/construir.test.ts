import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirXmlRegistro, type RegistroParaXml, type FacturaParaXml } from './construir.ts';
import { RegistroInvalidoError, type SistemaInformatico } from './xml.ts';
import { calcularHuellaAlta } from '../verifactu.ts';

const SISTEMA: SistemaInformatico = {
  nombreRazon: 'Productor de Ejemplo', nif: '00000000T', nombreSistemaInformatico: 'Tentare',
  idSistemaInformatico: 'TE', version: '1.0', numeroInstalacion: 'studio-x',
  soloVerifactu: true, multiOT: true, indicadorMultiplesOT: false,
};

const REG: RegistroParaXml = {
  tipo: 'ALTA', idEmisor: '99999999R', numSerie: 'A-2026-0002', fechaExpedicion: '05-09-2026',
  tipoFactura: 'F1', cuotaTotal: 11.11, importeTotal: 64,
  huella: 'A'.repeat(64), huellaAnterior: 'B'.repeat(64),
  anterior: { idEmisor: '99999999R', numSerie: 'A-2026-0001', fechaExpedicion: '04-09-2026' },
  fechaHoraHusoGen: '2026-09-05T10:20:30+02:00', rechazoPrevio: null, sinRegistroPrevio: false, datosCorregidos: null,
};

const FAC: FacturaParaXml = {
  baseImponible: 52.89, tipoIva: 21, cuotaIva: 11.11, receptorNombre: 'Clienta de Ejemplo', receptorNif: '12345678Z',
  tipoRectificativa: null, descripcion: 'Bono 8 clases', rectificada: null,
};

test('F1: emisor y huella salen del REGISTRO (congelado), el destinatario de la factura, y ClaveRegimen 01', () => {
  const xml = construirXmlRegistro(REG, FAC, 'Estudio SL', SISTEMA);
  assert.match(xml, /<sf:IDEmisorFactura>99999999R<\/sf:IDEmisorFactura><sf:NumSerieFactura>A-2026-0002</);
  assert.match(xml, /<sf:NombreRazonEmisor>Estudio SL</);
  assert.match(xml, /<sf:IDDestinatario><sf:NombreRazon>Clienta de Ejemplo<\/sf:NombreRazon><sf:NIF>12345678Z</);
  assert.match(xml, /<sf:ClaveRegimen>01</);
  assert.match(xml, /<sf:RegistroAnterior><sf:IDEmisorFactura>99999999R<\/sf:IDEmisorFactura><sf:NumSerieFactura>A-2026-0001</);
});

test('F1 sin datos del receptor no se construye: se rechaza en local (nunca llega a la AEAT)', () => {
  assert.throws(() => construirXmlRegistro(REG, { ...FAC, receptorNif: null, receptorNombre: null }, 'Estudio SL', SISTEMA), RegistroInvalidoError);
});

test('F2 no lleva destinatario aunque la factura tenga datos sueltos', () => {
  const xml = construirXmlRegistro({ ...REG, tipoFactura: 'F2' }, FAC, 'Estudio SL', SISTEMA);
  assert.doesNotMatch(xml, /Destinatarios/);
});

test('R1 por sustitución: FacturasRectificadas + ImporteRectificacion con la base y cuota de la ORIGINAL', () => {
  const xml = construirXmlRegistro({ ...REG, tipoFactura: 'R1' }, {
    ...FAC, tipoRectificativa: 'S',
    rectificada: { idEmisor: '99999999R', numSerie: 'A-2026-0001', fechaExpedicion: '04-09-2026', baseImponible: 100, cuotaIva: 21 },
  }, 'Estudio SL', SISTEMA);
  assert.match(xml, /<sf:TipoRectificativa>S<\/sf:TipoRectificativa><sf:FacturasRectificadas><sf:IDFacturaRectificada><sf:IDEmisorFactura>99999999R<\/sf:IDEmisorFactura><sf:NumSerieFactura>A-2026-0001</);
  assert.match(xml, /<sf:BaseRectificada>100\.00<\/sf:BaseRectificada><sf:CuotaRectificada>21\.00</);
});

test('R-S sin factura original: no se inventa el importe rectificado, se rechaza en local', () => {
  assert.throws(() => construirXmlRegistro({ ...REG, tipoFactura: 'R1' }, { ...FAC, tipoRectificativa: 'S' }, 'Estudio SL', SISTEMA), RegistroInvalidoError);
});

test('subsanación: S + X y las correcciones fuera de la huella; la huella sigue siendo la del registro', () => {
  const xml = construirXmlRegistro({
    ...REG, tipo: 'ALTA_SUBSANACION', rechazoPrevio: 'X',
    datosCorregidos: { receptorNombre: 'Nombre Corregido', receptorNif: '87654321X' },
  }, FAC, 'Estudio SL', SISTEMA);
  assert.match(xml, /<sf:Subsanacion>S<\/sf:Subsanacion><sf:RechazoPrevio>X</);
  assert.match(xml, /<sf:NombreRazon>Nombre Corregido<\/sf:NombreRazon><sf:NIF>87654321X</);
  assert.match(xml, new RegExp(`<sf:Huella>${'A'.repeat(64)}</sf:Huella></sf:RegistroAlta>$`));
});

test('la huella del XML es la que reproduce la fórmula con los campos del registro', () => {
  const huella = calcularHuellaAlta({
    idEmisorFactura: REG.idEmisor, numSerieFactura: REG.numSerie, fechaExpedicionFactura: REG.fechaExpedicion,
    tipoFactura: 'F1', cuotaTotal: 11.11, importeTotal: 64, fechaHoraHusoGenRegistro: REG.fechaHoraHusoGen,
  }, REG.huellaAnterior);
  const xml = construirXmlRegistro({ ...REG, huella }, FAC, 'Estudio SL', SISTEMA);
  assert.ok(xml.includes(`<sf:Huella>${huella}</sf:Huella></sf:RegistroAlta>`));
});

test('encadenado sin los datos del anterior: no se construye (no se inventan)', () => {
  assert.throws(() => construirXmlRegistro({ ...REG, anterior: null }, FAC, 'Estudio SL', SISTEMA));
});

test('anulación: RegistroAnulacion con la factura anulada y SinRegistroPrevio', () => {
  const xml = construirXmlRegistro({
    ...REG, tipo: 'ANULACION', tipoFactura: null, cuotaTotal: null, importeTotal: null, sinRegistroPrevio: true,
  }, FAC, 'Estudio SL', SISTEMA);
  assert.ok(xml.startsWith('<sf:RegistroAnulacion>'));
  assert.match(xml, /<sf:NumSerieFacturaAnulada>A-2026-0002</);
  assert.match(xml, /<sf:SinRegistroPrevio>S</);
});
