import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claseDelMomento, clasesConPlazaProximas, esRecienLlegada, etiquetaMomento, haceCuanto, tuRitmoTieneAlgoQueContar } from './momento-inicio.ts';
import type { Clase, HuellaSocia, Reserva } from './tipos.ts';

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
  assert.equal(etiquetaMomento({ clase: hoy1830, cuando: 'ahora' }, ms('2026-10-07T16:45:00Z')), 'Tu clase, en curso · hasta las 19:20');
});

test('haceCuanto', () => {
  assert.equal(haceCuanto('2026-10-07T07:50:00Z', ms('2026-10-07T08:10:00Z')), 'Hace 20 min');
  assert.equal(haceCuanto('2026-10-07T07:50:00Z', ms('2026-10-07T10:50:00Z')), 'Hace 3 h');
});

// ── La recién llegada (P03) ──────────────────────────────────────────────────

const nada: HuellaSocia = { reservasNoCanceladas: 0, suscripciones: 0, plazasFijas: 0, recuperaciones: 0, citas: 0, fechaAlta: '2026-10-01' };

test('esRecienLlegada: sin huella (no se sabe) NUNCA es recién llegada', () => {
  assert.equal(esRecienLlegada(null, HOY), false);
});

test('esRecienLlegada: todo a cero y alta de hace días → sí', () => {
  assert.equal(esRecienLlegada(nada, HOY), true);
  assert.equal(esRecienLlegada({ ...nada, fechaAlta: '2026-09-27T08:00:00Z' }, HOY), true);
});

test('esRecienLlegada: sin fecha de alta y todo a cero → sí', () => {
  assert.equal(esRecienLlegada({ ...nada, fechaAlta: null }, HOY), true);
});

test('esRecienLlegada: la importada con su fecha real (2019) → no, aunque no traiga nada más', () => {
  assert.equal(esRecienLlegada({ ...nada, fechaAlta: '2019-03-04' }, HOY), false);
});

test('esRecienLlegada: el borde de los 60 días cuenta; el día 61, no', () => {
  assert.equal(esRecienLlegada({ ...nada, fechaAlta: '2026-08-08' }, HOY), true);
  assert.equal(esRecienLlegada({ ...nada, fechaAlta: '2026-08-07' }, HOY), false);
});

test('esRecienLlegada: cualquier contador por encima de cero → no', () => {
  for (const campo of ['reservasNoCanceladas', 'suscripciones', 'plazasFijas', 'recuperaciones', 'citas'] as const) {
    assert.equal(esRecienLlegada({ ...nada, [campo]: 1 }, HOY), false, campo);
  }
});

function libre(id: string, fecha: string, hora: string, extra: Partial<Clase> = {}): Clase {
  const inicio = `${fecha}T${hora}:00+02:00`;
  const fin = new Date(new Date(inicio).getTime() + 50 * 60_000).toISOString();
  return { ...clase(id, fecha, hora, new Date(inicio).toISOString(), fin), ...extra } as Clase;
}
const A_LAS_1620 = ms('2026-10-07T14:20:00Z');

test('clasesConPlazaProximas: cuenta las de los próximos 7 días con plaza y descarta lo que no se puede reservar', () => {
  const clases = [
    libre('ok-hoy', HOY, '18:30'),
    libre('ok-dia7', '2026-10-13', '09:00'),
    libre('dia8', '2026-10-14', '09:00'),
    libre('llena', '2026-10-09', '09:00', { plazasLibres: 0 }),
    libre('suya', '2026-10-09', '10:00'),
    libre('empezada', HOY, '16:00'),
    libre('terminada', HOY, '09:00'),
    libre('sin-abrir', '2026-10-12', '09:00', { seAbreEl: '2026-10-10T08:00:00Z' }),
    libre('cerrada', HOY, '16:30', { cierraEl: '2026-10-07T14:00:00Z' }),
    libre('ayer', '2026-10-06', '18:00'),
  ];
  const r = clasesConPlazaProximas(clases, [reserva('r1', 'suya')], HOY, A_LAS_1620);
  assert.equal(r.total, 2);
  assert.equal(r.soloConBono, false);
});

test('clasesConPlazaProximas: una reserva CANCELADA no la quita de la cuenta; una en espera sí', () => {
  const clases = [libre('a', '2026-10-09', '09:00'), libre('b', '2026-10-09', '10:00')];
  assert.equal(clasesConPlazaProximas(clases, [reserva('r1', 'a', 'cancelada')], HOY, A_LAS_1620).total, 2);
  assert.equal(clasesConPlazaProximas(clases, [reserva('r1', 'a', 'en-espera')], HOY, A_LAS_1620).total, 1);
});

test('clasesConPlazaProximas: sin reloj no descarta las de hoy por la hora', () => {
  const clases = [libre('empezada', HOY, '16:00'), libre('terminada', HOY, '09:00')];
  assert.equal(clasesConPlazaProximas(clases, [], HOY, null).total, 2);
});

test('clasesConPlazaProximas: «solo con bono» solo si TODAS lo son', () => {
  const todas = [libre('a', '2026-10-09', '09:00', { sinPrecioSuelto: true }), libre('b', '2026-10-10', '09:00', { sinPrecioSuelto: true })];
  assert.equal(clasesConPlazaProximas(todas, [], HOY, A_LAS_1620).soloConBono, true);
  const mezcla = [...todas, libre('c', '2026-10-11', '09:00')];
  assert.equal(clasesConPlazaProximas(mezcla, [], HOY, A_LAS_1620).soloConBono, false);
  assert.equal(clasesConPlazaProximas([], [], HOY, A_LAS_1620).soloConBono, false);
});

test('tuRitmoTieneAlgoQueContar: una asistida o un bono activo; una no asistida sola, no', () => {
  assert.equal(tuRitmoTieneAlgoQueContar([reserva('r', 'x', 'asistida')], null), true);
  assert.equal(tuRitmoTieneAlgoQueContar([reserva('r', 'x', 'no-asistida')], null), false);
  assert.equal(tuRitmoTieneAlgoQueContar([], { id: 'cuota' }), true);
  assert.equal(tuRitmoTieneAlgoQueContar([], null), false);
});
