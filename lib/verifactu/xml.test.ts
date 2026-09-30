import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  xmlRegistroAlta, xmlRegistroAnulacion, sobreSoapRegFactu, sobreSoapConsulta, escaparXml, importeXml,
  validarRegistroAlta, periodoDeFecha, RegistroInvalidoError, CLAVE_REGIMEN_GENERAL,
  NS_LR, NS_SI, NS_CONSULTA, type RegistroAltaXml, type SistemaInformatico, type RegistroAnulacionXml,
} from './xml.ts';

const SISTEMA: SistemaInformatico = {
  nombreRazon: 'Productor de Ejemplo', nif: '00000000T',
  nombreSistemaInformatico: 'Tentare', idSistemaInformatico: 'TE',
  version: '1.0', numeroInstalacion: 'inst-1',
  soloVerifactu: true, multiOT: true, indicadorMultiplesOT: false,
};

const LINEA = { claveRegimen: CLAVE_REGIMEN_GENERAL, calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: 52.89, cuotaRepercutida: 11.11 };

const BASE: RegistroAltaXml = {
  emisor: { nombreRazon: 'Pilates Boutique', nif: '99999999R' },
  numSerieFactura: 'A-2026-0001',
  fechaExpedicionFactura: '05-09-2026',
  tipoFactura: 'F2',
  descripcionOperacion: 'Bono 8 clases',
  desglose: [LINEA],
  cuotaTotal: 11.11,
  importeTotal: 64,
  encadenamiento: null,
  sistemaInformatico: SISTEMA,
  fechaHoraHusoGenRegistro: '2026-09-05T10:20:30+02:00',
  huella: 'A'.repeat(64),
};

const DESTINATARIO = { nombreRazon: 'Clienta de Ejemplo', nif: '12345678Z' };
const F1: RegistroAltaXml = { ...BASE, tipoFactura: 'F1', destinatarios: [DESTINATARIO] };

