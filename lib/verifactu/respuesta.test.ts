import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearRespuestaAeat, parsearRespuestaConsulta, registroAceptado, convieneReintentarEnvio, codigoDeFault,
} from './respuesta.ts';

const envoltorio = (dentro: string) =>
  `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>${dentro}</soapenv:Body></soapenv:Envelope>`;

test('envío correcto: estado, CSV y espera', () => {
  const r = parsearRespuestaAeat(envoltorio(`
    <tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="urn:x">
      <tikR:CSV>ABC123XYZ</tikR:CSV>
      <tikR:EstadoEnvio>Correcto</tikR:EstadoEnvio>
      <tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio>
      <tikR:RespuestaLinea>
        <tikR:IDFactura><tikR:NumSerieFactura>A-2026-0001</tikR:NumSerieFactura></tikR:IDFactura>
        <tikR:EstadoRegistro>Correcto</tikR:EstadoRegistro>
      </tikR:RespuestaLinea>
    </tikR:RespuestaRegFactuSistemaFacturacion>`));
  assert.equal(r.fault, false);
  assert.equal(r.estadoEnvio, 'Correcto');
  assert.equal(r.csv, 'ABC123XYZ');
  assert.equal(r.tiempoEsperaSegundos, 60);
  assert.equal(r.registros.length, 1);
  assert.equal(r.registros[0].numSerieFactura, 'A-2026-0001');
  assert.ok(registroAceptado(r.registros[0]));
});

// Lo más importante del parseo: un envío puede ir «bien» en global y traer
// facturas rechazadas dentro. Quedarse con el estado global es dar por
// registrada una factura que la AEAT no admitió.
test('parcialmente correcto: hay que mirar registro a registro', () => {
  const r = parsearRespuestaAeat(envoltorio(`
    <RespuestaRegFactu>
      <CSV>CSV-PARCIAL</CSV>
      <EstadoEnvio>ParcialmenteCorrecto</EstadoEnvio>
      <RespuestaLinea>
        <NumSerieFactura>A-1</NumSerieFactura><EstadoRegistro>Correcto</EstadoRegistro>
      </RespuestaLinea>
      <RespuestaLinea>
        <NumSerieFactura>A-2</NumSerieFactura>
        <EstadoRegistro>Incorrecto</EstadoRegistro>
        <CodigoErrorRegistro>1100</CodigoErrorRegistro>
        <DescripcionErrorRegistro>Registro duplicado</DescripcionErrorRegistro>
      </RespuestaLinea>
    </RespuestaRegFactu>`));
  assert.equal(r.estadoEnvio, 'ParcialmenteCorrecto');
  assert.equal(r.registros.length, 2);
  assert.ok(registroAceptado(r.registros[0]));
  assert.ok(!registroAceptado(r.registros[1]));
  assert.equal(r.registros[1].codigoError, '1100');
  assert.equal(r.registros[1].descripcionError, 'Registro duplicado');
  // El CSV se guarda igual: es irrecuperable después, aunque el envío fuera regular.
  assert.equal(r.csv, 'CSV-PARCIAL');
});

// «AceptadoConErrores» (códigos 2000-2008) SÍ está registrada. Tratarla como
// fallo llevaría a reenviarla, y reenviar lo ya admitido es peor que la marca.
test('aceptado con errores cuenta como registrada', () => {
  const r = parsearRespuestaAeat(envoltorio(`
    <R><EstadoEnvio>Correcto</EstadoEnvio>
      <RespuestaLinea>
        <NumSerieFactura>A-3</NumSerieFactura>
        <EstadoRegistro>AceptadoConErrores</EstadoRegistro>
        <CodigoErrorRegistro>2000</CodigoErrorRegistro>
      </RespuestaLinea>
    </R>`));
  assert.ok(registroAceptado(r.registros[0]));
  assert.equal(r.registros[0].codigoError, '2000');
});

test('un SoapFault tumba el envío entero y no trae ni CSV ni registros', () => {
  const r = parsearRespuestaAeat(`<?xml version="1.0"?>
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>
      <soapenv:Fault>
        <faultcode>env:Client</faultcode>
        <faultstring>4102: NIF de cabecera no identificado</faultstring>
      </soapenv:Fault>
    </soapenv:Body></soapenv:Envelope>`);
  assert.equal(r.fault, true);
  assert.match(r.faultMensaje ?? '', /NIF de cabecera/);
  assert.equal(r.csv, null);
  assert.equal(r.registros.length, 0);
  // Un rechazo de cabecera no se arregla reintentando el mismo envío.
  assert.equal(convieneReintentarEnvio(r), false);
});

