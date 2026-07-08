// Tests de la lógica de negocio de reservas/aforo/referidos.
// Runner nativo de Node (sin dependencias): `npm test` (Node >= 22.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Reserva, RewardAction, Socio } from '@/lib/types';
import {
  plazasOcupadas,
  decidirReservaNueva,
  siguienteEnEspera,
  esPrimeraAsistencia,
  contarReferidosPremiadosMes,
  decidirPremioReferido,
} from './booking-logic.ts';

// ── Fixtures ─────────────────────────────────────────────────────────────────
let n = 0;
function res(p: Partial<Reserva> & Pick<Reserva, 'sesionId' | 'socioId' | 'estado'>): Reserva {
  return {
    id: `res-${++n}`,
    studioId: 'estudio-1',
    spotId: null,
    posicionEspera: null,
    checkInEn: null,
    creadoEn: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}
function socia(p: Partial<Socio> & Pick<Socio, 'id'>): Socio {
  return {
    studioId: 'estudio-1', nombre: 'A', apellidos: 'B', email: 'a@b.c',
    telefono: null, nif: null, fechaAlta: '2026-01-01', activo: true, ...p,
  };
}
function action(referidorId: string, creadoEn: string): RewardAction {
  return { id: `rwa-${++n}`, studioId: 'estudio-1', socioId: referidorId, trigger: 'REFERIDO_AMIGO', refId: 'x', creadoEn };
}

// ── plazasOcupadas ───────────────────────────────────────────────────────────
test('plazasOcupadas cuenta CONFIRMADA y ASISTIDA, no LISTA_ESPERA ni CANCELADA', () => {
  const rs: Reserva[] = [
    res({ sesionId: 's1', socioId: 'a', estado: 'CONFIRMADA' }),
    res({ sesionId: 's1', socioId: 'b', estado: 'ASISTIDA' }),
    res({ sesionId: 's1', socioId: 'c', estado: 'LISTA_ESPERA' }),
    res({ sesionId: 's1', socioId: 'd', estado: 'CANCELADA' }),
    res({ sesionId: 's2', socioId: 'e', estado: 'CONFIRMADA' }),
  ];
  assert.equal(plazasOcupadas('s1', rs), 2);
  assert.equal(plazasOcupadas('s2', rs), 1);
  assert.equal(plazasOcupadas('sX', rs), 0);
});

// ── decidirReservaNueva ──────────────────────────────────────────────────────
test('sesión vacía → CONFIRMADA sin posición', () => {
  assert.deepEqual(decidirReservaNueva(10, 's1', []), { estado: 'CONFIRMADA', posicionEspera: null });
});

test('sesión llena → LISTA_ESPERA con posición 1, y la lista NO ocupa aforo', () => {
  const llena: Reserva[] = [
    res({ sesionId: 's1', socioId: 'a', estado: 'CONFIRMADA' }),
    res({ sesionId: 's1', socioId: 'b', estado: 'CONFIRMADA' }),
  ];
  const d1 = decidirReservaNueva(2, 's1', llena);
  assert.deepEqual(d1, { estado: 'LISTA_ESPERA', posicionEspera: 1 });

  // Un segundo en espera → posición 2 (la lista de espera no cuenta como plaza).
  const conEspera = [...llena, res({ sesionId: 's1', socioId: 'c', estado: 'LISTA_ESPERA', posicionEspera: 1 })];
  assert.deepEqual(decidirReservaNueva(2, 's1', conEspera), { estado: 'LISTA_ESPERA', posicionEspera: 2 });
});

test('sin aforo definido → siempre CONFIRMADA', () => {
  const rs = [res({ sesionId: 's1', socioId: 'a', estado: 'CONFIRMADA' })];
  assert.equal(decidirReservaNueva(undefined, 's1', rs).estado, 'CONFIRMADA');
  assert.equal(decidirReservaNueva(null, 's1', rs).estado, 'CONFIRMADA');
});

// ── siguienteEnEspera ────────────────────────────────────────────────────────
test('siguienteEnEspera elige la menor posición; null si no hay nadie', () => {
  const rs: Reserva[] = [
    res({ sesionId: 's1', socioId: 'a', estado: 'LISTA_ESPERA', posicionEspera: 2 }),
    res({ sesionId: 's1', socioId: 'b', estado: 'LISTA_ESPERA', posicionEspera: 1 }),
    res({ sesionId: 's2', socioId: 'c', estado: 'LISTA_ESPERA', posicionEspera: 1 }),
  ];
  assert.equal(siguienteEnEspera('s1', rs)?.socioId, 'b');
  assert.equal(siguienteEnEspera('sX', rs), null);
});

// ── esPrimeraAsistencia ──────────────────────────────────────────────────────
test('esPrimeraAsistencia: true con exactamente 1 ASISTIDA, false con 0 o 2', () => {
  assert.equal(esPrimeraAsistencia('a', [res({ sesionId: 's1', socioId: 'a', estado: 'ASISTIDA' })]), true);
  assert.equal(esPrimeraAsistencia('a', []), false);
  assert.equal(esPrimeraAsistencia('a', [
    res({ sesionId: 's1', socioId: 'a', estado: 'ASISTIDA' }),
    res({ sesionId: 's2', socioId: 'a', estado: 'ASISTIDA' }),
  ]), false);
});

// ── contarReferidosPremiadosMes ──────────────────────────────────────────────
test('contarReferidosPremiadosMes: solo mismo referidor, mismo mes y trigger REFERIDO_AMIGO', () => {
  const ahora = new Date('2026-03-15T00:00:00.000Z');
  const acciones: RewardAction[] = [
    action('ref1', '2026-03-01T00:00:00.000Z'),
    action('ref1', '2026-03-20T00:00:00.000Z'),
    action('ref1', '2026-02-28T00:00:00.000Z'), // otro mes
    action('ref2', '2026-03-10T00:00:00.000Z'), // otro referidor
    { id: 'z', studioId: 'estudio-1', socioId: 'ref1', trigger: 'ASISTENCIA_CLASE', refId: 'x', creadoEn: '2026-03-05T00:00:00.000Z' },
  ];
  assert.equal(contarReferidosPremiadosMes('ref1', acciones, ahora), 2);
});

// ── decidirPremioReferido ────────────────────────────────────────────────────
const ahora = new Date('2026-03-15T00:00:00.000Z');
const primeraAsistencia = [res({ sesionId: 's1', socioId: 'nueva', estado: 'ASISTIDA' })];

test('no premia si la socia no fue referida', () => {
  const r = decidirPremioReferido({
    socia: socia({ id: 'nueva' }), reservasTrasCheckin: primeraAsistencia,
    rewardActions: [], topeMensual: null, ahora,
  });
  assert.deepEqual(r, { premiar: false, referidorId: null });
});

test('no premia si no es la primera asistencia', () => {
  const dos = [
    res({ sesionId: 's1', socioId: 'nueva', estado: 'ASISTIDA' }),
    res({ sesionId: 's2', socioId: 'nueva', estado: 'ASISTIDA' }),
  ];
  const r = decidirPremioReferido({
    socia: socia({ id: 'nueva', referidoPor: 'ref1' }), reservasTrasCheckin: dos,
    rewardActions: [], topeMensual: 5, ahora,
  });
  assert.equal(r.premiar, false);
});

test('premia en la primera asistencia si hay referidor y no hay tope', () => {
  const r = decidirPremioReferido({
    socia: socia({ id: 'nueva', referidoPor: 'ref1' }), reservasTrasCheckin: primeraAsistencia,
    rewardActions: [], topeMensual: null, ahora,
  });
  assert.deepEqual(r, { premiar: true, referidorId: 'ref1' });
});

test('respeta el tope mensual: premia por debajo, no premia al alcanzarlo', () => {
  const unoEsteMes = [action('ref1', '2026-03-02T00:00:00.000Z')];
  // tope 2, ya lleva 1 este mes → premia
  assert.equal(decidirPremioReferido({
    socia: socia({ id: 'nueva', referidoPor: 'ref1' }), reservasTrasCheckin: primeraAsistencia,
    rewardActions: unoEsteMes, topeMensual: 2, ahora,
  }).premiar, true);
  // tope 1, ya lleva 1 este mes → NO premia
  assert.equal(decidirPremioReferido({
    socia: socia({ id: 'nueva', referidoPor: 'ref1' }), reservasTrasCheckin: primeraAsistencia,
    rewardActions: unoEsteMes, topeMensual: 1, ahora,
  }).premiar, false);
});
