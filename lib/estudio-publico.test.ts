import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tramosPorDia, horarioPublico, planMasElegido, precioPorClase } from './estudio-publico.ts';
import type { PlanTarifa, Sesion, Suscripcion } from './types';

// Una sesión mínima: solo importan inicio, fin y si está cancelada.
let n = 0;
function ses(fecha: string, desde: string, hasta: string, cancelada = false): Sesion {
  n += 1;
  return {
    id: `s${n}`, studioId: 'st', tipoClaseId: 'tc', salaId: 'sala', instructorId: 'ins',
    inicio: `${fecha}T${desde}:00`, fin: `${fecha}T${hasta}:00`,
    aforoMaximo: 10, cancelada, notas: null, precioPuntual: null,
  };
}

// 2026-07-27 es lunes.
const LUN = '2026-07-27', MAR = '2026-07-28', SAB = '2026-08-01', DOM = '2026-08-02';

test('el horario sale de la primera y la última clase de cada día', () => {
  const t = tramosPorDia([ses(LUN, '09:00', '10:00'), ses(LUN, '07:00', '08:00'), ses(LUN, '19:30', '20:30')]);
  const lunes = t.find(x => x.dia === 1)!;
  assert.equal(lunes.abre, '07:00');
  assert.equal(lunes.cierra, '20:30');
});

test('la semana empieza en lunes, no en domingo', () => {
  assert.deepEqual(tramosPorDia([]).map(t => t.dia), [1, 2, 3, 4, 5, 6, 0]);
});

test('una clase cancelada no ensancha el horario', () => {
  const t = tramosPorDia([ses(LUN, '09:00', '10:00'), ses(LUN, '06:00', '07:00', true)]);
  assert.equal(t.find(x => x.dia === 1)!.abre, '09:00');
});

// Es lo que hace que el bloque se lea como un horario y no como una tabla.
test('los días seguidos con el mismo horario se agrupan', () => {
  const sesiones = [LUN, MAR, '2026-07-29', '2026-07-30', '2026-07-31']
    .flatMap(d => [ses(d, '07:00', '08:00'), ses(d, '20:00', '21:00')]);
  const { franjas, confiable } = horarioPublico([...sesiones, ses(SAB, '09:00', '10:00'), ses(SAB, '13:00', '14:00')]);
  assert.equal(confiable, true, '6 días con clase ya son base suficiente para declarar el domingo cerrado');
  assert.deepEqual(franjas, [
    { dias: 'Lunes a viernes', horas: '07:00 – 21:00' },
    { dias: 'Sábado', horas: '09:00 – 14:00' },
    { dias: 'Domingo', horas: 'Cerrado' },
  ]);
});

// «Lunes a martes» suena a error de redacción; «Lunes y martes», no.
test('dos días seguidos se unen con «y», tres o más con «a»', () => {
  const { franjas: dos } = horarioPublico([ses(LUN, '09:00', '10:00'), ses(MAR, '09:00', '10:00')]);
  assert.equal(dos[0].dias, 'Lunes y martes');
});

test('sin clases no hay horario que enseñar', () => {
  assert.deepEqual(horarioPublico([]), { franjas: [], confiable: true });
  assert.deepEqual(horarioPublico([ses(DOM, '10:00', '11:00', true)]), { franjas: [], confiable: true });
});

// El hallazgo real: un estudio con una sola clase recurrente (viernes) en las
// próximas 8 semanas no debe anunciar "Lunes a jueves: Cerrado" — le falta
// cargar el resto del calendario, no es que abra 50 minutos a la semana.
test('con muy pocos días distintos con clase, no se declara cerrado el resto', () => {
  const { franjas, confiable } = horarioPublico([ses(LUN, '18:00', '18:50'), ses(MAR, '18:00', '18:50')]);
  assert.equal(confiable, false);
  assert.deepEqual(franjas, [{ dias: 'Lunes y martes', horas: '18:00 – 18:50' }]);
});

test('con 3+ días distintos ya se confía y se declara cerrado el resto', () => {
  const { franjas, confiable } = horarioPublico([ses(LUN, '18:00', '18:50'), ses(MAR, '18:00', '18:50'), ses(SAB, '10:00', '11:00')]);
  assert.equal(confiable, true);
  assert.ok(franjas.some(f => f.horas === 'Cerrado'));
});

// ── El bono más elegido ──────────────────────────────────────────────────────

const plan = (id: string, precio = 100, sesiones: number | null = 10) =>
  ({ id, studioId: 'st', nombre: id, precio, sesiones } as PlanTarifa);
const sus = (planId: string) => ({ planId } as Suscripcion);

test('gana el bono que más se ha contratado de verdad', () => {
  const planes = [plan('a'), plan('b'), plan('c')];
  const ventas = [sus('a'), sus('b'), sus('b'), sus('b'), sus('c')];
  assert.equal(planMasElegido(planes, ventas), 'b');
});

// La etiqueta solo vale si es cierta: puesta a dedo en un empate, deja de serlo.
test('un empate en lo más alto no destaca a nadie', () => {
  const planes = [plan('a'), plan('b')];
  assert.equal(planMasElegido(planes, [sus('a'), sus('a'), sus('b'), sus('b')]), null);
});

test('con una sola venta no se destaca nada', () => {
  assert.equal(planMasElegido([plan('a'), plan('b')], [sus('a')]), null);
  assert.equal(planMasElegido([plan('a')], [sus('a'), sus('a')]), null, 'un solo plan no compite');
});

test('no cuentan las ventas de planes que ya no se ofrecen', () => {
  const planes = [plan('a'), plan('b')];
  const ventas = [sus('viejo'), sus('viejo'), sus('viejo'), sus('a'), sus('a'), sus('b')];
  assert.equal(planMasElegido(planes, ventas), 'a');
});

// ── Precio por clase ─────────────────────────────────────────────────────────

test('el precio por clase sale con dos decimales y coma', () => {
  assert.equal(precioPorClase({ precio: 175, sesiones: 10 }), '17,50 € por clase');
});

test('sin sesiones contadas no hay precio por clase', () => {
  assert.equal(precioPorClase({ precio: 129, sesiones: null }), null, 'ilimitado');
  assert.equal(precioPorClase({ precio: 0, sesiones: 10 }), null, 'gratis');
  assert.equal(precioPorClase({ precio: 100, sesiones: 0 }), null);
});