test('una respuesta que no se entiende se reintenta; una que sí, no', () => {
  const basura = parsearRespuestaAeat('<html>502 Bad Gateway</html>');
  assert.equal(basura.estadoEnvio, null);
  assert.equal(convieneReintentarEnvio(basura), true);

  const incorrecto = parsearRespuestaAeat(envoltorio('<R><EstadoEnvio>Incorrecto</EstadoEnvio></R>'));
  // Rechazo por datos: reintentar tal cual vuelve a fallar y consume el control de flujo.
  assert.equal(convieneReintentarEnvio(incorrecto), false);
});

test('un estado que no está en el catálogo no se inventa', () => {
  const r = parsearRespuestaAeat(envoltorio('<R><EstadoEnvio>LoQueSea</EstadoEnvio></R>'));
  assert.equal(r.estadoEnvio, null);
});

test('la espera se lee como número, y si no lo es se deja en null', () => {
  assert.equal(parsearRespuestaAeat(envoltorio('<R><TiempoEsperaEnvio>120</TiempoEsperaEnvio></R>')).tiempoEsperaSegundos, 120);
  assert.equal(parsearRespuestaAeat(envoltorio('<R><TiempoEsperaEnvio>pronto</TiempoEsperaEnvio></R>')).tiempoEsperaSegundos, null);
});

// ── B3: RegistroDuplicado ────────────────────────────────────────────────────
// Forma exacta de RespuestaSuministro.xsd: la línea trae su 3000 y, dentro, el
// bloque RegistroDuplicado con el estado del registro que la AEAT YA tenía.
const lineaDuplicada = (estado: string) => `
  <tikR:RespuestaLinea>
    <tikR:IDFactura><tik:IDEmisorFactura>99999999R</tik:IDEmisorFactura><tik:NumSerieFactura>A-7</tik:NumSerieFactura><tik:FechaExpedicionFactura>05-09-2026</tik:FechaExpedicionFactura></tikR:IDFactura>
    <tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion>
    <tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro>
    <tikR:CodigoErrorRegistro>3000</tikR:CodigoErrorRegistro>
    <tikR:DescripcionErrorRegistro>Registro de facturación duplicado.</tikR:DescripcionErrorRegistro>
    <tikR:RegistroDuplicado>
      <tik:IdPeticionRegistroDuplicado>202609050001</tik:IdPeticionRegistroDuplicado>
      <tik:EstadoRegistroDuplicado>${estado}</tik:EstadoRegistroDuplicado>
      <tik:CodigoErrorRegistro>2000</tik:CodigoErrorRegistro>
      <tik:DescripcionErrorRegistro>La huella del duplicado</tik:DescripcionErrorRegistro>
    </tikR:RegistroDuplicado>
  </tikR:RespuestaLinea>`;

test('B3: 3000 con RegistroDuplicado: se lee el estado del que ya estaba, sin mezclar sus códigos con los de la línea', () => {
  for (const estado of ['Correcta', 'AceptadaConErrores', 'Anulada'] as const) {
    const r = parsearRespuestaAeat(envoltorio(`<tikR:R><tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>${lineaDuplicada(estado)}</tikR:R>`));
    const l = r.registros[0];
    assert.equal(l.estado, 'Incorrecto');
    assert.equal(l.codigoError, '3000', 'el código de la línea, no el del bloque del duplicado');
    assert.equal(l.operacion, 'Alta');
    assert.equal(l.numSerieFactura, 'A-7');
    assert.equal(l.fechaExpedicionFactura, '05-09-2026');
    assert.equal(l.duplicado?.estado, estado);
    assert.equal(l.duplicado?.idPeticion, '202609050001');
    assert.equal(l.duplicado?.codigoError, '2000');
  }
});

test('una línea sin RegistroDuplicado lo deja en null', () => {
  const r = parsearRespuestaAeat(envoltorio('<R><EstadoEnvio>Correcto</EstadoEnvio><RespuestaLinea><NumSerieFactura>A-1</NumSerieFactura><EstadoRegistro>Correcto</EstadoRegistro></RespuestaLinea></R>'));
  assert.equal(r.registros[0].duplicado, null);
  assert.equal(r.registros[0].operacion, null);
});

