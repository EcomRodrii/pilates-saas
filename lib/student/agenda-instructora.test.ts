import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPorDia, bajasEnCurso, clasesLocalesDesdeAgenda, estadoBajaVista, fechaEnZona, horaEnZona,
  proximaQueDa, puedePedirBaja, rangoAgendaValido, textoBaja, unirAgenda,
  type ClaseQueDa, type ClaseQueReserva,
} from './agenda-instructora.ts';

function da(id: string, inicio: string, extra: Partial<ClaseQueDa> = {}): ClaseQueDa {
  const fin = new Date(Date.parse(inicio) + 55 * 60_000).toISOString();
  return {
    id, inicio, fin, fecha: fechaEnZona(inicio), hora: horaEnZona(inicio), horaFin: horaEnZona(fin),
    tipo: 'Reformer', color: null, sala: 'Sala 1', aforo: 8, confirmadas: 3, enEspera: 0,
    cancelada: false, baja: null, ...extra,
  };
}

function viene(claseId: string, inicio: string): ClaseQueReserva {
  return {
    reservaId: `res-${claseId}`, claseId, inicio, fecha: fechaEnZona(inicio), hora: horaEnZona(inicio),
    tipo: 'Mat', sala: 'Sala 2', enEspera: false,
  };
}

test('la fecha y la hora salen en la zona del estudio, no en UTC', () => {
  // 22:30 UTC del 14-sep es 00:30 del 15-sep en Madrid (horario de verano).
  assert.equal(fechaEnZona('2026-09-14T22:30:00Z'), '2026-09-15');
  assert.equal(horaEnZona('2026-09-14T22:30:00Z'), '00:30');
  assert.equal(horaEnZona('2026-09-15T08:00:00+00:00'), '10:00');
});

test('pendiente de aprobación y «buscando» NO prometen que se está buscando', () => {
  assert.equal(estadoBajaVista('pendiente_aprobacion'), 'revisando');
  assert.equal(estadoBajaVista('buscando'), 'revisando');
  assert.equal(estadoBajaVista('contactando'), 'buscando');
  assert.equal(estadoBajaVista('confirmada'), 'cubierta');
  assert.equal(estadoBajaVista('agotada'), 'sin-cubrir');
  assert.equal(estadoBajaVista('sin_sustituta'), 'sin-cubrir');
  assert.equal(estadoBajaVista('resuelta_fuera'), 'resuelta');
  assert.equal(estadoBajaVista('cancelada'), 'resuelta');
  // Un estado nuevo que no conocemos no puede prometer nada.
  assert.equal(estadoBajaVista('estado_inventado'), 'revisando');
});

test('mientras no esté cubierta, el texto dice que la clase sigue a su nombre', () => {
  for (const e of ['revisando', 'buscando', 'sin-cubrir'] as const) {
    assert.match(textoBaja(e).detalle, /sigue a tu nombre/);
  }
  assert.equal(textoBaja('cubierta', 'Aina').titulo, 'La cubre Aina');
  assert.equal(textoBaja('cubierta', null).titulo, 'Ya hay quien la cubra');
  assert.match(textoBaja('sin-cubrir').detalle, /Lo decide el estudio/);
});

test('agenda única: mezcla lo que da y lo que reserva, ordenado por instante aunque cambie el formato', () => {
  const filas = unirAgenda(
    [da('s-10', '2026-09-15T10:00:00+00:00'), da('s-8', '2026-09-15T08:00:00+00:00')],
    [viene('s-9', '2026-09-15T09:00:00Z')],
  );
  assert.deepEqual(filas.map((f) => `${f.tipo}:${'id' in f.clase ? f.clase.id : f.clase.claseId}`), ['da:s-8', 'viene:s-9', 'da:s-10']);
});

test('si reservó una clase que además imparte, manda la fila de «da clase»', () => {
  const filas = unirAgenda([da('s-1', '2026-09-15T10:00:00Z')], [viene('s-1', '2026-09-15T10:00:00Z')]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].tipo, 'da');
});

