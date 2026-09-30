import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  habilitacionDe, erroresAutorizacion, siguienteEstadoEstudio, revisionCaducidad, textoMandato, apoderadoDeEntorno,
  MANDATO_VERSION, TRAMITE_IZ860, type SituacionEstudio, type AutorizacionEntrante,
} from './apoderamiento.ts';

const HOY = new Date('2026-09-30T10:00:00Z');
const NIF = '99999999R';
const APODERADO = '00000000T';

const OK: SituacionEstudio = {
  estudio: { estado: 'PRODUCCION', nif: NIF },
  representacion: { estado: 'VERIFICADA', vigenteHasta: '2031-09-29', nifRepresentado: NIF, apoderadoNif: APODERADO },
  esDemo: false, nifActual: NIF, apoderadoNif: APODERADO, hoy: HOY,
};

test('habilitado solo con TODO en orden: producción + poder verificado y vigente, mismo NIF, mismo apoderado', () => {
  assert.deepEqual(habilitacionDe(OK), { habilitado: true });
});

test('24 · estudio SIN poder → envío bloqueado', () => {
  assert.deepEqual(habilitacionDe({ ...OK, representacion: null }), { habilitado: false, motivo: 'SIN_AUTORIZACION_VERIFICADA' });
  assert.deepEqual(habilitacionDe({ ...OK, estudio: null, representacion: null }), { habilitado: false, motivo: 'SIN_AUTORIZACION_VERIFICADA' });
  // En revisión todavía no vale: lo que autoriza es el poder COMPROBADO.
  assert.equal(habilitacionDe({ ...OK, representacion: { ...OK.representacion!, estado: 'EN_REVISION' } }).habilitado, false);
});

test('25 · poder revocado (o la AEAT dice que no hay poder) → envío bloqueado', () => {
  for (const estado of ['REVOCADA', 'SIN_PODER_AEAT', 'CADUCADA', 'RECHAZADA_REVISION', 'RENUNCIADA'] as const) {
    assert.equal(habilitacionDe({ ...OK, representacion: { ...OK.representacion!, estado } }).habilitado, false, estado);
  }
});

test('el poder es de un NIF: si el estudio cambia de NIF, no se envía', () => {
  assert.equal(habilitacionDe({ ...OK, nifActual: 'B00000000' }).habilitado, false);
});

test('el poder es a favor de un apoderado: con otro certificado configurado, no se envía', () => {
  assert.equal(habilitacionDe({ ...OK, apoderadoNif: '11111111H' }).habilitado, false);
  assert.equal(habilitacionDe({ ...OK, apoderadoNif: null }).habilitado, false);
});

test('poder caducado → bloqueado aunque siga marcado como verificado', () => {
  assert.deepEqual(habilitacionDe({ ...OK, representacion: { ...OK.representacion!, vigenteHasta: '2026-09-29' } }), { habilitado: false, motivo: 'PODER_CADUCADO' });
});

test('estudio de demostración: nunca se habilita', () => {
  assert.deepEqual(habilitacionDe({ ...OK, esDemo: true }), { habilitado: false, motivo: 'ESTUDIO_DE_DEMOSTRACION' });
});

test('verificado pero sin activar, pausado o suspendido: no se envía', () => {
  assert.deepEqual(habilitacionDe({ ...OK, estudio: { ...OK.estudio!, estado: 'VERIFICADO' } }), { habilitado: false, motivo: 'NO_EN_PRODUCCION' });
  assert.deepEqual(habilitacionDe({ ...OK, estudio: { ...OK.estudio!, estado: 'PAUSADO' } }), { habilitado: false, motivo: 'PAUSADO' });
  assert.deepEqual(habilitacionDe({ ...OK, estudio: { ...OK.estudio!, estado: 'SUSPENDIDO_AEAT' } }), { habilitado: false, motivo: 'SUSPENDIDO_AEAT' });
});