// ── Faults: el código ────────────────────────────────────────────────────────
test('el código del fault se lee de las formas razonables y, si no, es null', () => {
  assert.equal(codigoDeFault('Codigo[4112].El titular del certificado debe ser…'), '4112');
  assert.equal(codigoDeFault('4140: No puede acceder a la consulta'), '4140');
  assert.equal(codigoDeFault('Error 4141 acceso suspendido'), '4141');
  assert.equal(codigoDeFault('Algo raro sin código'), null);
  assert.equal(codigoDeFault(null), null);
  const r = parsearRespuestaAeat('<soapenv:Envelope xmlns:soapenv="x"><soapenv:Body><soapenv:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4112].El titular del certificado debe ser Obligado Emisión, Colaborador Social, Apoderado o Sucesor.</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>');
  assert.equal(r.fault, true);
  assert.equal(r.faultCodigo, '4112');
});

// ── Consulta ─────────────────────────────────────────────────────────────────
// Estructura del ejemplo oficial (Descripción del servicio web, §9): la huella
// del ANTERIOR va dentro de Encadenamiento con la misma etiqueta; la del
// registro va suelta. Y EstadoRegistro va anidado dentro de otro EstadoRegistro.
const respuestaConsulta = (estado: string, huella: string) => `
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>
<tikLRRC:RespuestaConsultaFactuSistemaFacturacion xmlns:tikLRRC="urn:rc" xmlns:tik="urn:si">
  <tikLRRC:IndicadorPaginacion>N</tikLRRC:IndicadorPaginacion>
  <tikLRRC:ResultadoConsulta>ConDatos</tikLRRC:ResultadoConsulta>
  <tikLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion>
    <tikLRRC:IDFactura><tik:IDEmisorFactura>99999999R</tik:IDEmisorFactura><tik:NumSerieFactura>A-7</tik:NumSerieFactura><tik:FechaExpedicionFactura>05-09-2026</tik:FechaExpedicionFactura></tikLRRC:IDFactura>
    <tikLRRC:DatosRegistroFacturacion>
      <tikLRRC:TipoFactura>F2</tikLRRC:TipoFactura>
      <tikLRRC:Encadenamiento><tikLRRC:RegistroAnterior><tik:IDEmisorFactura>99999999R</tik:IDEmisorFactura><tik:NumSerieFactura>A-6</tik:NumSerieFactura><tik:FechaExpedicionFactura>04-09-2026</tik:FechaExpedicionFactura><tik:Huella>${'B'.repeat(64)}</tik:Huella></tikLRRC:RegistroAnterior></tikLRRC:Encadenamiento>
      <tikLRRC:TipoHuella>01</tikLRRC:TipoHuella>
      <tikLRRC:Huella>${huella}</tikLRRC:Huella>
    </tikLRRC:DatosRegistroFacturacion>
    <tikLRRC:EstadoRegistro>
      <tikLRRC:TimestampUltimaModificacion>2026-09-05T11:54:10+02:00</tikLRRC:TimestampUltimaModificacion>
      <tikLRRC:EstadoRegistro>${estado}</tikLRRC:EstadoRegistro>
    </tikLRRC:EstadoRegistro>
  </tikLRRC:RegistroRespuestaConsultaFactuSistemaFacturacion>
</tikLRRC:RespuestaConsultaFactuSistemaFacturacion></env:Body></env:Envelope>`;

test('consulta: huella del registro (no la del anterior) y estado anidado, en los dos géneros', () => {
  for (const [estado, esperado] of [['Correcta', 'Correcto'], ['Correcto', 'Correcto'], ['AceptadaConErrores', 'AceptadoConErrores'], ['Anulado', 'Anulado']] as const) {
    const r = parsearRespuestaConsulta(respuestaConsulta(estado, 'A'.repeat(64)));
    assert.equal(r.resultado, 'ConDatos');
    assert.equal(r.registros.length, 1);
    assert.equal(r.registros[0].numSerieFactura, 'A-7');
    assert.equal(r.registros[0].huella, 'A'.repeat(64), 'no la B del RegistroAnterior');
    assert.equal(r.registros[0].estado, esperado);
  }
});

test('consulta sin datos y consulta con fault', () => {
  const vacia = parsearRespuestaConsulta('<x:R xmlns:x="u"><x:ResultadoConsulta>SinDatos</x:ResultadoConsulta></x:R>');
  assert.equal(vacia.resultado, 'SinDatos');
  assert.equal(vacia.registros.length, 0);
  const f = parsearRespuestaConsulta('<Envelope><Body><Fault><faultstring>Codigo[4140].No puede acceder a la consulta de facturas al no estar apoderado</faultstring></Fault></Body></Envelope>');
  assert.equal(f.fault, true);
  assert.equal(f.faultCodigo, '4140');
});
