import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODIGOS_CLASIFICADOS, MAX_PROXIMAS, clasificarCodigo, idReservaDeIntento, normalizarIntento, normalizarN, opcionesDeN,
  ocurrenciasDeLaFranja, resumirLote, type SesionDeLaFranja,
} from './proximas-reglas.ts';

// 2026-10-07 es miércoles. Madrid en octubre = UTC+2: 10:00 → 08:00Z.
const ses = (id: string, inicio: string, o: Partial<SesionDeLaFranja> = {}): SesionDeLaFranja =>
  ({ id, inicio, salaId: 'sala-1', tipoClaseId: 'tc-1', cancelada: false, ...o });
const AHORA = new Date('2026-10-01T10:00:00Z').getTime();

test('normalizarN: entero de 2 a 12, y nada más (el cliente no manda el saldo)', () => {
  for (const ok of [2, 4, 8, 12]) assert.equal(normalizarN(ok), ok);
  for (const mal of [1, 0, -2, 13, 99, 2.5, NaN, '4', null, undefined, [4], {}]) assert.equal(normalizarN(mal), null, String(mal));
  assert.equal(MAX_PROXIMAS, 12);
});

test('ocurrenciasDeLaFranja: las N próximas del mismo horario, empezando por la de la ficha', () => {
  const base = ses('a', '2026-10-07T08:00:00Z');
  const resto = [
    ses('b', '2026-10-14T08:00:00Z'), ses('c', '2026-10-21T08:00:00Z'), ses('d', '2026-10-28T09:00:00Z'),
    ses('otra-hora', '2026-10-14T09:00:00Z'), ses('otra-sala', '2026-10-14T08:00:00Z', { salaId: 'sala-2' }),
    ses('otro-tipo', '2026-10-21T08:00:00Z', { tipoClaseId: 'tc-2' }), ses('otro-dia', '2026-10-15T08:00:00Z'),
    ses('cancelada', '2026-10-14T08:00:00Z', { cancelada: true }),
  ];
  assert.deepEqual(ocurrenciasDeLaFranja(base, resto, 3, AHORA).map(s => s.id), ['a', 'b', 'c']);
  assert.deepEqual(ocurrenciasDeLaFranja(base, resto, 12, AHORA).map(s => s.id), ['a', 'b', 'c', 'd'], 'no inventa las que no hay');
});

test('ocurrenciasDeLaFranja: una semana sin clase (cancelada, o pasada) no cuenta como una de las N', () => {
  const base = ses('a', '2026-10-07T08:00:00Z');
  const resto = [ses('b', '2026-10-14T08:00:00Z', { cancelada: true }), ses('c', '2026-10-21T08:00:00Z'), ses('d', '2026-10-28T09:00:00Z'), ses('pasada', '2026-09-30T08:00:00Z')];
  assert.deepEqual(ocurrenciasDeLaFranja(base, resto, 3, AHORA).map(s => s.id), ['a', 'c', 'd']);
});

test('ocurrenciasDeLaFranja: la hora es la del estudio (cruza el cambio de hora sin partir la franja)', () => {
  // El cambio de hora de Madrid es el 25-oct-2026: 10:00 pasa de 08:00Z a 09:00Z y SIGUE siendo la misma franja.
  const base = ses('a', '2026-10-21T08:00:00Z');
  const resto = [ses('b', '2026-10-28T09:00:00Z'), ses('c', '2026-11-04T09:00:00Z')];
  assert.deepEqual(ocurrenciasDeLaFranja(base, resto, 3, AHORA).map(s => s.id), ['a', 'b', 'c']);
});

