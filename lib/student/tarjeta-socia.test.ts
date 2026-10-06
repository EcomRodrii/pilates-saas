import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifrasDeLaSocia } from './tarjeta-socia.ts';
import type { Bono, Reserva } from './tipos.ts';

// Sin `@/`: con el alias este test dejaría de ejecutarse sin avisar.

const HOY = '2026-10-07';
const href = (r: string) => `/portal/e${r}`;

const reserva = (id: string, estado: Reserva['estado'], claseId = 'c-' + id): Pick<Reserva, 'id' | 'claseId' | 'estado'> => ({ id, claseId, estado });
function bono(extra: Partial<Bono> = {}): Bono {
  return {
    id: 'b1', nombre: 'Bono 10', creditosTotales: 10, creditosUsados: 5, compradoEn: '2026-09-01', expiraEn: '2026-11-12',
    estado: 'activo', precio: 100, tipoPlan: 'BONO', sesionesDelPlan: 10, ...extra,
  };
}
const cuota = (extra: Partial<Bono> = {}) => bono({ id: 'q1', nombre: 'Mensual 2 por semana', creditosTotales: Infinity, creditosUsados: 0, tipoPlan: 'MENSUAL', limiteSemanal: 2, ...extra });

function base(extra: Partial<Parameters<typeof cifrasDeLaSocia>[0]> = {}): Parameters<typeof cifrasDeLaSocia>[0] {
  return {
    reservas: [], clases: [], bonos: [], recuperacionesDisponibles: 0, puntos: null,
    nombreCreditos: 'créditos', recienLlegada: false, hoy: HOY, ahoraMs: Date.parse('2026-10-07T10:00:00Z'), href, ...extra,
  };
}

test('las tres cifras de quien tiene de todo: clases, bono y recuperación', () => {
  const r = cifrasDeLaSocia(base({
    reservas: [reserva('1', 'asistida'), reserva('2', 'asistida'), reserva('3', 'asistida'), reserva('4', 'no-asistida')],
    bonos: [bono()], recuperacionesDisponibles: 1,
  }));
  assert.equal(r.sinCifras, null);
  assert.deepEqual(r.cifras.map((c) => [c.valor, c.texto, c.destino]), [
    ['3', 'clases contigo', null],
    ['5', 'sesiones de tu bono · hasta 12 nov', '/portal/e/bonos'],
    ['1', 'clase por recuperar', '/portal/e/bonos'],
  ]);
  assert.equal(r.cifras[1].etiqueta, '5 sesiones de tu bono, hasta 12 nov');
  assert.equal(r.cifras[2].etiqueta, '1 clase por recuperar');
});

test('singulares: 1 clase contigo, 1 sesión de tu bono, 2 clases por recuperar', () => {
  const r = cifrasDeLaSocia(base({ reservas: [reserva('1', 'asistida')], bonos: [bono({ creditosUsados: 9 })], recuperacionesDisponibles: 2 }));
  assert.deepEqual(r.cifras.map((c) => c.texto), ['clase contigo', 'sesión de tu bono · hasta 12 nov', 'clases por recuperar']);
});

test('nunca una cifra en cero, y como mucho tres (los puntos solo si queda hueco)', () => {
  const vacia = cifrasDeLaSocia(base({ bonos: [bono({ creditosUsados: 10 })], puntos: 0 }));
  assert.equal(vacia.cifras.length, 0);
  const llena = cifrasDeLaSocia(base({ reservas: [reserva('1', 'asistida')], bonos: [bono()], recuperacionesDisponibles: 1, puntos: 40 }));
  assert.equal(llena.cifras.length, 3);
  assert.ok(!llena.cifras.some((c) => c.destino?.endsWith('/logros')));
  const conHueco = cifrasDeLaSocia(base({ bonos: [bono()], puntos: 40, nombreCreditos: 'pétalos' }));
  assert.deepEqual(conHueco.cifras.map((c) => [c.valor, c.texto, c.destino]), [
    ['5', 'sesiones de tu bono · hasta 12 nov', '/portal/e/bonos'],
    ['40', 'pétalos', '/portal/e/logros'],
  ]);
  for (const c of [...vacia.cifras, ...llena.cifras, ...conHueco.cifras]) assert.notEqual(c.valor, '0');
});

test('la cuota dice lo mismo que «Lo tuyo»: su tope, «con máximo por actividad» o «sin máximo semanal», nunca «sin límite»', () => {
  const conTope = cifrasDeLaSocia(base({ bonos: [cuota()] }));
  assert.deepEqual([conTope.cifras[0].valor, conTope.cifras[0].texto, conTope.cifras[0].etiqueta], ['Cuota', '2 clases a la semana', 'Cuota, 2 clases a la semana']);
  const porActividad = cifrasDeLaSocia(base({ bonos: [cuota({ limiteSemanal: null, limitePorTipo: { 'tc-r': 1 } })] }));
  assert.equal(porActividad.cifras[0].texto, 'con máximo por actividad');
  // Sin tope: antes salía el NOMBRE del plan («Tarifa plana»), que no dice qué es; ahora la frase de «Lo tuyo».
  const sinTope = cifrasDeLaSocia(base({ bonos: [cuota({ limiteSemanal: null, nombre: 'Tarifa plana' })] }));
  assert.deepEqual([sinTope.cifras[0].valor, sinTope.cifras[0].texto], ['Cuota', 'sin máximo semanal']);
  assert.ok(!JSON.stringify(sinTope).includes('sin límite'));
});