// El orden de los elementos es una `<sequence>` del XSD: un campo fuera de sitio
// invalida el XML entero. Este test fija el orden real del esquema oficial; la
// validación completa contra el XSD está en xml-xsd.test.ts.
test('los campos salen en el orden EXACTO de la secuencia del XSD', () => {
  const xml = xmlRegistroAlta({
    ...F1, subsanacion: true, rechazoPrevio: 'X', tipoFactura: 'R1', tipoRectificativa: 'S',
    facturasRectificadas: [{ idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0000', fechaExpedicionFactura: '01-09-2026' }],
    importeRectificacion: { baseRectificada: 10, cuotaRectificada: 2.1 },
  });
  const orden = [
    'IDVersion', 'IDFactura', 'NombreRazonEmisor', 'Subsanacion', 'RechazoPrevio', 'TipoFactura',
    'TipoRectificativa', 'FacturasRectificadas', 'ImporteRectificacion', 'DescripcionOperacion',
    'Destinatarios', 'Desglose', 'CuotaTotal', 'ImporteTotal',
    'Encadenamiento', 'SistemaInformatico', 'FechaHoraHusoGenRegistro',
    'TipoHuella', 'Huella',
  ];
  const posiciones = orden.map(t => xml.indexOf(`<sf:${t}>`));
  assert.ok(posiciones.every(p => p >= 0), `falta algún campo: ${orden.filter((_, i) => posiciones[i] < 0)}`);
  for (let i = 1; i < posiciones.length; i++) {
    assert.ok(posiciones[i] > posiciones[i - 1], `${orden[i]} va antes que ${orden[i - 1]}`);
  }
});

// ── B1: ClaveRegimen ─────────────────────────────────────────────────────────
test('B1: F1 con ClaveRegimen 01 (régimen general) entre Impuesto y CalificacionOperacion', () => {
  const xml = xmlRegistroAlta({ ...F1, desglose: [{ ...LINEA, impuesto: '01' }] });
  assert.match(xml, /<sf:Impuesto>01<\/sf:Impuesto><sf:ClaveRegimen>01<\/sf:ClaveRegimen><sf:CalificacionOperacion>S1</);
  assert.equal(CLAVE_REGIMEN_GENERAL, '01');
});

test('B1: sin ClaveRegimen con IVA (explícito o por defecto) el registro NO se construye (AEAT 1245)', () => {
  const sinClave = { ...F1, desglose: [{ calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: 10, cuotaRepercutida: 2.1 }] };
  assert.throws(() => xmlRegistroAlta(sinClave), RegistroInvalidoError);
  assert.ok(validarRegistroAlta(sinClave).some(e => e.includes('1245')));
  assert.ok(validarRegistroAlta({ ...sinClave, desglose: [{ ...sinClave.desglose[0], impuesto: '01' }] }).some(e => e.includes('1245')));
});

test('B1: con impuesto «otros» (05) ClaveRegimen no se admite (AEAT 1260)', () => {
  const r = { ...F1, desglose: [{ ...LINEA, impuesto: '05' }] };
  assert.ok(validarRegistroAlta(r).some(e => e.includes('1260')));
});

// ── B2: Destinatarios ────────────────────────────────────────────────────────
test('B2: F1 válida lleva Destinatarios con nombre y NIF del receptor', () => {
  const xml = xmlRegistroAlta(F1);
  assert.match(xml, /<sf:Destinatarios><sf:IDDestinatario><sf:NombreRazon>Clienta de Ejemplo<\/sf:NombreRazon><sf:NIF>12345678Z<\/sf:NIF><\/sf:IDDestinatario><\/sf:Destinatarios>/);
  assert.deepEqual(validarRegistroAlta(F1), []);
});

test('B2: F1, F3 y R1-R4 sin Destinatarios no se construyen (AEAT 1189)', () => {
  for (const tipo of ['F1', 'F3', 'R1', 'R2', 'R3', 'R4']) {
    const esR = tipo.startsWith('R');
    const r = { ...BASE, tipoFactura: tipo, ...(esR ? { tipoRectificativa: 'I' } : {}) };
    assert.ok(validarRegistroAlta(r).some(e => e.includes('1189')), tipo);
    assert.throws(() => xmlRegistroAlta(r), RegistroInvalidoError, tipo);
  }
});

test('B2: F2 y R5 NO admiten Destinatarios', () => {
  assert.ok(validarRegistroAlta({ ...BASE, destinatarios: [DESTINATARIO] }).length > 0);
  assert.ok(validarRegistroAlta({ ...BASE, tipoFactura: 'R5', tipoRectificativa: 'I', destinatarios: [DESTINATARIO] }).length > 0);
  assert.doesNotMatch(xmlRegistroAlta(BASE), /Destinatarios/);
});

// ── Rectificativas ───────────────────────────────────────────────────────────
test('R1-R4 por diferencias: TipoRectificativa I, destinatario y sin ImporteRectificacion', () => {
  for (const tipo of ['R1', 'R2', 'R3', 'R4']) {
    const xml = xmlRegistroAlta({ ...F1, tipoFactura: tipo, tipoRectificativa: 'I' });
    assert.match(xml, new RegExp(`<sf:TipoFactura>${tipo}</sf:TipoFactura><sf:TipoRectificativa>I<`));
    assert.doesNotMatch(xml, /ImporteRectificacion/);
  }
});

test('rectificativa por sustitución (S) exige ImporteRectificacion; por diferencias (I) lo prohíbe', () => {
  const s = { ...F1, tipoFactura: 'R1', tipoRectificativa: 'S' };
  assert.ok(validarRegistroAlta(s).some(e => e.includes('ImporteRectificacion')));
  const xml = xmlRegistroAlta({ ...s, importeRectificacion: { baseRectificada: 52.89, cuotaRectificada: 11.11 } });
  assert.match(xml, /<sf:ImporteRectificacion><sf:BaseRectificada>52\.89<\/sf:BaseRectificada><sf:CuotaRectificada>11\.11<\/sf:CuotaRectificada><\/sf:ImporteRectificacion>/);
  assert.ok(validarRegistroAlta({ ...s, tipoRectificativa: 'I', importeRectificacion: { baseRectificada: 1, cuotaRectificada: 0 } }).length > 0);
});

test('R5 (rectificativa de simplificada) va sin destinatario', () => {
  const xml = xmlRegistroAlta({ ...BASE, tipoFactura: 'R5', tipoRectificativa: 'I' });
  assert.match(xml, /<sf:TipoFactura>R5</);
  assert.doesNotMatch(xml, /Destinatarios/);
});

test('FacturasRectificadas identifica la factura rectificada; una normal no lo lleva', () => {
  const xml = xmlRegistroAlta({
    ...F1, tipoFactura: 'R2', tipoRectificativa: 'I',
    facturasRectificadas: [{ idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0007', fechaExpedicionFactura: '01-09-2026' }],
  });
  assert.match(xml, /<sf:FacturasRectificadas><sf:IDFacturaRectificada><sf:IDEmisorFactura>99999999R<\/sf:IDEmisorFactura><sf:NumSerieFactura>A-2026-0007</);
  assert.ok(validarRegistroAlta({ ...F1, facturasRectificadas: [{ idEmisorFactura: '99999999R', numSerieFactura: 'X', fechaExpedicionFactura: '01-09-2026' }] }).length > 0);
  assert.doesNotMatch(xmlRegistroAlta(BASE), /TipoRectificativa|FacturasRectificadas/);
});

// ── Subsanación (B5) ─────────────────────────────────────────────────────────
test('alta normal: sin Subsanacion ni RechazoPrevio', () => {
  const xml = xmlRegistroAlta(F1);
  assert.doesNotMatch(xml, /Subsanacion|RechazoPrevio/);
});

test('subsanación tras rechazo: Subsanacion=S y RechazoPrevio=X', () => {
  const xml = xmlRegistroAlta({ ...F1, subsanacion: true, rechazoPrevio: 'X' });
  assert.match(xml, /<sf:Subsanacion>S<\/sf:Subsanacion><sf:RechazoPrevio>X<\/sf:RechazoPrevio><sf:TipoFactura>/);
});

test('RechazoPrevio X o S sin Subsanacion=S es inválido (Validaciones §2)', () => {
  assert.ok(validarRegistroAlta({ ...F1, rechazoPrevio: 'X' }).length > 0);
  assert.ok(validarRegistroAlta({ ...F1, rechazoPrevio: 'S' }).length > 0);
  // «N» equivale a no informarlo: no se escribe.
  assert.doesNotMatch(xmlRegistroAlta({ ...F1, subsanacion: true, rechazoPrevio: 'N' }), /RechazoPrevio/);
});

// ── Encadenamiento ───────────────────────────────────────────────────────────
test('el primer registro de la cadena se marca como tal, sin registro anterior', () => {
  const xml = xmlRegistroAlta(BASE);
  assert.match(xml, /<sf:PrimerRegistro>S<\/sf:PrimerRegistro>/);
  assert.doesNotMatch(xml, /RegistroAnterior/);
});

test('encadenado: van los cuatro datos de la factura anterior, huella incluida', () => {
  const xml = xmlRegistroAlta({
    ...BASE,
    encadenamiento: {
      idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0000',
      fechaExpedicionFactura: '04-09-2026', huella: 'B'.repeat(64),
    },
  });
  assert.match(xml, /<sf:RegistroAnterior>/);
  assert.match(xml, /<sf:Huella>B{64}<\/sf:Huella>/);
  assert.doesNotMatch(xml, /PrimerRegistro/);
});

test('una huella que no es SHA-256 en hex mayúsculas no se envía', () => {
  assert.throws(() => xmlRegistroAlta({ ...BASE, huella: 'a'.repeat(64) }), RegistroInvalidoError);
  assert.throws(() => xmlRegistroAlta({ ...BASE, huella: 'A'.repeat(63) }), RegistroInvalidoError);
});

// ── Anulación ────────────────────────────────────────────────────────────────
const ANULACION: RegistroAnulacionXml = {
  facturaAnulada: { idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0001', fechaExpedicionFactura: '05-09-2026' },
  encadenamiento: { idEmisorFactura: '99999999R', numSerieFactura: 'A-2026-0001', fechaExpedicionFactura: '05-09-2026', huella: 'A'.repeat(64) },
  sistemaInformatico: SISTEMA,
  fechaHoraHusoGenRegistro: '2026-09-07T10:20:30+02:00',
  huella: 'D'.repeat(64),
};

test('RegistroAnulacion: campos «…Anulada» y orden de RegistroFacturacionAnulacionType', () => {
  const xml = xmlRegistroAnulacion({ ...ANULACION, sinRegistroPrevio: true, rechazoPrevio: true });
  assert.ok(xml.startsWith('<sf:RegistroAnulacion>'));
  const orden = ['IDVersion', 'IDFactura', 'SinRegistroPrevio', 'RechazoPrevio', 'Encadenamiento', 'SistemaInformatico', 'FechaHoraHusoGenRegistro', 'TipoHuella', 'Huella'];
  // `lastIndexOf`: el RegistroAnterior lleva su propia <sf:Huella> antes que la del registro.
  const pos = orden.map(t => xml.lastIndexOf(`<sf:${t}>`));
  assert.ok(pos.every(p => p >= 0));
  for (let i = 1; i < pos.length; i++) assert.ok(pos[i] > pos[i - 1], orden[i]);
  assert.match(xml, /<sf:IDEmisorFacturaAnulada>99999999R<\/sf:IDEmisorFacturaAnulada><sf:NumSerieFacturaAnulada>A-2026-0001</);
});

test('RegistroAnulacion normal: sin SinRegistroPrevio ni RechazoPrevio', () => {
  assert.doesNotMatch(xmlRegistroAnulacion(ANULACION), /SinRegistroPrevio|RechazoPrevio/);
});

// ── Formato ──────────────────────────────────────────────────────────────────
test('los importes van con dos decimales y punto, nunca con coma', () => {
  assert.equal(importeXml(64), '64.00');
  assert.equal(importeXml(11.1), '11.10');
  assert.equal(importeXml(0), '0.00');
  const xml = xmlRegistroAlta({ ...BASE, importeTotal: 1234.5 });
  assert.match(xml, /<sf:ImporteTotal>1234\.50<\/sf:ImporteTotal>/);
});

test('la huella declara SHA-256 con el código del catálogo', () => {
  assert.match(xmlRegistroAlta(BASE), /<sf:TipoHuella>01<\/sf:TipoHuella>/);
});

test('una operación es exenta O calificada, nunca las dos ni ninguna', () => {
  const exenta = xmlRegistroAlta({ ...BASE, desglose: [{ claveRegimen: '01', operacionExenta: 'E1', baseImponible: 64 }] });
  assert.match(exenta, /OperacionExenta/);
  assert.doesNotMatch(exenta, /CalificacionOperacion/);
  assert.throws(() => xmlRegistroAlta({ ...BASE, desglose: [{ ...LINEA, operacionExenta: 'E1' }] }), RegistroInvalidoError);
  assert.throws(() => xmlRegistroAlta({ ...BASE, desglose: [{ claveRegimen: '01', baseImponible: 64 }] }), RegistroInvalidoError);
});

test('el desglose admite varias líneas de IVA', () => {
  const xml = xmlRegistroAlta({
    ...BASE,
    desglose: [
      { ...LINEA, tipoImpositivo: 21, baseImponible: 100, cuotaRepercutida: 21 },
      { ...LINEA, tipoImpositivo: 10, baseImponible: 50, cuotaRepercutida: 5 },
    ],
  });
  assert.equal(xml.match(/<sf:DetalleDesglose>/g)?.length, 2);
});

// El nombre de un estudio con «&» ya existe en producción: sin escapar, el XML
// deja de estar bien formado y la AEAT rechaza el envío entero.
test('se escapa todo lo que va dentro de una etiqueta', () => {
  assert.equal(escaparXml('Ana & "Pili" <test>'), 'Ana &amp; &quot;Pili&quot; &lt;test&gt;');
  const xml = xmlRegistroAlta({
    ...BASE,
    emisor: { nombreRazon: 'Cuerpo & Mente', nif: '99999999R' },
    descripcionOperacion: 'Bono <8> clases',
  });
  assert.match(xml, /Cuerpo &amp; Mente/);
  assert.match(xml, /Bono &lt;8&gt; clases/);
  assert.doesNotMatch(xml, /<sf:NombreRazonEmisor>Cuerpo & /);
});

// ── Sobres ───────────────────────────────────────────────────────────────────
test('el sobre: Cabecera y RegistroFactura en SuministroLR (sfLR:), el contenido en SuministroInformacion (sf:)', () => {
  const sobre = sobreSoapRegFactu({
    obligado: { nombreRazon: 'Pilates Boutique', nif: '99999999R' },
    registros: [xmlRegistroAlta(BASE)],
  });
  assert.ok(sobre.includes(`xmlns:sfLR="${NS_LR}"`));
  assert.ok(sobre.includes(`xmlns:sf="${NS_SI}"`));
  assert.match(sobre, /<sfLR:RegFactuSistemaFacturacion><sfLR:Cabecera><sf:ObligadoEmision>/);
  assert.doesNotMatch(sobre, /<sf:Cabecera>/);
  // El namespace apunta a `tike/` aunque el fichero viva en `tikeV1.0/`.
  assert.ok(NS_LR.includes('/tike/cont/ws/'));
  assert.ok(!NS_LR.includes('tikeV1.0'));
});

test('sin representante no se emite la etiqueta (apoderamiento directo); con él, sí', () => {
  const obligado = { nombreRazon: 'Pilates Boutique', nif: '99999999R' };
  const solo = sobreSoapRegFactu({ obligado, registros: [xmlRegistroAlta(BASE)] });
  assert.doesNotMatch(solo, /Representante/);

  const con = sobreSoapRegFactu({
    obligado, representante: { nombreRazon: 'Asesoría de Ejemplo', nif: 'B00000000' },
    registros: [xmlRegistroAlta(BASE)],
  });
  assert.match(con, /<sf:Representante>/);
  // El obligado sigue siendo el estudio, no quien transmite.
  assert.ok(con.indexOf('ObligadoEmision') < con.indexOf('Representante'));
});

test('varios registros (altas y anulaciones) van en un solo sobre', () => {
  const sobre = sobreSoapRegFactu({
    obligado: { nombreRazon: 'P', nif: '99999999R' },
    registros: [xmlRegistroAlta(BASE), xmlRegistroAlta({ ...BASE, numSerieFactura: 'A-2026-0002' }), xmlRegistroAnulacion(ANULACION)],
  });
  assert.equal(sobre.match(/<sfLR:RegistroFactura>/g)?.length, 3);
  assert.match(sobre, /<sfLR:RegistroFactura><sf:RegistroAnulacion>/);
});

test('consulta: periodo desde la fecha de expedición y filtro por número', () => {
  assert.deepEqual(periodoDeFecha('05-09-2026'), { ejercicio: '2026', periodo: '09' });
  const sobre = sobreSoapConsulta({ obligado: { nombreRazon: 'P', nif: '99999999R' }, ejercicio: '2026', periodo: '09', numSerieFactura: 'A-2026-0001' });
  assert.ok(sobre.includes(`xmlns:con="${NS_CONSULTA}"`));
  assert.match(sobre, /<con:PeriodoImputacion><sf:Ejercicio>2026<\/sf:Ejercicio><sf:Periodo>09<\/sf:Periodo><\/con:PeriodoImputacion><con:NumSerieFactura>A-2026-0001<\/con:NumSerieFactura>/);
});