test('agrupar por día conserva el orden y usa el día del estudio', () => {
  const grupos = agruparPorDia(unirAgenda(
    [da('a', '2026-09-14T21:30:00Z'), da('b', '2026-09-14T22:30:00Z'), da('c', '2026-09-15T08:00:00Z')],
    [],
  ));
  assert.deepEqual(grupos.map((g) => [g.fecha, g.filas.length]), [['2026-09-14', 1], ['2026-09-15', 2]]);
});

test('la próxima clase es la que no ha terminado, incluida la que se está dando, y nunca una cancelada', () => {
  const ahora = Date.parse('2026-09-15T10:20:00Z');
  const clases = [
    da('terminada', '2026-09-15T08:00:00Z'),
    da('cancelada', '2026-09-15T10:30:00Z', { cancelada: true }),
    da('en-curso', '2026-09-15T10:00:00Z'),
    da('luego', '2026-09-15T12:00:00Z'),
  ];
  assert.equal(proximaQueDa(clases, ahora)?.id, 'en-curso');
  assert.equal(proximaQueDa([], ahora), null);
});

test('las bajas en curso excluyen solo las que el estudio ya resolvió', () => {
  const base = { sesionId: 's', sustituta: null };
  const b = bajasEnCurso([
    { ...base, sustitucionId: '1', estado: 'revisando' as const },
    { ...base, sustitucionId: '2', estado: 'resuelta' as const },
    { ...base, sustitucionId: '3', estado: 'cubierta' as const },
  ]);
  assert.deepEqual(b.map((x) => x.sustitucionId), ['1', '3']);
});

test('pedir la baja: nunca de una clase empezada, cancelada o con una baja abierta', () => {
  const ahora = Date.parse('2026-09-15T10:00:00Z');
  const baja = (estado: 'revisando' | 'buscando' | 'cubierta' | 'sin-cubrir' | 'resuelta') =>
    ({ sustitucionId: 'x', sesionId: 's', estado, sustituta: null });
  assert.equal(puedePedirBaja(da('f', '2026-09-16T10:00:00Z'), ahora), true);
  assert.equal(puedePedirBaja(da('empezada', '2026-09-15T09:30:00Z'), ahora), false);
  assert.equal(puedePedirBaja(da('justo-ahora', '2026-09-15T10:00:00Z'), ahora), false);
  assert.equal(puedePedirBaja(da('c', '2026-09-16T10:00:00Z', { cancelada: true }), ahora), false);
  for (const e of ['revisando', 'buscando', 'cubierta', 'sin-cubrir'] as const) {
    assert.equal(puedePedirBaja(da('b', '2026-09-16T10:00:00Z', { baja: baja(e) }), ahora), false, e);
  }
  // Si el estudio la resolvió (p. ej. la canceló y la volvió a abrir), puede volver a pedirla.
  assert.equal(puedePedirBaja(da('r', '2026-09-16T10:00:00Z', { baja: baja('resuelta') }), ahora), true);
});

test('«Rellenar con mis clases» usa el día del ESTUDIO, no el de UTC, y salta las canceladas', () => {
  const locales = clasesLocalesDesdeAgenda([
    // 00:30 del martes 15 en Madrid = lunes 14 22:30 UTC.
    da('madrugada', '2026-09-14T22:30:00Z'),
    da('tarde', '2026-09-15T16:00:00Z'),
    da('cancelada', '2026-09-15T08:00:00Z', { cancelada: true }),
  ]);
  assert.deepEqual(locales, [
    { dow: 2, inicioMin: 30, finMin: 85 },
    { dow: 2, inicioMin: 18 * 60, finMin: 18 * 60 + 55 },
  ]);
});

test('el rango de la agenda exige fechas reales, en orden y de como mucho 31 días', () => {
  assert.equal(rangoAgendaValido('2026-09-14', '2026-09-20'), true);
  assert.equal(rangoAgendaValido('2026-09-14', '2026-10-15'), true);
  assert.equal(rangoAgendaValido('2026-09-14', '2026-10-16'), false);
  assert.equal(rangoAgendaValido('2026-09-20', '2026-09-14'), false);
  assert.equal(rangoAgendaValido('14/09/2026', '2026-09-20'), false);
  assert.equal(rangoAgendaValido(undefined, '2026-09-20'), false);
  assert.equal(rangoAgendaValido('2026-09-14', 20260920), false);
});