test('cuota y bono a la vez: manda la cuota (la mensual gana)', () => {
  const r = cifrasDeLaSocia(base({ bonos: [bono(), cuota()] }));
  assert.equal(r.cifras.length, 1);
  assert.equal(r.cifras[0].valor, 'Cuota');
});

test('bono sin caducidad, y de otro año', () => {
  assert.equal(cifrasDeLaSocia(base({ bonos: [bono({ expiraEn: null })] })).cifras[0].texto, 'sesiones de tu bono');
  assert.equal(cifrasDeLaSocia(base({ bonos: [bono({ expiraEn: '2027-01-15' })] })).cifras[0].texto, 'sesiones de tu bono · hasta 15 ene 2027');
});

test('dos bonos con sesiones: se suman y se dice en cuántos', () => {
  const r = cifrasDeLaSocia(base({ bonos: [bono(), bono({ id: 'b2', creditosUsados: 7 }), bono({ id: 'b3', creditosUsados: 10 })] }));
  assert.deepEqual([r.cifras[0].valor, r.cifras[0].texto, r.cifras[0].etiqueta], ['8', 'sesiones en tus 2 bonos', '8 sesiones en tus 2 bonos']);
});

test('un bono caducado o en pausa no cuenta', () => {
  const r = cifrasDeLaSocia(base({ bonos: [bono({ estado: 'expirado' }), bono({ id: 'b2', estado: 'pausado' })] }));
  assert.equal(r.cifras.length, 0);
});

test('recuperaciones: a Fija si tiene clase fija; si no, a Bonos', () => {
  // Las recuperaciones viven en Mi plan: la cifra lleva allí siempre, tenga o no clase fija.
  assert.equal(cifrasDeLaSocia(base({ recuperacionesDisponibles: 1 })).cifras[0].destino, '/portal/e/bonos');
  assert.equal(cifrasDeLaSocia(base({ recuperacionesDisponibles: 1 })).cifras[0].destino, '/portal/e/bonos');
});

test('sin cifras y con una clase reservada: «Tu próxima clase», nunca «Tu primera clase»', () => {
  const clases = [{ id: 'c-9', fecha: '2026-10-08', hora: '10:00', fin: '2026-10-08T08:50:00Z' }];
  const r = cifrasDeLaSocia(base({ reservas: [reserva('9', 'confirmada')], clases, recienLlegada: true }));
  assert.equal(r.sinCifras?.tipo, 'proxima');
  assert.match(r.sinCifras!.texto, /^Tu próxima clase: jue 8 oct · 10:00$/);
  assert.equal(r.sinCifras!.destino, '/portal/e/mis-reservas/9');
});

test('una reservada que ya terminó no es «la próxima»', () => {
  const clases = [{ id: 'c-9', fecha: HOY, hora: '09:00', fin: '2026-10-07T07:50:00Z' }];
  const r = cifrasDeLaSocia(base({ reservas: [reserva('9', 'confirmada')], clases }));
  assert.equal(r.sinCifras?.tipo, 'reservar');
});

test('«Aún no has venido a ninguna clase» SOLO con la regla de la recién llegada', () => {
  const nueva = cifrasDeLaSocia(base({ recienLlegada: true }));
  assert.equal(nueva.sinCifras?.tipo, 'primera');
  assert.equal(nueva.sinCifras?.texto, 'Aún no has venido a ninguna clase.');
  assert.equal(nueva.sinCifras?.destino, '/portal/e/reservar');
  // Una que faltó a una clase y no tiene nada más NO es «aún no has venido»: el texto por defecto.
  const falto = cifrasDeLaSocia(base({ reservas: [reserva('1', 'no-asistida')] }));
  assert.equal(falto.sinCifras?.tipo, 'reservar');
  assert.equal(falto.sinCifras?.texto, 'Reserva tu próxima clase');
  assert.ok(!JSON.stringify(falto).includes('Aún no has venido'));
});

test('ninguna cifra dice «te quedan» a secas: cada una dice de qué es (decisión del fundador, 6-oct-2026)', () => {
  const casos = [
    base({ bonos: [bono()], recuperacionesDisponibles: 2 }),
    base({ bonos: [bono(), bono({ id: 'b2' })] }),
    base({ bonos: [cuota()], recuperacionesDisponibles: 1 }),
  ];
  for (const c of casos) {
    for (const cifra of cifrasDeLaSocia(c).cifras) {
      assert.doesNotMatch(cifra.texto, /^te quedan?\b/);
      assert.match(cifra.texto, /bono|cuota|clase|sesi|semana|actividad/);
    }
  }
});
