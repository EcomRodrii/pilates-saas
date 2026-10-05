import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claseDelMomento, etiquetaMomento, haceCuanto } from './momento-inicio.ts';
import type { Clase, Reserva } from './tipos.ts';

// 2026-10-07 es MARTES. Madrid va en UTC+2 (horario de verano): las 18:30 de
// Madrid son las 16:30Z.
const HOY = '2026-10-07';
const ms = (iso: string) => new Date(iso).getTime();

function clase(id: string, fecha: string, hora: string, inicio: string, fin: string): Clase {
  return {
    id, tipoClaseId: 't', ventanaCancelacionHoras: null, permiteListaEspera: null,
    fecha, hora, duracionMin: 50, inicio, fin, nombre: 'Reformer ' + id, tipo: 'Reformer',
    disciplina: 'reformer', nivel: 'todos', instructoraId: 'i1', color: '#000', sala: 'Sala grande',
    salaId: 's1', capacidad: 8, plazasLibres: 3, precioSuelto: 15, fotoUrl: '',
  } as unknown as Clase;
}
const reserva = (id: string, claseId: string, estado: Reserva['estado'] = 'confirmada'): Reserva =>
  ({ id, claseId, alumnaId: 'a', estado, creadaEn: '2026-10-01T10:00:00Z' });

const hoy1830 = clase('c-hoy', HOY, '18:30', '2026-10-07T16:30:00Z', '2026-10-07T17:20:00Z');
const manana0900 = clase('c-man', '2026-10-08', '09:00', '2026-10-08T07:00:00Z', '2026-10-08T07:50:00Z');
const pasado = clase('c-pas', '2026-10-09', '09:00', '2026-10-09T07:00:00Z', '2026-10-09T07:50:00Z');
const estaManana = clase('c-ma', HOY, '09:00', '2026-10-07T07:00:00Z', '2026-10-07T07:50:00Z');

test('claseDelMomento: con una clase hoy, es esa y es «hoy»', () => {
  const m = claseDelMomento([reserva('r1', 'c-hoy')], [hoy1830], HOY, ms('2026-10-07T14:20:00Z'));
  assert.equal(m?.clase.id, 'c-hoy');
  assert.equal(m?.cuando, 'hoy');
});

test('claseDelMomento: con la primera mañana, es «manana»', () => {
  const m = claseDelMomento([reserva('r1', 'c-man')], [manana0900], HOY, ms('2026-10-07T14:20:00Z'));
  assert.equal(m?.cuando, 'manana');
});

test('claseDelMomento: pasado mañana NO cuenta — Inicio queda como siempre', () => {
  assert.equal(claseDelMomento([reserva('r1', 'c-pas')], [pasado], HOY, ms('2026-10-07T14:20:00Z')), null);
});

test('claseDelMomento: va la MÁS CERCANA, no la primera del array', () => {
  const m = claseDelMomento(
    [reserva('r2', 'c-man'), reserva('r1', 'c-hoy')], [manana0900, hoy1830], HOY, ms('2026-10-07T14:20:00Z'),
  );
  assert.equal(m?.clase.id, 'c-hoy');
});

test('claseDelMomento: una clase de esta mañana ya TERMINADA no manda; pasa a la de mañana', () => {
  const m = claseDelMomento(
    [reserva('r1', 'c-ma'), reserva('r2', 'c-man')], [estaManana, manana0900], HOY, ms('2026-10-07T14:20:00Z'),
  );
  assert.equal(m?.clase.id, 'c-man');
});

test('claseDelMomento: la que se está DANDO es «ahora»', () => {
  const m = claseDelMomento([reserva('r1', 'c-hoy')], [hoy1830], HOY, ms('2026-10-07T16:45:00Z'));
  assert.equal(m?.cuando, 'ahora');
});

test('claseDelMomento: cancelada o en lista de espera no cuentan', () => {
  assert.equal(claseDelMomento([reserva('r1', 'c-hoy', 'cancelada')], [hoy1830], HOY, ms('2026-10-07T14:00:00Z')), null);
  assert.equal(claseDelMomento([reserva('r1', 'c-hoy', 'en-espera')], [hoy1830], HOY, ms('2026-10-07T14:00:00Z')), null);
});

test('claseDelMomento: sin reloj todavía (antes de hidratar) no descarta la de hoy', () => {
  const m = claseDelMomento([reserva('r1', 'c-ma')], [estaManana], HOY, null);
  assert.equal(m?.cuando, 'hoy');
});

test('etiquetaMomento: horas y minutos hasta la clase, redondeado hacia arriba', () => {
  const m = { clase: hoy1830, cuando: 'hoy' as const };
  assert.equal(etiquetaMomento(m, ms('2026-10-07T14:20:00Z')), 'Hoy · en 2 h 10 min');
  assert.equal(etiquetaMomento(m, ms('2026-10-07T14:30:00Z')), 'Hoy · en 2 h');
  assert.equal(etiquetaMomento(m, ms('2026-10-07T16:05:00Z')), 'Hoy · en 25 min');
  // A 40 segundos no dice «en 0 min».
  assert.equal(etiquetaMomento(m, ms('2026-10-07T16:29:20Z')), 'Hoy · en 1 min');
  assert.equal(etiquetaMomento(m, null), 'Hoy');
});

test('etiquetaMomento: mañana y en curso', () => {
  assert.equal(etiquetaMomento({ clase: manana0900, cuando: 'manana' }, ms('2026-10-07T14:20:00Z')), 'Mañana');
  assert.equal(etiquetaMomento({ clase: hoy1830, cuando: 'ahora' }, ms('2026-10-07T16:45:00Z')), 'Ahora · hasta las 19:20');
});

test('haceCuanto', () => {
  assert.equal(haceCuanto('2026-10-07T07:50:00Z', ms('2026-10-07T08:10:00Z')), 'Hace 20 min');
  assert.equal(haceCuanto('2026-10-07T07:50:00Z', ms('2026-10-07T10:50:00Z')), 'Hace 3 h');
});
