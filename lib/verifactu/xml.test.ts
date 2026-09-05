import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  xmlRegistroAlta, sobreSoapRegFactu, escaparXml, importeXml,
  NS_LR, NS_SI, type RegistroAltaXml, type SistemaInformatico,
} from './xml.ts';

const SISTEMA: SistemaInformatico = {
  nombreRazon: 'Tentare', nif: 'B00000000',
  nombreSistemaInformatico: 'Tentare', idSistemaInformatico: 'TE',
  version: '1.0', numeroInstalacion: 'inst-1',
  soloVerifactu: true, multiOT: false, indicadorMultiplesOT: false,
};

const BASE: RegistroAltaXml = {
  emisor: { nombreRazon: 'Pilates Boutique', nif: '27361301H' },
  numSerieFactura: 'A-2026-0001',
  fechaExpedicionFactura: '05-09-2026',
  tipoFactura: 'F2',
  descripcionOperacion: 'Bono 8 clases',
  desglose: [{ calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: 52.89, cuotaRepercutida: 11.11 }],
  cuotaTotal: 11.11,
  importeTotal: 64,
  encadenamiento: null,
  sistemaInformatico: SISTEMA,
  fechaHoraHusoGenRegistro: '2026-09-05T10:20:30+02:00',
  huella: 'A'.repeat(64),
};

// El orden de los elementos es una `<sequence>` del XSD: un campo fuera de sitio
// invalida el XML entero. Este test fija el orden real del esquema oficial.
test('los campos salen en el orden EXACTO de la secuencia del XSD', () => {
  const xml = xmlRegistroAlta(BASE);
  const orden = [
    'IDVersion', 'IDFactura', 'NombreRazonEmisor', 'TipoFactura',
    'DescripcionOperacion', 'Desglose', 'CuotaTotal', 'ImporteTotal',
    'Encadenamiento', 'SistemaInformatico', 'FechaHoraHusoGenRegistro',
    'TipoHuella', 'Huella',
  ];
  const posiciones = orden.map(t => xml.indexOf(`<sf:${t}>`));
  assert.ok(posiciones.every(p => p >= 0), 'falta algún campo obligatorio');
  for (let i = 1; i < posiciones.length; i++) {
    assert.ok(posiciones[i] > posiciones[i - 1], `${orden[i]} va antes que ${orden[i - 1]}`);
  }
});

test('el primer registro de la cadena se marca como tal, sin registro anterior', () => {
  const xml = xmlRegistroAlta(BASE);
  assert.match(xml, /<sf:PrimerRegistro>S<\/sf:PrimerRegistro>/);
  assert.doesNotMatch(xml, /RegistroAnterior/);
});

test('encadenado: van los cuatro datos de la factura anterior, huella incluida', () => {
  const xml = xmlRegistroAlta({
    ...BASE,
    encadenamiento: {
      idEmisorFactura: '27361301H', numSerieFactura: 'A-2026-0000',
      fechaExpedicionFactura: '04-09-2026', huella: 'B'.repeat(64),
    },
  });
  assert.match(xml, /<sf:RegistroAnterior>/);
  assert.match(xml, /<sf:Huella>B{64}<\/sf:Huella>/);
  assert.doesNotMatch(xml, /PrimerRegistro/);
});

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

test('una operación exenta no lleva calificación, y al revés', () => {
  const exenta = xmlRegistroAlta({
    ...BASE,
    desglose: [{ operacionExenta: 'E1', calificacionOperacion: 'S1', baseImponible: 64 }],
  });
  assert.match(exenta, /OperacionExenta/);
  assert.doesNotMatch(exenta, /CalificacionOperacion/);
});

test('el desglose admite varias líneas de IVA', () => {
  const xml = xmlRegistroAlta({
    ...BASE,
    desglose: [
      { calificacionOperacion: 'S1', tipoImpositivo: 21, baseImponible: 100, cuotaRepercutida: 21 },
      { calificacionOperacion: 'S1', tipoImpositivo: 10, baseImponible: 50, cuotaRepercutida: 5 },
    ],
  });
  assert.equal(xml.match(/<sf:DetalleDesglose>/g)?.length, 2);
});

test('la rectificativa declara su tipo; una normal no lo lleva', () => {
  assert.match(xmlRegistroAlta({ ...BASE, tipoFactura: 'R1', tipoRectificativa: 'I' }), /<sf:TipoRectificativa>I</);
  assert.doesNotMatch(xmlRegistroAlta(BASE), /TipoRectificativa/);
});

// El nombre de un estudio con «&» ya existe en producción: sin escapar, el XML
// deja de estar bien formado y la AEAT rechaza el envío entero.
test('se escapa todo lo que va dentro de una etiqueta', () => {
  assert.equal(escaparXml('Ana & "Pili" <test>'), 'Ana &amp; &quot;Pili&quot; &lt;test&gt;');
  const xml = xmlRegistroAlta({
    ...BASE,
    emisor: { nombreRazon: 'Cuerpo & Mente', nif: '27361301H' },
    descripcionOperacion: 'Bono <8> clases',
  });
  assert.match(xml, /Cuerpo &amp; Mente/);
  assert.match(xml, /Bono &lt;8&gt; clases/);
  assert.doesNotMatch(xml, /<sf:NombreRazonEmisor>Cuerpo & /);
});

test('el sobre lleva los namespaces oficiales y la operación del WSDL', () => {
  const sobre = sobreSoapRegFactu({
    obligado: { nombreRazon: 'Pilates Boutique', nif: '27361301H' },
    registros: [xmlRegistroAlta(BASE)],
  });
  assert.ok(sobre.includes(`xmlns:sfLR="${NS_LR}"`));
  assert.ok(sobre.includes(`xmlns:sf="${NS_SI}"`));
  assert.match(sobre, /<sfLR:RegFactuSistemaFacturacion>/);
  assert.match(sobre, /<sf:ObligadoEmision>/);
  // El namespace apunta a `tike/` aunque el fichero viva en `tikeV1.0/`.
  assert.ok(NS_LR.includes('/tike/cont/ws/'));
  assert.ok(!NS_LR.includes('tikeV1.0'));
});

test('sin representante no se emite la etiqueta; con él, sí', () => {
  const obligado = { nombreRazon: 'Pilates Boutique', nif: '27361301H' };
  const solo = sobreSoapRegFactu({ obligado, registros: [xmlRegistroAlta(BASE)] });
  assert.doesNotMatch(solo, /Representante/);

  const con = sobreSoapRegFactu({
    obligado, representante: { nombreRazon: 'Tentare', nif: 'B00000000' },
    registros: [xmlRegistroAlta(BASE)],
  });
  assert.match(con, /<sf:Representante>/);
  // El obligado sigue siendo el estudio, no quien transmite.
  assert.ok(con.indexOf('ObligadoEmision') < con.indexOf('Representante'));
});

test('varios registros van en un solo sobre', () => {
  const sobre = sobreSoapRegFactu({
    obligado: { nombreRazon: 'P', nif: '27361301H' },
    registros: [xmlRegistroAlta(BASE), xmlRegistroAlta({ ...BASE, numSerieFactura: 'A-2026-0002' })],
  });
  assert.equal(sobre.match(/<sfLR:RegistroFactura>/g)?.length, 2);
});
