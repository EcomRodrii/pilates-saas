import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ETIQUETA_ESTADO, ESTADOS_CON_ERROR, TEXTO_AVISO, cambiosEntreDias, estudioDesdeBd, evolucionPorDia, gratisParaPantalla, hoyPedido, prevision,
  recuentoPorEstado, resumenGratis, textoAviso, type FilaDiaria, type FilaSituacionBd,
} from './bajas.ts';
import { CODIGOS_AVISO_GRATIS, TEXTO_AVISO_GRATIS, informeGratis } from '../retencion/gratis-en-seco.ts';
import { DIAS_HASTA_INACTIVO, DIAS_HASTA_SUSPENDIDO } from '../retencion/situacion-estudio.ts';

const SQL = readFileSync(join(import.meta.dirname, '../../supabase/migrations/20261016123000_situacion_estudio_solo_lectura.sql'), 'utf8');

test('cada caso dudoso que apunta el SQL tiene su frase en la pantalla', () => {
  const bloque = SQL.slice(SQL.indexOf('array_remove(array['), SQL.indexOf(']::text[], null)'));
  const codigos = [...bloque.matchAll(/then '([a-z_]+)'/g)].map(m => m[1]);
  assert.ok(codigos.length >= 10, 'no encuentro los avisos en la migración');
  assert.deepEqual(codigos.filter(c => !(c in TEXTO_AVISO)), [], 'aviso del SQL sin frase en TEXTO_AVISO');
  assert.deepEqual(Object.keys(TEXTO_AVISO).filter(c => !codigos.includes(c)), [], 'frase de un aviso que el SQL ya no apunta');
  for (const e of ESTADOS_CON_ERROR) assert.ok(ETIQUETA_ESTADO[e]);
});

test('recuento: todos los estados salen, también a cero', () => {
  const r = recuentoPorEstado([{ estado: 'GRATIS' }, { estado: 'GRATIS' }, { estado: 'ACTIVO_PAGO' }, { estado: 'ERROR' }]);
  assert.equal(r.GRATIS, 2);
  assert.equal(r.ACTIVO_PAGO, 1);
  assert.equal(r.ERROR, 1);
  assert.equal(r.EN_BAJA, 0);
  assert.equal(Object.keys(r).length, ESTADOS_CON_ERROR.length);
});

const filas: FilaDiaria[] = [
  { studio_id: 'a', dia: '2026-10-16', estado: 'GRATIS' },
  { studio_id: 'b', dia: '2026-10-16', estado: 'ACTIVO_PAGO' },
  { studio_id: 'a', dia: '2026-10-17', estado: 'GRATIS' },
  { studio_id: 'b', dia: '2026-10-17', estado: 'ACTIVO_PAGO' },
  { studio_id: 'c', dia: '2026-10-17', estado: 'GRATIS' },
  // `a` no tiene fila el 18 (el cron no pasó para ella): se compara con la del 17.
  { studio_id: 'b', dia: '2026-10-18', estado: 'ACTIVO_PAGO' },
  { studio_id: 'c', dia: '2026-10-18', estado: 'GRATIS' },
  { studio_id: 'a', dia: '2026-10-19', estado: 'INACTIVO' },
  { studio_id: 'b', dia: '2026-10-19', estado: 'ERROR' },
];

