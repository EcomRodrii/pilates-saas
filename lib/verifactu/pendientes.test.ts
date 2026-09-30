import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decidirLote, casarRespuestas, yaNoSeReenvia, esperaAntesDelSiguienteEnvioMs,
  ESPERA_AEAT_POR_DEFECTO_SEGUNDOS, type RegistroCola,
} from './pendientes.ts';
import { TRAS_ANTERIOR_RECHAZADO, TRAS_ANTERIOR_HISTORICO } from './politica-cadena.ts';
import type { EstadoRegistroVerifactu } from './estado.ts';
import type { RegistroRespondido } from './respuesta.ts';

const r = (seq: number, estado: EstadoRegistroVerifactu, extra: Partial<RegistroCola> = {}): RegistroCola => ({
  id: `r${seq}`, seq, tipo: 'ALTA', estado, numSerieFactura: `A-${seq}`, fechaExpedicion: '05-09-2026',
  proximoIntentoEn: null, ...extra,
});
const AHORA = new Date('2026-09-30T10:00:00Z');

// El orden es la cadena. Mandar la 7 antes que la 6 le da a la AEAT una
// secuencia que no cuadra.
test('el lote va ordenado por secuencia, no por el orden en que llegaron', () => {
  const d = decidirLote([r(3, 'LISTO'), r(1, 'LISTO'), r(2, 'LISTO')], AHORA);
  assert.equal(d.tipo, 'ENVIAR');
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [1, 2, 3]);
});

test('el lote se corta al tamaño pedido, quedándose con los primeros', () => {
  const d = decidirLote([r(1, 'LISTO'), r(2, 'LISTO'), r(3, 'LISTO')], AHORA, 2);
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [1, 2]);
});

test('detrás de lo ya registrado, sale lo siguiente', () => {
  const d = decidirLote([r(1, 'REGISTRADA'), r(2, 'ACEPTADA_CON_ERRORES'), r(3, 'LISTO')], AHORA);
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [3]);
});

test('sin nada pendiente, no hay nada que hacer', () => {
  assert.equal(decidirLote([r(1, 'REGISTRADA')], AHORA).tipo, 'NADA');
});

test('un hueco en la secuencia no se salta', () => {
  const d = decidirLote([r(1, 'REGISTRADA'), r(3, 'LISTO')], AHORA);
  assert.deepEqual(d, { tipo: 'ESPERAR', motivo: 'HUECO_EN_CADENA' });
});

test('el primero pendiente INCIERTO: antes de mandar nada, se concilia', () => {
  const d = decidirLote([r(1, 'REGISTRADA'), r(2, 'INCIERTO'), r(3, 'LISTO')], AHORA);
  assert.equal(d.tipo, 'CONCILIAR');
  assert.equal(d.tipo === 'CONCILIAR' && d.registro.id, 'r2');
});

test('un envío en curso o una reserva sin huella hacen esperar', () => {
  assert.deepEqual(decidirLote([r(1, 'ENVIANDO'), r(2, 'LISTO')], AHORA), { tipo: 'ESPERAR', motivo: 'ENVIO_EN_CURSO' });
  assert.deepEqual(decidirLote([r(1, 'REGISTRADA'), r(2, 'RESERVADO')], AHORA), { tipo: 'ESPERAR', motivo: 'ANTERIOR_RESERVADO' });
});

test('REINTENTAR respeta su hora: antes no sale; después sí, con el mismo lugar en la cadena', () => {
  const pronto = new Date(AHORA.getTime() + 60_000).toISOString();
  assert.deepEqual(decidirLote([r(1, 'REINTENTAR', { proximoIntentoEn: pronto }), r(2, 'LISTO')], AHORA), { tipo: 'ESPERAR', motivo: 'EN_REINTENTO' });
  const d = decidirLote([r(1, 'REINTENTAR', { proximoIntentoEn: pronto }), r(2, 'LISTO')], new Date(AHORA.getTime() + 61_000));
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [1, 2]);
});

// ── B5: un rechazo NO congela la cadena ──────────────────────────────────────
test('B5: tras un RECHAZADO la cadena sigue (política vigente: continuar) y el rechazado no se reenvía', () => {
  assert.equal(TRAS_ANTERIOR_RECHAZADO, 'continuar');
  const d = decidirLote([r(1, 'REGISTRADA'), r(2, 'RECHAZADA'), r(3, 'LISTO'), r(4, 'LISTO')], AHORA);
  assert.equal(d.tipo, 'ENVIAR');
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [3, 4]);
});

test('B5: la subsanación entra en la cadena como uno más, detrás del último', () => {
  const d = decidirLote([
    r(1, 'RECHAZADA'), r(2, 'REGISTRADA'),
    r(3, 'LISTO', { tipo: 'ALTA_SUBSANACION', numSerieFactura: 'A-1' }),
  ], AHORA);
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => [x.seq, x.tipo]), [[3, 'ALTA_SUBSANACION']]);
});

