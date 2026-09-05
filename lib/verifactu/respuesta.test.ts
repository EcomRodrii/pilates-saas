import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearRespuestaAeat, registroAceptado, convieneReintentarEnvio,
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