test('clasificarCodigo: cada rechazo se omite o para el lote, y un código desconocido PARA (nunca se sigue a ciegas)', () => {
  assert.deepEqual(clasificarCodigo('aforo-lleno'), { resultado: 'COMPLETA', parar: false });
  assert.deepEqual(clasificarCodigo('ya-reservada'), { resultado: 'YA_RESERVADA', parar: false });
  assert.deepEqual(clasificarCodigo('conflicto-horario'), { resultado: 'CONFLICTO', parar: false });
  // Sin derecho: se para. Seguir sería intentar reservar sin bono.
  for (const c of ['sin-plan', 'bono-no-cubre', 'impago', 'necesita-autorizacion', 'apertura-suave', 'faltan-preguntas']) {
    assert.deepEqual(clasificarCodigo(c), { resultado: 'SIN_DERECHO', parar: true }, c);
  }
  assert.equal(clasificarCodigo('fuera-ventana-minima').parar, false);
  assert.equal(clasificarCodigo('fuera-ventana-maxima').parar, true, 'las siguientes están aún más lejos');
  assert.equal(clasificarCodigo('max-simultaneas').parar, true);
  for (const raro of ['algo-nuevo', '', null, undefined]) assert.deepEqual(clasificarCodigo(raro), { resultado: 'ERROR', parar: true });
});

test('⚠️ la tabla cubre TODOS los códigos de reserva: uno nuevo sin fila rompe esto', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const fuente = readFileSync(join(import.meta.dirname, '..', 'student', 'reserva-codigos.ts'), 'utf8');
  const tipo = fuente.slice(fuente.indexOf('export type CodigoReserva'), fuente.indexOf('/**', fuente.indexOf('export type CodigoReserva')));
  const declarados = [...tipo.matchAll(/\|\s*'([a-z-]+)'/g)].map(m => m[1]);
  assert.ok(declarados.length >= 20, `se esperaban los códigos de reserva, salieron ${declarados.length}`);
  assert.deepEqual([...CODIGOS_CLASIFICADOS].sort(), [...new Set(declarados)].sort());
});

test('el intento: la clave es el INTENTO, y el id de reserva nunca es de plaza fija', () => {
  const intento = 'abcdef0123456789ABCD';
  assert.equal(normalizarIntento(intento), intento);
  for (const mal of ['corto', 'a'.repeat(65), 'con espacios 1234567890', 'pf-0123456789abcdef', 'PF_0123456789abcdef', '', null, undefined, 123]) {
    assert.equal(normalizarIntento(mal), null, String(mal));
  }
  // Al derecho: mismo intento + misma posición = mismo id (un reintento no duplica).
  assert.equal(idReservaDeIntento(intento, 0), idReservaDeIntento(intento, 0));
  // Y al revés: otro intento, o otra posición, es otra reserva.
  assert.notEqual(idReservaDeIntento(intento, 0), idReservaDeIntento(intento, 1));
  assert.notEqual(idReservaDeIntento(intento, 0), idReservaDeIntento('zzzzzz0123456789ABCD', 0));
  for (let i = 0; i < MAX_PROXIMAS; i++) {
    const id = idReservaDeIntento(intento, i);
    assert.match(id, /^res-[A-Za-z0-9_-]{1,96}$/);
    assert.ok(!id.startsWith('res-pf-'), 'nunca el prefijo de las plazas fijas');
  }
});

test('resumirLote: cuántas quedan reservadas y cuántas descuentan una sesión del bono', () => {
  assert.deepEqual(resumirLote([
    { resultado: 'SE_RESERVARA', pagador: 'bono' }, { resultado: 'RESERVADA', pagador: 'bono' }, { resultado: 'RESERVADA', pagador: 'cuota' },
    { resultado: 'COMPLETA' }, { resultado: 'SIN_DERECHO' }, { resultado: 'NO_INTENTADA' },
  ]), { reservadas: 3, descontadas: 2 });
  assert.deepEqual(resumirLote([]), { reservadas: 0, descontadas: 0 });
});

test('opcionesDeN: 2, 4, 8 y «todas las que me quedan», sin pasar del saldo ni del tope; con menos de 2 no hay opción', () => {
  assert.deepEqual(opcionesDeN(0), []);
  assert.deepEqual(opcionesDeN(1), [], 'una sola clase es la reserva normal');
  assert.deepEqual(opcionesDeN(2), [2]);
  assert.deepEqual(opcionesDeN(3), [2, 3]);
  assert.deepEqual(opcionesDeN(5), [2, 4, 5]);
  assert.deepEqual(opcionesDeN(8), [2, 4, 8]);
  assert.deepEqual(opcionesDeN(10), [2, 4, 8, 10]);
  assert.deepEqual(opcionesDeN(50), [2, 4, 8, 12], 'nunca más de 12');
  assert.deepEqual(opcionesDeN(NaN), []);
});