// ── Ciclo de vida ────────────────────────────────────────────────────────────
test('producción solo desde VERIFICADO; nunca desde pendiente o en revisión', () => {
  assert.equal(siguienteEstadoEstudio('VERIFICADO', 'ACTIVAR_PRODUCCION'), 'PRODUCCION');
  assert.equal(siguienteEstadoEstudio('PENDIENTE_AUTORIZACION', 'ACTIVAR_PRODUCCION'), null);
  assert.equal(siguienteEstadoEstudio('AUTORIZACION_EN_REVISION', 'ACTIVAR_PRODUCCION'), null);
  assert.equal(siguienteEstadoEstudio('PAUSADO', 'ACTIVAR_PRODUCCION'), null);
});

test('el camino completo del alta', () => {
  let e = siguienteEstadoEstudio('SIN_CONFIGURAR', 'CONFIGURAR');
  assert.equal(e, 'PENDIENTE_AUTORIZACION');
  e = siguienteEstadoEstudio(e!, 'ENVIAR_AUTORIZACION');
  assert.equal(e, 'AUTORIZACION_EN_REVISION');
  e = siguienteEstadoEstudio(e!, 'VERIFICAR');
  assert.equal(e, 'VERIFICADO');
  e = siguienteEstadoEstudio(e!, 'ACTIVAR_PRODUCCION');
  assert.equal(e, 'PRODUCCION');
});

test('4112/4140 → PAUSADO; 4141 → SUSPENDIDO_AEAT; reanudar vuelve a VERIFICADO, no a producción', () => {
  assert.equal(siguienteEstadoEstudio('PRODUCCION', 'PAUSAR'), 'PAUSADO');
  assert.equal(siguienteEstadoEstudio('PRODUCCION', 'SUSPENDER_AEAT'), 'SUSPENDIDO_AEAT');
  assert.equal(siguienteEstadoEstudio('PAUSADO', 'REANUDAR'), 'VERIFICADO');
  assert.equal(siguienteEstadoEstudio('SUSPENDIDO_AEAT', 'REANUDAR'), 'VERIFICADO');
});

test('revocar o caducar devuelve a pedir autorización', () => {
  assert.equal(siguienteEstadoEstudio('PRODUCCION', 'REVOCAR'), 'PENDIENTE_AUTORIZACION');
  assert.equal(siguienteEstadoEstudio('PRODUCCION', 'CADUCAR'), 'PENDIENTE_AUTORIZACION');
  assert.equal(siguienteEstadoEstudio('AUTORIZACION_EN_REVISION', 'RECHAZAR_REVISION'), 'PENDIENTE_AUTORIZACION');
});

// ── Evidencia ────────────────────────────────────────────────────────────────
const AUT: AutorizacionEntrante = {
  csv: 'ABCD1234EFGH5678', otorgadoEn: '2026-09-29', vigenteHasta: '2031-09-28', tramite: 'IZ860',
  otorgante: { nombre: 'Titular de Ejemplo', nif: NIF, cargo: 'titular' }, aceptaMandato: true, mandatoVersion: MANDATO_VERSION,
};

test('evidencia correcta: sin errores', () => {
  assert.deepEqual(erroresAutorizacion(AUT, { tipoEmisor: 'persona_fisica' }, HOY), []);
});

test('evidencia: el simple «acepto» no basta — sin CSV no hay autorización', () => {
  assert.ok(erroresAutorizacion({ ...AUT, csv: '' }, { tipoEmisor: 'persona_fisica' }, HOY).length > 0);
  assert.ok(erroresAutorizacion({ ...AUT, csv: 'con espacios y ñ' }, { tipoEmisor: 'persona_fisica' }, HOY).length > 0);
});

