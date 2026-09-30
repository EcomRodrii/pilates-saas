// Cada cosa que puede pasar al mandar un lote a la AEAT, y qué queda después.
// Sin red ni base de datos: `planificarResultado` es lógica pura.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planificarResultado, type RegistroEnviado } from './procesar.ts';
import { transicionPermitida, type EstadoRegistroVerifactu } from './estado.ts';

const AHORA = new Date('2026-09-30T10:00:00Z');
const A1: RegistroEnviado = { id: 'r1', numSerieFactura: 'A-1', tipo: 'ALTA', intentos: 0 };
const A2: RegistroEnviado = { id: 'r2', numSerieFactura: 'A-2', tipo: 'ALTA', intentos: 2 };

const sobre = (cuerpo: string) =>
  `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="urn:r" xmlns:tik="urn:s">${cuerpo}</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`;
const linea = (num: string, estado: string, extra = '') =>
  `<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>99999999R</tik:IDEmisorFactura><tik:NumSerieFactura>${num}</tik:NumSerieFactura><tik:FechaExpedicionFactura>05-09-2026</tik:FechaExpedicionFactura></tikR:IDFactura><tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion><tikR:EstadoRegistro>${estado}</tikR:EstadoRegistro>${extra}</tikR:RespuestaLinea>`;
const fault = (texto: string) =>
  `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>${texto}</faultstring></env:Fault></env:Body></env:Envelope>`;
const ok = (cuerpo: string) => ({ status: 200, cuerpo, fallo: null, error: null });

/** Todo lo que el plan escribe tiene que ser una transición válida desde ENVIANDO. */
function transicionesValidas(estados: EstadoRegistroVerifactu[]) {
  for (const e of estados) assert.ok(transicionPermitida('ENVIANDO', e), `ENVIANDO → ${e} no está permitido`);
}

test('envío correcto: REGISTRADA, CSV guardado, espera la que diga la AEAT', () => {
  const p = planificarResultado([A1], ok(sobre(`<tikR:CSV>CSV1</tikR:CSV><tikR:TiempoEsperaEnvio>90</tikR:TiempoEsperaEnvio><tikR:EstadoEnvio>Correcto</tikR:EstadoEnvio>${linea('A-1', 'Correcto')}`)), AHORA);
  assert.equal(p.registros[0].estado, 'REGISTRADA');
  assert.equal(p.registros[0].csv, 'CSV1');
  assert.equal(p.envio.csv, 'CSV1');
  assert.equal(p.esperaMs, 90_000);
  assert.equal(p.pausarEstudio, false);
  transicionesValidas(p.registros.map(r => r.estado));
});

test('rechazo: RECHAZADA con código, sin CSV, y aviso a la propietaria', () => {
  const p = planificarResultado([A1], ok(sobre(`<tikR:EstadoEnvio>Incorrecto</tikR:EstadoEnvio>${linea('A-1', 'Incorrecto', '<tikR:CodigoErrorRegistro>1189</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Destinatarios</tikR:DescripcionErrorRegistro>')}`)), AHORA);
  assert.equal(p.registros[0].estado, 'RECHAZADA');
  assert.equal(p.registros[0].codigoError, '1189');
  assert.equal(p.registros[0].csv, null);
  assert.equal(p.avisarPropietaria, true);
});

test('parcialmente correcto: cada registro con lo suyo, casado por número y no por posición', () => {
  const p = planificarResultado([A1, A2], ok(sobre(`<tikR:CSV>CSVP</tikR:CSV><tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>${linea('A-2', 'Incorrecto', '<tikR:CodigoErrorRegistro>1100</tikR:CodigoErrorRegistro>')}${linea('A-1', 'AceptadoConErrores', '<tikR:CodigoErrorRegistro>2000</tikR:CodigoErrorRegistro>')}`)), AHORA);
  const porId = Object.fromEntries(p.registros.map(r => [r.id, r]));
  assert.equal(porId.r1.estado, 'ACEPTADA_CON_ERRORES');
  assert.equal(porId.r1.csv, 'CSVP');
  assert.equal(porId.r2.estado, 'RECHAZADA');
});

