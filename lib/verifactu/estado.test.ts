import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transicionPermitida, transitar, resolverConsulta, siguienteIntento, estadoParaFactura, claseDeFault,
  ESTADOS_FINALES, type EstadoRegistroVerifactu,
} from './estado.ts';
import type { RespuestaConsulta } from './respuesta.ts';

test('los estados finales no tienen salida: un registro rechazado no se reescribe', () => {
  for (const e of ESTADOS_FINALES) {
    for (const a of ['PENDIENTE', 'LISTO', 'ENVIANDO', 'REGISTRADA'] as EstadoRegistroVerifactu[]) {
      assert.equal(transicionPermitida(e, a), false, `${e} → ${a}`);
    }
  }
  assert.throws(() => transitar('RECHAZADA', 'LISTO'));
});

test('INCIERTO solo sale por consulta: a un estado admitido o de vuelta a LISTO', () => {
  assert.ok(transicionPermitida('INCIERTO', 'REGISTRADA'));
  assert.ok(transicionPermitida('INCIERTO', 'LISTO'));
  assert.equal(transicionPermitida('INCIERTO', 'ENVIANDO'), false, 'nunca de INCIERTO a enviar directamente');
  assert.equal(transicionPermitida('INCIERTO', 'RECHAZADA'), false);
});

test('el XML se congela una vez: LISTO no vuelve a PENDIENTE', () => {
  assert.equal(transicionPermitida('LISTO', 'PENDIENTE'), false);
  assert.ok(transicionPermitida('PENDIENTE', 'LISTO'));
  assert.ok(transicionPermitida('REINTENTAR', 'LISTO'));
  assert.ok(transicionPermitida('REINTENTAR', 'ENVIANDO'), 'el reintento que ya toca se reclama directamente');
});

const consulta = (estado: 'Correcto' | 'AceptadoConErrores' | 'Anulado' | null, huella: string): RespuestaConsulta => ({
  fault: false, faultMensaje: null, faultCodigo: null, resultado: 'ConDatos',
  registros: [{ numSerieFactura: 'A-1', fechaExpedicionFactura: '05-09-2026', huella, estado }],
});
const LOCAL = { tipo: 'ALTA' as const, numSerieFactura: 'A-1', huella: 'A'.repeat(64) };

test('INCIERTO + la AEAT lo tiene con la MISMA huella → estado admitido', () => {
  assert.equal(resolverConsulta(LOCAL, consulta('Correcto', 'A'.repeat(64))).estado, 'REGISTRADA');
  assert.equal(resolverConsulta(LOCAL, consulta('AceptadoConErrores', 'A'.repeat(64))).estado, 'ACEPTADA_CON_ERRORES');
  assert.equal(resolverConsulta(LOCAL, consulta('Anulado', 'A'.repeat(64))).estado, 'ANULADA_EN_AEAT');
});

test('INCIERTO + la AEAT no lo tiene → LISTO: reenviar el MISMO XML es seguro', () => {
  const r = resolverConsulta(LOCAL, { fault: false, faultMensaje: null, faultCodigo: null, resultado: 'SinDatos', registros: [] });
  assert.equal(r.estado, 'LISTO');
  assert.equal(r.revisionManual, false);
});

test('INCIERTO + la AEAT tiene OTRA huella de esa factura → revisión manual (alta) o reenvío (subsanación)', () => {
  const otra = consulta('Correcto', 'B'.repeat(64));
  const alta = resolverConsulta(LOCAL, otra);
  assert.equal(alta.estado, 'INCIERTO');
  assert.equal(alta.revisionManual, true);
  assert.equal(resolverConsulta({ ...LOCAL, tipo: 'ALTA_SUBSANACION' }, otra).estado, 'LISTO', 'tiene el alta anterior, no la subsanación');
});

test('INCIERTO + la consulta falla (4140) → sigue INCIERTO, revisión manual, nunca reenvío a ciegas', () => {
  const r = resolverConsulta(LOCAL, { fault: true, faultMensaje: 'no apoderado', faultCodigo: '4140', resultado: null, registros: [] });
  assert.equal(r.estado, 'INCIERTO');
  assert.equal(r.revisionManual, true);
});

test('una anulación que la AEAT tiene como Anulado con su huella es un éxito', () => {
  assert.equal(resolverConsulta({ ...LOCAL, tipo: 'ANULACION' }, consulta('Anulado', 'A'.repeat(64))).estado, 'REGISTRADA');
});

test('reintentos: 1 min, 5 min, 15 min, 1 h y luego cada 6 h', () => {
  const t0 = new Date('2026-09-30T10:00:00Z');
  const esperas = [1, 2, 3, 4, 5, 9].map(n => (siguienteIntento(n, t0).getTime() - t0.getTime()) / 60_000);
  assert.deepEqual(esperas, [1, 5, 15, 60, 360, 360]);
});

test('el resumen de la factura: el QR solo cuando la AEAT lo tiene', () => {
  assert.equal(estadoParaFactura('REGISTRADA'), 'REGISTRADA');
  assert.equal(estadoParaFactura('ACEPTADA_CON_ERRORES'), 'ACEPTADA_CON_ERRORES');
  assert.equal(estadoParaFactura('ANULADA_EN_AEAT'), 'ANULADA');
  assert.equal(estadoParaFactura('INCIERTO'), 'PENDIENTE');
  assert.equal(estadoParaFactura('ENVIANDO'), 'PENDIENTE');
  assert.equal(estadoParaFactura('HISTORICO'), null);
});

test('clasificación de faults: literal del catálogo de la AEAT', () => {
  assert.equal(claseDeFault('4112'), 'SIN_PODER');
  assert.equal(claseDeFault('4140'), 'SIN_PODER');
  assert.equal(claseDeFault('4141'), 'SUSPENDIDO');
  assert.equal(claseDeFault('4139'), 'NO_HABILITADO');
  assert.equal(claseDeFault('4134'), 'TRANSITORIO');
  assert.equal(claseDeFault('4104'), 'DATOS');
  assert.equal(claseDeFault(null), 'DESCONOCIDO');
  assert.equal(claseDeFault('9999'), 'DESCONOCIDO');
});