test('evolución: un recuento por día, del más antiguo al más reciente', () => {
  const ev = evolucionPorDia(filas);
  assert.deepEqual(ev.map(d => d.dia), ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']);
  assert.equal(ev[1].recuento.GRATIS, 2);
  assert.equal(ev[3].recuento.INACTIVO, 1);
  assert.equal(ev[3].recuento.ERROR, 1);
});

test('cambios: quién cambia de estado de un día a otro, los nuevos y los saltos de días', () => {
  const cambios = cambiosEntreDias(filas, new Map([['a', 'Estudio A'], ['b', 'Estudio B'], ['c', 'Estudio C']]));
  assert.deepEqual(cambios.map(c => [c.dia, c.nombre, c.de, c.a]), [
    ['2026-10-19', 'Estudio A', 'GRATIS', 'INACTIVO'],
    ['2026-10-19', 'Estudio B', 'ACTIVO_PAGO', 'ERROR'],
    ['2026-10-17', 'Estudio C', null, 'GRATIS'],
  ]);
  assert.deepEqual(cambiosEntreDias([], new Map()), []);
});

const fila = (x: Partial<FilaSituacionBd>): FilaSituacionBd => ({
  studio_id: 's', estado: 'GRATIS', motivo: null, variante: null, paga: false, gestion_limitada: false,
  servicio_alumnas_suspendido: false, cobros_automaticos_pausados: false, es_demo: false, suspendido_a_mano: false,
  fase_gratis: 'SIN_MEDIR', ultima_actividad: null, ancla: '2026-10-01', dias_de_cierre: 0, dias_sin_actividad: 15, avisos: null, ...x,
});

test('previsión «si nadie hace nada»: solo para quien la falta de uso puede mover', () => {
  assert.deepEqual(prevision(fila({}), '2026-10-16'), {
    entraInactivoEl: '2026-11-30', // 16-oct + (60 − 15)
    entraSuspendidoEl: '2026-12-30', // 16-oct + (90 − 15)
  });
  assert.equal(DIAS_HASTA_INACTIVO, 60);
  assert.equal(DIAS_HASTA_SUSPENDIDO, 90);
  assert.deepEqual(prevision(fila({ estado: 'INACTIVO', dias_sin_actividad: 70 }), '2026-10-16'), { entraInactivoEl: null, entraSuspendidoEl: '2026-11-05' });
  for (const x of [{ estado: 'ACTIVO_PAGO' as const }, { es_demo: true }, { estado: 'SUSPENDIDO' as const }, { estado: 'PAGO_PENDIENTE' as const }]) {
    assert.deepEqual(prevision(fila(x), '2026-10-16'), { entraInactivoEl: null, entraSuspendidoEl: null }, JSON.stringify(x));
  }
  const e = estudioDesdeBd(fila({ avisos: null }), 'Estudio', '2026-10-16');
  assert.deepEqual(e.avisos, []);
  assert.equal(e.nombre, 'Estudio');
});

test('?hoy=: solo un día que existe, como mucho dos años alrededor de hoy', () => {
  const hoy = '2026-10-16';
  assert.equal(hoyPedido(null, hoy), hoy);
  assert.equal(hoyPedido('2026-12-01', hoy), '2026-12-01');
  assert.equal(hoyPedido('2026-02-31', hoy), hoy);
  assert.equal(hoyPedido('2026-13-01', hoy), hoy);
  assert.equal(hoyPedido('mañana', hoy), hoy);
  assert.equal(hoyPedido('2099-01-01', hoy), hoy);
  assert.equal(hoyPedido("2026-10-01'; drop", hoy), hoy);
});

test('plan gratis en seco: el registro del día en pantalla, con los estudios por su nombre, y su recuento', () => {
  const hoy = '2026-10-16';
  const gratis = (s: string) => ({ estado: 'GRATIS' as const, motivo: null, esDemo: s === 'demo' });
  const informe = informeGratis({
    studioId: 'b', estadoSuscripcion: 'gratis', hoy, medidoEn: `${hoy}T10:00:00Z`, grupoDeHoy: ['b', 'demo'],
    usos: new Map([['b', { alumnasActivas: 100, reservas30Dias: 10 }], ['demo', { alumnasActivas: 60, reservas30Dias: 0 }]]),
    guardado: [], miembros: new Map([['b', gratis('b')], ['demo', gratis('demo')]]),
  });
  const nombres = new Map([['b', 'Estudio B'], ['demo', 'Estudio demo']]);
  const g = gratisParaPantalla(JSON.parse(JSON.stringify(informe)), nombres)!;
  assert.deepEqual(g.actual?.grupo, ['Estudio B', 'Estudio demo']);
  assert.equal(g.actual?.fase, 'MARGEN');
  assert.deepEqual(g.propuesta?.fuera, [{ nombre: 'Estudio demo', motivo: 'demo' }]);
  assert.equal(g.propuesta?.fase, 'DENTRO');
  assert.deepEqual(g.avisos.sort(), ['gratis_lo_mediria_el_barrido', 'grupo_dueña_difiere'].sort());
  assert.equal(gratisParaPantalla(null, nombres), null);
  assert.equal(gratisParaPantalla({ version: 99 }, nombres), null);

  // En la fila del estudio, sus avisos se suman a los del cálculo de hoy, sin repetir.
  const e = estudioDesdeBd(fila({ avisos: ['gratis_sin_medir'] }), 'Estudio B', hoy, g);
  assert.deepEqual(e.avisos.sort(), ['gratis_lo_mediria_el_barrido', 'gratis_sin_medir', 'grupo_dueña_difiere'].sort());
  assert.deepEqual(resumenGratis([e, estudioDesdeBd(fila({}), 'Otro', hoy)]), {
    medidos: 1, coinciden: 0, loMediriaElBarrido: 1, difierenDelGate: 0, enMargen: 1, seCerrarian: 0, ambiguos: 0, gruposDistintos: 1,
  });
  for (const c of CODIGOS_AVISO_GRATIS) assert.equal(textoAviso(c), TEXTO_AVISO_GRATIS[c]);
});