// ── B3: duplicados ───────────────────────────────────────────────────────────
const duplicado = (estado: string) => linea('A-1', 'Incorrecto',
  `<tikR:CodigoErrorRegistro>3000</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Registro de facturación duplicado.</tikR:DescripcionErrorRegistro><tikR:RegistroDuplicado><tik:IdPeticionRegistroDuplicado>1</tik:IdPeticionRegistroDuplicado><tik:EstadoRegistroDuplicado>${estado}</tik:EstadoRegistroDuplicado></tikR:RegistroDuplicado>`);

test('B3: 3000 + Correcta → REGISTRADA (no RECHAZADA), sin guardar el CSV de este envío', () => {
  const p = planificarResultado([A1], ok(sobre(`<tikR:CSV>OTRO</tikR:CSV><tikR:EstadoEnvio>Incorrecto</tikR:EstadoEnvio>${duplicado('Correcta')}`)), AHORA);
  assert.equal(p.registros[0].estado, 'REGISTRADA');
  assert.equal(p.registros[0].estadoDuplicado, 'Correcta');
  assert.equal(p.registros[0].csv, null);
  assert.equal(p.avisarPropietaria, false, 'un duplicado no es un rechazo: no se avisa de nada');
});

test('B3: 3000 + AceptadaConErrores → ACEPTADA_CON_ERRORES', () => {
  const p = planificarResultado([A1], ok(sobre(`<tikR:EstadoEnvio>Incorrecto</tikR:EstadoEnvio>${duplicado('AceptadaConErrores')}`)), AHORA);
  assert.equal(p.registros[0].estado, 'ACEPTADA_CON_ERRORES');
});

test('B3: 3000 + Anulada → ANULADA_EN_AEAT', () => {
  const p = planificarResultado([A1], ok(sobre(`<tikR:EstadoEnvio>Incorrecto</tikR:EstadoEnvio>${duplicado('Anulada')}`)), AHORA);
  assert.equal(p.registros[0].estado, 'ANULADA_EN_AEAT');
  transicionesValidas(['ANULADA_EN_AEAT']);
});

test('B3: 3000 sin el bloque RegistroDuplicado → INCIERTO (se consulta), nunca RECHAZADA', () => {
  const p = planificarResultado([A1], ok(sobre(`<tikR:EstadoEnvio>Incorrecto</tikR:EstadoEnvio>${linea('A-1', 'Incorrecto', '<tikR:CodigoErrorRegistro>3000</tikR:CodigoErrorRegistro>')}`)), AHORA);
  assert.equal(p.registros[0].estado, 'INCIERTO');
});

// ── Timeout, reintento, INCIERTO ─────────────────────────────────────────────
test('timeout DESPUÉS de enviar → INCIERTO: nunca se reenvía sin preguntar', () => {
  const p = planificarResultado([A1, A2], { status: null, cuerpo: '', fallo: 'SIN_RESPUESTA', error: 'timeout' }, AHORA);
  assert.deepEqual(p.registros.map(r => r.estado), ['INCIERTO', 'INCIERTO']);
  assert.ok(p.registros.every(r => r.proximoIntentoEn === null));
  transicionesValidas(['INCIERTO']);
});

test('fallo ANTES de enviar (conexión, TLS) → REINTENTAR con espera creciente', () => {
  const p = planificarResultado([A1, A2], { status: null, cuerpo: '', fallo: 'NO_ENVIADO', error: 'ECONNREFUSED' }, AHORA);
  assert.deepEqual(p.registros.map(r => r.estado), ['REINTENTAR', 'REINTENTAR']);
  const [r1, r2] = p.registros;
  assert.equal(r1.proximoIntentoEn?.getTime(), AHORA.getTime() + 60_000, '1.er intento: 1 min');
  assert.equal(r2.proximoIntentoEn?.getTime(), AHORA.getTime() + 900_000, '3.er intento: 15 min');
  // El intento fallido también consume el control de flujo.
  assert.equal(p.esperaMs, 60_000);
});

