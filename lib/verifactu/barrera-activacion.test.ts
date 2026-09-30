import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anteriorALaActivacion, registrosQueBloqueanActivacion, mensajeBloqueoActivacion, noRemitirHastaSeq, noRemitidoPorDecision,
} from './barrera-activacion.ts';

const ACTIVADO = '2026-10-15T10:00:00Z';

test('sin activar, todo registro es anterior a la activación', () => {
  assert.equal(anteriorALaActivacion('2026-10-20T10:00:00Z', null), true);
});

test('con activación: antes es anterior; en el mismo instante o después, no', () => {
  assert.equal(anteriorALaActivacion('2026-10-15T09:59:59Z', ACTIVADO), true);
  assert.equal(anteriorALaActivacion('2026-10-15T10:00:00Z', ACTIVADO), false);
  assert.equal(anteriorALaActivacion('2026-10-15T12:00:00+02:00', ACTIVADO), false, 'compara instantes, no texto');
});

test('primera activación: cualquier factura previa que la AEAT no tiene bloquea (las 18 pendientes del caso real)', () => {
  const pendientes = Array.from({ length: 18 }, (_, i) => ({ estado: 'PENDIENTE' as const, creadoEn: `2026-09-${String(i + 1).padStart(2, '0')}T10:00:00Z` }));
  assert.equal(registrosQueBloqueanActivacion(pendientes, null), 18);
  assert.equal(registrosQueBloqueanActivacion([{ estado: 'HISTORICO', creadoEn: '2026-07-01T10:00:00Z' }], null), 1, 'un histórico sin enviar también');
  assert.equal(registrosQueBloqueanActivacion([], null), 0, 'un estudio sin facturas previas se activa');
});

test('lo que la AEAT ya tiene nunca bloquea', () => {
  const r = [
    { estado: 'REGISTRADA' as const, creadoEn: '2026-09-01T10:00:00Z' },
    { estado: 'ACEPTADA_CON_ERRORES' as const, creadoEn: '2026-09-01T10:00:00Z' },
    { estado: 'ANULADA_EN_AEAT' as const, creadoEn: '2026-09-01T10:00:00Z' },
  ];
  assert.equal(registrosQueBloqueanActivacion(r, ACTIVADO), 0);
});

test('reactivar tras una pausa: lo emitido durante la pausa es VERI*FACTU, no bloquea', () => {
  // Activado el 15-oct, pausado, con facturas del 20-oct pendientes: la
  // activación que cuenta es la primera, y esas son posteriores.
  assert.equal(registrosQueBloqueanActivacion([{ estado: 'PENDIENTE', creadoEn: '2026-10-20T10:00:00Z' }], ACTIVADO), 0);
});

test('el mensaje dice cuántas y que no se envían solas', () => {
  assert.match(mensajeBloqueoActivacion(18), /18 facturas emitidas antes de activar/);
  assert.match(mensajeBloqueoActivacion(1), /1 factura emitida antes/);
  assert.match(mensajeBloqueoActivacion(18), /no se envían solas/);
});

// La salida de la barrera: una decisión escrita NO_REMITIR (criterio del
// fiscalista, 30-sep-2026). La vigente es la última; deshacerla es otra fila.

test('decisión vigente: la última manda, y una DESHECHA no deja nada fuera', () => {
  assert.equal(noRemitirHastaSeq([]), null);
  assert.equal(noRemitirHastaSeq([{ decision: 'NO_REMITIR', hastaSeq: 20, creadoEn: '2026-10-01T10:00:00Z' }]), 20);
  assert.equal(noRemitirHastaSeq([
    { decision: 'NO_REMITIR', hastaSeq: 20, creadoEn: '2026-10-01T10:00:00Z' },
    { decision: 'DESHECHA', hastaSeq: 20, creadoEn: '2026-10-02T10:00:00Z' },
  ]), null);
  assert.equal(noRemitirHastaSeq([
    { decision: 'DESHECHA', hastaSeq: 20, creadoEn: '2026-10-02T10:00:00Z' },
    { decision: 'NO_REMITIR', hastaSeq: 21, creadoEn: '2026-10-03T10:00:00Z' },
  ]), 21, 'el orden de llegada no importa, importa la fecha');
});

test('con la decisión, las 20 anteriores dejan de bloquear; una posterior a la decisión, no', () => {
  const regs = Array.from({ length: 21 }, (_, i) => ({ estado: 'PENDIENTE' as const, creadoEn: '2026-09-30T10:00:00Z', seq: i + 1 }));
  assert.equal(registrosQueBloqueanActivacion(regs, null), 21);
  assert.equal(registrosQueBloqueanActivacion(regs, null, 20), 1, 'la 21 (p. ej. una rectificativa posterior) pide otra decisión');
  assert.equal(registrosQueBloqueanActivacion(regs.slice(0, 20), null, 20), 0);
});

test('noRemitidoPorDecision: solo lo anterior a la activación y dentro del rango', () => {
  assert.equal(noRemitidoPorDecision({ seq: 20, creadoEn: '2026-09-30T10:00:00Z' }, ACTIVADO, 20), true);
  assert.equal(noRemitidoPorDecision({ seq: 21, creadoEn: '2026-09-30T10:00:00Z' }, ACTIVADO, 20), false);
  assert.equal(noRemitidoPorDecision({ seq: 5, creadoEn: '2026-10-16T10:00:00Z' }, ACTIVADO, 20), false, 'lo posterior a la activación se remite siempre');
  assert.equal(noRemitidoPorDecision({ seq: 5, creadoEn: '2026-09-30T10:00:00Z' }, ACTIVADO, null), false);
});
