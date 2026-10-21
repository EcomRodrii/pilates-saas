import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tarjetaDelPlan, tocaEnsenarPlan } from './tu-plan.ts';
import type { EstadoGratisApi } from '../billing/plan-gratis.ts';
import { PLAN_INFO } from '../billing/entitlements.ts';
import { COMPLEMENTOS_CORTO, GRATIS_ALUMNAS, GRATIS_MARGEN_DIAS, GRATIS_RESERVAS_MES } from '../landing/founding-gratis.ts';

// «Tu plan, sin sorpresas» (PR-5, decisiones D2 y D10 del fundador).

const gratis = (o: Partial<EstadoGratisApi> = {}): EstadoGratisApi => ({
  fase: 'DENTRO', uso: { alumnasActivas: 2, reservas30Dias: 3 }, motivos: [], diasRestantes: 0, cierraEl: null,
  limites: { alumnas: GRATIS_ALUMNAS, reservasMes: GRATIS_RESERVAS_MES }, margenDias: GRATIS_MARGEN_DIAS, ...o,
});

test('con el uso REAL y los límites que aplica el servidor', () => {
  const t = tarjetaDelPlan({ gratis: gratis(), sedes: null })!;
  assert.equal(t.subtitulo, 'Founding Studio · gratis');
  assert.deepEqual(t.cifras, [
    { etiqueta: 'Alumnas activas', valor: 2, limite: 150 },
    // Lo que mide el servidor: las reservas de las clases de los últimos 30 días, no «este mes».
    { etiqueta: 'Reservas en los últimos 30 días', valor: 3, limite: 250 },
  ]);
});

test('si nombra Founding Studio de pago, dice lo que va aparte (D10)', () => {
  const { texto } = tarjetaDelPlan({ gratis: gratis(), sedes: { tipo: 'una' } })!;
  assert.match(texto, /^Mientras no pases de ahí, no pagas nada\./);
  assert.ok(texto.includes(`tienes ${GRATIS_MARGEN_DIAS} días para pasar a Founding Studio de pago: ${PLAN_INFO.BASE.precioMes} €/mes`), texto);
  assert.ok(texto.includes(`con ${COMPLEMENTOS_CORTO} aparte`), texto);
});

test('con «Varias» sedes, el plan que se enseña es Cadena', () => {
  const t = tarjetaDelPlan({ gratis: gratis(), sedes: { tipo: 'varias', total: 3 } })!;
  assert.equal(t.subtitulo, 'Founding Studio · gratis · 1 sede');
  assert.ok(t.texto.includes(`Para abrir tus otras 2 sedes en este panel: plan Cadena, ${PLAN_INFO.CADENA.precioMes} €/mes, una sola suscripción para toda la cadena.`), t.texto);
  assert.ok(tarjetaDelPlan({ gratis: gratis(), sedes: { tipo: 'varias', total: 2 } })!.texto.includes('Para abrir tu otra sede'));
});

test('sin Founding gratis de verdad, sin medir o pasado un límite, no se enseña', () => {
  assert.equal(tarjetaDelPlan({ gratis: null, sedes: null }), null, 'sin FOUNDING_GRATIS no hay `gratis`');
  assert.equal(tarjetaDelPlan({ gratis: undefined, sedes: null }), null);
  assert.equal(tarjetaDelPlan({ gratis: gratis({ fase: 'SIN_MEDIR', uso: null }), sedes: null }), null);
  // «Mientras no pases de ahí, no pagas nada» sería falso: ya pasó.
  assert.equal(tarjetaDelPlan({ gratis: gratis({ fase: 'MARGEN', motivos: ['alumnas'], diasRestantes: 20 }), sedes: null }), null);
  assert.equal(tarjetaDelPlan({ gratis: gratis({ fase: 'CERRADO' }), sedes: null }), null);
  // Cerca del límite sigue siendo verdad.
  assert.ok(tarjetaDelPlan({ gratis: gratis({ fase: 'CERCA', motivos: ['reservas'] }), sedes: null }));
});

test('una vez, tras la primera reserva, y solo sabiendo que no salió ya', () => {
  assert.equal(tocaEnsenarPlan({ primeraReserva: true, planEnsenado: false, descartadaAqui: false }), true);
  assert.equal(tocaEnsenarPlan({ primeraReserva: false, planEnsenado: false, descartadaAqui: false }), false);
  assert.equal(tocaEnsenarPlan({ primeraReserva: true, planEnsenado: true, descartadaAqui: false }), false);
  assert.equal(tocaEnsenarPlan({ primeraReserva: true, planEnsenado: null, descartadaAqui: false }), false, 'sin saberlo, no');
  assert.equal(tocaEnsenarPlan({ primeraReserva: true, planEnsenado: false, descartadaAqui: true }), false);
});
