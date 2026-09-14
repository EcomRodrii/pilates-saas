import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPorDia, bajasEnCurso, clasesLocalesDesdeAgenda, estadoBajaVista, estadoEnLista, fechaEnZona, horaEnZona,
  nombresParaLista, ordenarLista, proximaQueDa, puedePasarLista, puedePedirBaja, rangoAgendaValido, resumenLista,
  textoBaja, textoMotivoOferta, unirAgenda,
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

test('una baja resuelta con la revisión del estudio reciente se sigue viendo, para que no desaparezca lo que le dicen', () => {
  const ahora = Date.parse('2026-09-14T12:00:00Z');
  const base = { sesionId: 's', sustituta: null, estado: 'resuelta' as const };
  const bajas = [
    { ...base, sustitucionId: 'reciente', revision: { estado: 'LO_HABLAMOS' as const, nota: 'Llámame', revisadaEn: '2026-09-13T12:00:00Z' } },
    { ...base, sustitucionId: 'vieja', revision: { estado: 'EN_ORDEN' as const, nota: null, revisadaEn: '2026-09-01T12:00:00Z' } },
    { ...base, sustitucionId: 'pendiente', revision: { estado: 'PENDIENTE' as const, nota: null, revisadaEn: null } },
  ];
  assert.deepEqual(bajasEnCurso(bajas, ahora).map((x) => x.sustitucionId), ['reciente']);
  // Sin reloj todavía, no se da por reciente nada.
  assert.deepEqual(bajasEnCurso(bajas, null), []);
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

test('la lista se abre una hora antes, se cierra 12 h después de acabar y nunca en una cancelada', () => {
  const clase = { inicio: '2026-09-15T10:00:00Z', fin: '2026-09-15T10:55:00Z', cancelada: false };
  assert.equal(puedePasarLista(clase, Date.parse('2026-09-15T08:59:00Z')), false);
  assert.equal(puedePasarLista(clase, Date.parse('2026-09-15T09:00:00Z')), true);
  assert.equal(puedePasarLista(clase, Date.parse('2026-09-15T22:55:00Z')), true);
  assert.equal(puedePasarLista(clase, Date.parse('2026-09-15T22:56:00Z')), false);
  assert.equal(puedePasarLista({ ...clase, cancelada: true }, Date.parse('2026-09-15T10:10:00Z')), false);
});

test('en la lista solo está quien tiene plaza, y un «no vino» se enseña tal cual', () => {
  assert.equal(estadoEnLista('CONFIRMADA'), 'por-marcar');
  assert.equal(estadoEnLista('ASISTIDA'), 'asistio');
  assert.equal(estadoEnLista('NO_ASISTIO'), 'no-vino');
  for (const e of ['LISTA_ESPERA', 'CANCELADA', 'PENDIENTE_APROBACION', 'OTRO']) {
    assert.equal(estadoEnLista(e), null, e);
  }
});

test('nombres de la lista: nombre e inicial, y el apellido entero solo si dos coinciden', () => {
  assert.deepEqual(
    nombresParaLista([
      { nombre: 'Laura', apellidos: 'Martín Gil' },
      { nombre: 'laura', apellidos: 'Moreno' },
      { nombre: 'Aina', apellidos: 'puig' },
      { nombre: 'Carmen', apellidos: null },
      { nombre: '  ', apellidos: 'Soler' },
    ]),
    ['Laura Martín', 'laura Moreno', 'Aina P.', 'Carmen', 'S.'],
  );
});

test('la lista se ordena por nombre y cuenta quién ha venido', () => {
  const lista = ordenarLista([
    { reservaId: '1', nombre: 'Úrsula T.', estado: 'asistio' as const },
    { reservaId: '2', nombre: 'Aina P.', estado: 'por-marcar' as const },
    { reservaId: '3', nombre: 'Carmen', estado: 'no-vino' as const },
  ]);
  assert.deepEqual(lista.map((a) => a.reservaId), ['2', '3', '1']);
  assert.deepEqual(resumenLista(lista), { vinieron: 1, total: 3 });
});

test('cada motivo de una oferta tiene su explicación, y lo desconocido no la culpa de nada', () => {
  assert.match(textoMotivoOferta('ya_no_te_toca'), /otra persona/);
  assert.match(textoMotivoOferta('conflicto_horario'), /otra clase a esa hora/);
  assert.match(textoMotivoOferta('clase_ya_empezada'), /ya ha empezado/);
  assert.match(textoMotivoOferta(undefined), /cubierto antes/);
});