test('respuesta ilegible (HTML de un proxy, 502) → INCIERTO', () => {
  const p = planificarResultado([A1], { status: 502, cuerpo: '<html>Bad Gateway</html>', fallo: null, error: null }, AHORA);
  assert.equal(p.registros[0].estado, 'INCIERTO');
  assert.equal(p.envio.falloTransporte, 'ILEGIBLE');
});

test('envío aceptado pero sin línea para un registro → INCIERTO, no «registrada»', () => {
  const p = planificarResultado([A1, A2], ok(sobre(`<tikR:EstadoEnvio>Correcto</tikR:EstadoEnvio>${linea('A-1', 'Correcto')}`)), AHORA);
  const porId = Object.fromEntries(p.registros.map(r => [r.id, r.estado]));
  assert.equal(porId.r1, 'REGISTRADA');
  assert.equal(porId.r2, 'INCIERTO');
});

// ── Faults ───────────────────────────────────────────────────────────────────
test('4112 (titular del certificado no es obligado/apoderado) → estudio PAUSADO, registros a LISTO, aviso', () => {
  const p = planificarResultado([A1], { status: 500, cuerpo: fault('Codigo[4112].El titular del certificado debe ser Obligado Emisión, Colaborador Social, Apoderado o Sucesor.'), fallo: null, error: null }, AHORA);
  assert.equal(p.pausarEstudio, true);
  assert.equal(p.suspenderTodo, false);
  assert.equal(p.claseFault, 'SIN_PODER');
  assert.equal(p.avisarPropietaria, true);
  assert.equal(p.registros[0].estado, 'LISTO', 'el registro está bien; lo que falta es el poder');
  assert.equal(p.envio.estadoEnvio, 'FAULT');
  transicionesValidas(['LISTO']);
});

test('4140 (consulta sin apoderamiento) → también SIN_PODER y pausa', () => {
  const p = planificarResultado([A1], { status: 500, cuerpo: fault('Codigo[4140].No puede acceder a la consulta de facturas al no estar apoderado en los trámites necesarios.'), fallo: null, error: null }, AHORA);
  assert.equal(p.claseFault, 'SIN_PODER');
  assert.equal(p.pausarEstudio, true);
});

test('4141 (acceso suspendido) → se para TODA la transmisión, no solo el estudio', () => {
  const p = planificarResultado([A1], { status: 500, cuerpo: fault('Codigo[4141].Le informamos que su acceso al sistema VERIFACTU ha sido suspendido temporalmente'), fallo: null, error: null }, AHORA);
  assert.equal(p.suspenderTodo, true);
  assert.equal(p.pausarEstudio, false);
  assert.equal(p.registros[0].estado, 'LISTO');
});

test('fault técnico de la AEAT (4110) → REINTENTAR el mismo XML con espera', () => {
  const p = planificarResultado([A1], { status: 500, cuerpo: fault('Codigo[4110].Error técnico al comprobar los apoderamientos.'), fallo: null, error: null }, AHORA);
  assert.equal(p.registros[0].estado, 'REINTENTAR');
  assert.ok(p.registros[0].proximoIntentoEn);
  assert.equal(p.pausarEstudio, false);
});

test('fault de esquema/datos (4102) → RECHAZADA (se subsana con otro registro) y estudio en pausa', () => {
  const p = planificarResultado([A1], { status: 500, cuerpo: fault('Codigo[4102].El XML no cumple el esquema.'), fallo: null, error: null }, AHORA);
  assert.equal(p.registros[0].estado, 'RECHAZADA');
  assert.equal(p.pausarEstudio, true);
});

test('fault con código desconocido → nada se da por rechazado; pausa para que lo mire una persona', () => {
  const p = planificarResultado([A1], { status: 500, cuerpo: fault('Algo que no sabemos leer'), fallo: null, error: null }, AHORA);
  assert.equal(p.claseFault, 'DESCONOCIDO');
  assert.equal(p.registros[0].estado, 'LISTO');
  assert.equal(p.pausarEstudio, true);
});