test('un rechazo local en medio del lote tampoco congela lo que viene detrás', () => {
  const d = decidirLote([r(1, 'LISTO'), r(2, 'RECHAZADA'), r(3, 'LISTO')], AHORA);
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [1, 3]);
});

test('detrás de un HISTÓRICO (nunca remitido) no se envía hasta decidir qué hacer con él (NO CONFIRMADO)', () => {
  assert.equal(TRAS_ANTERIOR_HISTORICO, 'esperar_decision');
  assert.deepEqual(decidirLote([r(1, 'HISTORICO'), r(2, 'LISTO')], AHORA), { tipo: 'ESPERAR', motivo: 'ANTERIOR_HISTORICO_SIN_DECIDIR' });
});

test('dos registros de la misma factura no van en el mismo sobre', () => {
  const d = decidirLote([r(1, 'LISTO'), r(2, 'LISTO', { tipo: 'ALTA_SUBSANACION', numSerieFactura: 'A-1' })], AHORA);
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [1]);
});

// ── Casar respuestas ─────────────────────────────────────────────────────────
const linea = (num: string, estado: RegistroRespondido['estado'], operacion: RegistroRespondido['operacion'] = 'Alta'): RegistroRespondido => ({
  numSerieFactura: num, fechaExpedicionFactura: '05-09-2026', operacion, estado,
  codigoError: null, descripcionError: null, duplicado: null,
});

// Lo que más daño hace: emparejar por posición. La AEAT no garantiza el orden.
test('las respuestas se casan por factura y operación, nunca por posición', () => {
  const enviados = [r(1, 'ENVIANDO'), r(2, 'ENVIANDO')];
  const res = casarRespuestas(enviados, [linea('A-2', 'Incorrecto'), linea('A-1', 'Correcto')]);
  assert.equal(res[0].linea?.estado, 'Correcto');
  assert.equal(res[1].linea?.estado, 'Incorrecto');
});

test('alta y anulación de la misma factura se distinguen por la operación', () => {
  const alta = r(1, 'ENVIANDO');
  const anul = r(2, 'ENVIANDO', { tipo: 'ANULACION', numSerieFactura: 'A-1' });
  const res = casarRespuestas([alta, anul], [linea('A-1', 'Incorrecto', 'Anulacion'), linea('A-1', 'Correcto', 'Alta')]);
  assert.equal(res[0].linea?.estado, 'Correcto');
  assert.equal(res[1].linea?.estado, 'Incorrecto');
});

test('un registro sin línea de respuesta recibe null, no se da por bueno', () => {
  assert.equal(casarRespuestas([r(1, 'ENVIANDO')], [])[0].linea, null);
});

test('el sello del QR solo con la factura admitida y vigente', () => {
  assert.ok(yaNoSeReenvia('ACEPTADA_CON_ERRORES'));
  assert.ok(yaNoSeReenvia('REGISTRADA'));
  assert.ok(!yaNoSeReenvia('RECHAZADA'));
  assert.ok(!yaNoSeReenvia('PENDIENTE'));
  assert.ok(!yaNoSeReenvia('ANULADA'));
});

// 50ª pasada de auditoría, H-2: el control de flujo de la AEAT.
test('respeta el TiempoEsperaEnvio que devuelve la AEAT', () => {
  assert.equal(esperaAntesDelSiguienteEnvioMs(120), 120_000);
});

test('sin TiempoEsperaEnvio (o 0/negativo) usa el valor inicial de la orden, nunca cero', () => {
  assert.equal(esperaAntesDelSiguienteEnvioMs(null), ESPERA_AEAT_POR_DEFECTO_SEGUNDOS * 1000);
  assert.equal(esperaAntesDelSiguienteEnvioMs(0), ESPERA_AEAT_POR_DEFECTO_SEGUNDOS * 1000);
  assert.equal(esperaAntesDelSiguienteEnvioMs(-5), ESPERA_AEAT_POR_DEFECTO_SEGUNDOS * 1000);
});

// ── Barrera de activación (barrera-activacion.ts) ────────────────────────────
test('barrera: un registro anterior a la activación no sale, y la cadena del estudio se para ahí', () => {
  const d = decidirLote([r(1, 'LISTO', { anteriorAActivacion: true }), r(2, 'LISTO')], AHORA);
  assert.deepEqual(d, { tipo: 'ESPERAR', motivo: 'ANTERIOR_A_LA_ACTIVACION' });
});

test('barrera: lo posterior a la activación sale con normalidad', () => {
  const d = decidirLote([r(1, 'REGISTRADA'), r(2, 'LISTO', { anteriorAActivacion: false }), r(3, 'LISTO')], AHORA);
  assert.equal(d.tipo, 'ENVIAR');
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [2, 3]);
});

test('barrera: un anterior a la activación en medio del lote lo corta, nunca viaja', () => {
  const d = decidirLote([r(1, 'LISTO'), r(2, 'LISTO', { anteriorAActivacion: true }), r(3, 'LISTO')], AHORA);
  assert.equal(d.tipo, 'ENVIAR');
  assert.deepEqual(d.tipo === 'ENVIAR' && d.lote.map(x => x.seq), [1]);
});