test('evidencia: fechas del Registro (no futura, termina después, máximo 5 años, no caducada)', () => {
  const f = (a: Partial<AutorizacionEntrante>) => erroresAutorizacion({ ...AUT, ...a }, { tipoEmisor: 'persona_fisica' }, HOY);
  assert.ok(f({ otorgadoEn: '2026-10-01' }).some(e => e.includes('futura')));
  assert.ok(f({ vigenteHasta: '2026-09-29' }).some(e => e.includes('después')));
  assert.ok(f({ vigenteHasta: '2031-09-30' }).some(e => e.includes('5 años')));
  assert.ok(f({ otorgadoEn: '2020-01-01', vigenteHasta: '2024-12-31' }).some(e => e.includes('caducado')));
  assert.ok(f({ otorgadoEn: '2026-02-30' }).length > 0, 'fecha que no existe');
});

test('evidencia: quién otorga cuadra con el tipo de emisor', () => {
  assert.ok(erroresAutorizacion({ ...AUT, otorgante: { ...AUT.otorgante, cargo: 'representante_legal' } }, { tipoEmisor: 'persona_fisica' }, HOY).length > 0);
  assert.ok(erroresAutorizacion(AUT, { tipoEmisor: 'sociedad' }, HOY).length > 0);
  assert.deepEqual(erroresAutorizacion({ ...AUT, otorgante: { ...AUT.otorgante, cargo: 'representante_legal' } }, { tipoEmisor: 'sociedad' }, HOY), []);
});

test('evidencia: mandato no aceptado o de otra versión → no se guarda', () => {
  assert.ok(erroresAutorizacion({ ...AUT, aceptaMandato: false }, { tipoEmisor: 'persona_fisica' }, HOY).length > 0);
  assert.ok(erroresAutorizacion({ ...AUT, mandatoVersion: '2020-01-01' }, { tipoEmisor: 'persona_fisica' }, HOY).length > 0);
});

// ── Caducidad ────────────────────────────────────────────────────────────────
test('caducidad: aviso una vez dentro de los 60 días; pasada la fecha, caducado', () => {
  assert.equal(revisionCaducidad({ vigenteHasta: '2031-09-29', avisoCaducidadEn: null }, HOY), null);
  assert.equal(revisionCaducidad({ vigenteHasta: '2026-11-15', avisoCaducidadEn: null }, HOY), 'AVISAR');
  assert.equal(revisionCaducidad({ vigenteHasta: '2026-11-15', avisoCaducidadEn: '2026-09-20T00:00:00Z' }, HOY), null, 'no se avisa dos veces');
  assert.equal(revisionCaducidad({ vigenteHasta: '2026-09-29', avisoCaducidadEn: '2026-08-01T00:00:00Z' }, HOY), 'CADUCADA');
});

// ── Mandato y apoderado ──────────────────────────────────────────────────────
test('el mandato nombra al apoderado, el NIF representado y el trámite IZ860, y lleva versión', () => {
  const t = textoMandato({ estudio: { nombreFiscal: 'Estudio de Ejemplo', nif: NIF }, apoderado: { nombre: 'Apoderado de Ejemplo', nif: APODERADO }, tramite: 'IZ860' });
  assert.ok(t.includes(`versión ${MANDATO_VERSION}`));
  assert.ok(t.includes('Apoderado de Ejemplo') && t.includes(APODERADO) && t.includes(NIF));
  assert.ok(t.includes(TRAMITE_IZ860.codigo) && t.includes(TRAMITE_IZ860.nombre));
  assert.ok(t.includes('el poder real es el inscrito en la AEAT'));
});

test('el apoderado es por defecto el productor; se puede separar con VERIFACTU_APODERADO_*', () => {
  assert.deepEqual(apoderadoDeEntorno({ VERIFACTU_PRODUCTOR_NOMBRE: 'P', VERIFACTU_PRODUCTOR_NIF: APODERADO }), { nombre: 'P', nif: APODERADO });
  assert.deepEqual(apoderadoDeEntorno({ VERIFACTU_PRODUCTOR_NOMBRE: 'P', VERIFACTU_PRODUCTOR_NIF: APODERADO, VERIFACTU_APODERADO_NOMBRE: 'A', VERIFACTU_APODERADO_NIF: '11111111h' }), { nombre: 'A', nif: '11111111H' });
  assert.equal(apoderadoDeEntorno({}), null);
});
