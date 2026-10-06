import test from 'node:test';
import assert from 'node:assert/strict';
import { comoVienes } from './como-vienes.ts';
import type { Bono } from './tipos.ts';

// «Cómo vienes» (P02): con SUS datos, con qué viene a esta clase. Solo informa: no vende ni cobra.

const HOY = '2026-10-07';
const clase = { id: 'ses-10', tipo: 'Reformer', tipoClaseId: 'tc-r', precioSuelto: 20, sinPrecioSuelto: false };
const bono = (o: Partial<Bono> = {}): Bono => ({
  id: 'sus-1', nombre: 'Bono 8 sesiones', creditosTotales: 8, creditosUsados: 3, compradoEn: '2026-09-01',
  expiraEn: '2026-12-31', estado: 'activo', precio: 96, tipoPlan: 'BONO', sesionesDelPlan: 8, renovado: false, ...o,
});
const cuota = (o: Partial<Bono> = {}): Bono => bono({
  id: 'sus-mes', nombre: 'Mensual 2 días', creditosTotales: Infinity, creditosUsados: 0, tipoPlan: 'MENSUAL',
  sesionesDelPlan: null, expiraEn: null, limiteSemanal: 2, ...o,
});
const planes = [{ id: 'p', nombre: 'Bono 8', tipo: 'BONO', precio: 96, activo: true }];
const nombres = { 'tc-r': 'Reformer', 'tc-mat': 'Mat' };
const base = { clase, bonos: [] as Bono[], disp: 'disponible' as const, reservas: [], yaNoSeReserva: false, planesTarifa: planes, nombresTipo: nombres, hoy: HOY };
const vista = (o: Partial<typeof base> & Record<string, unknown> = {}) => comoVienes({ ...base, ...o } as Parameters<typeof comoVienes>[0]);

test('cuota: «Incluida en tu cuota», su plan y su tope con «hasta», y «Ver» lleva a la cuota', () => {
  const v = vista({ bonos: [cuota()] })!;
  assert.equal(v.caso, 'cuota');
  assert.equal(v.titulo, 'Incluida en tu cuota');
  assert.equal(v.detalle, 'Mensual 2 días · hasta 2 clases a la semana');
  assert.deepEqual(v.enlace, { texto: 'Ver', destino: 'bono', bonoId: 'sus-mes' });
  assert.equal(v.tono, 'ok');
  // Sin tope: solo el plan. Nunca «sin límite».
  assert.equal(vista({ bonos: [cuota({ limiteSemanal: null })] })!.detalle, 'Mensual 2 días');
});

test('cuota + bono acotado a Reformer: manda la cuota (la mensual gana) y no se habla de sesiones', () => {
  const v = vista({ bonos: [bono({ tiposClaseIds: ['tc-r'] }), cuota()] })!;
  assert.equal(v.caso, 'cuota');
  assert.doesNotMatch(`${v.titulo} ${v.detalle}`, /Te quedan|sesi/);
});

test('bono con saldo: su nombre, lo que le queda y cuándo caduca', () => {
  const v = vista({ bonos: [bono()] })!;
  assert.equal(v.caso, 'bono');
  assert.equal(v.titulo, 'Bono 8 sesiones');
  assert.equal(v.detalle, 'Te quedan 5 · caduca jue 31 dic');
  assert.deepEqual(v.enlace, { texto: 'Ver', destino: 'bono', bonoId: 'sus-1' });
  assert.equal(vista({ bonos: [bono({ expiraEn: null })] })!.detalle, 'Te quedan 5 · sin caducidad');
  // Un bono con tope semanal lo dice también.
  assert.equal(vista({ bonos: [bono({ limiteSemanal: 1 })] })!.detalle, 'Te quedan 5 · caduca jue 31 dic · hasta 1 clase a la semana');
});

test('bono sin límite que no es cuota: «Incluida en tu…», sin contador y sin «sin límite»', () => {
  const v = vista({ bonos: [bono({ nombre: 'Bono anual', creditosTotales: Infinity, creditosUsados: 0 })] })!;
  assert.equal(v.caso, 'ilimitado');
  assert.equal(v.titulo, 'Incluida en tu bono anual');
  assert.equal(v.detalle, null);
});

test('bono que no cubre: lo dice (uno o varios) y lo que costaría, con la tienda si algo la cubre', () => {
  const mat = bono({ nombre: 'Bono Mat', tiposClaseIds: ['tc-mat'] });
  const v = vista({ bonos: [mat] })!;
  assert.equal(v.caso, 'bono-no-cubre');
  assert.equal(v.titulo, 'Tu Bono Mat no sirve para Reformer');
  assert.equal(v.detalle, 'Clase suelta · 20 €');
  assert.equal(v.tono, 'coste');
  assert.deepEqual(v.enlace, { texto: 'Ver opciones', destino: 'tienda' });
  const dos = vista({ bonos: [mat, bono({ id: 'sus-2', nombre: 'Bono Barre', tiposClaseIds: ['tc-barre'] })] })!;
  assert.equal(dos.titulo, 'Ninguno de tus bonos sirve para Reformer');
  // Solo con bono: es un muro, no un coste.
  const muro = vista({ bonos: [mat], clase: { ...clase, sinPrecioSuelto: true } })!;
  assert.equal(muro.detalle, 'Esta clase solo se reserva con bono o cuota');
  assert.equal(muro.tono, 'bloqueo');
});

test('sin nada: suelta con su precio, gratis o solo con bono o cuota', () => {
  assert.equal(vista()!.titulo, 'Clase suelta · 20 €');
  assert.equal(vista()!.tono, 'coste');
  const gratis = vista({ clase: { ...clase, precioSuelto: 0 } })!;
  assert.equal(gratis.titulo, 'Esta clase es gratis');
  assert.equal(gratis.tono, 'ok');
  const muro = vista({ clase: { ...clase, sinPrecioSuelto: true } })!;
  assert.equal(muro.titulo, 'Esta clase solo se reserva con bono o cuota');
  assert.equal(muro.tono, 'bloqueo');
});

test('«Ver opciones» SOLO si un plan activo, no de prueba, cubre ese tipo', () => {
  assert.equal(vista({ planesTarifa: [] })!.enlace, undefined);
  assert.equal(vista({ planesTarifa: [{ ...planes[0], tiposClaseIds: ['tc-mat'] }] })!.enlace, undefined);
  assert.equal(vista({ planesTarifa: [{ ...planes[0], activo: false }] })!.enlace, undefined);
  assert.equal(vista({ planesTarifa: [{ ...planes[0], esPrueba: true }] })!.enlace, undefined);
  assert.deepEqual(vista({ planesTarifa: [{ ...planes[0], tiposClaseIds: ['tc-r'] }] })!.enlace, { texto: 'Ver opciones', destino: 'tienda' });
});

test('su clase fija, dicho UNA vez: «Tu clase fija · incluida en tu cuota» solo si hay una cuota que la cubra', () => {
  const reservas = [{ id: 'res-pf-abc', claseId: 'ses-10', estado: 'confirmada' as const }];
  const conCuota = vista({ reservas, bonos: [cuota()], disp: 'reservada' })!;
  assert.deepEqual([conCuota.caso, conCuota.titulo, conCuota.detalle], ['clase-fija', 'Tu clase fija · incluida en tu cuota', null]);
  const sinCuota = vista({ reservas, bonos: [], disp: 'reservada' })!;
  assert.deepEqual([sinCuota.titulo, sinCuota.detalle], ['Tu clase fija', null]);
});

test('no se pinta: reserva normal ya hecha, clase empezada sin plaza suya, o llena sin lista de espera', () => {
  assert.equal(vista({ reservas: [{ id: 'res-1', claseId: 'ses-10', estado: 'confirmada' }], disp: 'reservada' }), null);
  assert.equal(vista({ yaNoSeReserva: true }), null);
  assert.equal(vista({ disp: 'no-disponible' }), null);
});

test('en lista de espera, llena con lista o aún sin abrir: dice con qué vendría', () => {
  assert.equal(vista({ reservas: [{ id: 'res-1', claseId: 'ses-10', estado: 'en-espera' }], disp: 'lista-espera', bonos: [bono()] })!.caso, 'bono');
  assert.equal(vista({ disp: 'completa', bonos: [bono()] })!.caso, 'bono');
});

test('guardia: ningún texto repite las frases de la hoja (saldrían dos veces y romperían a getByText)', () => {
  const casos = [
    vista({ bonos: [cuota()] }), vista({ bonos: [bono()] }), vista({ bonos: [bono({ tiposClaseIds: ['tc-mat'] })] }),
    vista(), vista({ clase: { ...clase, sinPrecioSuelto: true } }), vista({ clase: { ...clase, precioSuelto: 0 } }),
    vista({ bonos: [bono({ creditosTotales: Infinity, creditosUsados: 0 })] }),
  ];
  for (const v of casos) {
    const texto = `${v?.titulo ?? ''} ${v?.detalle ?? ''}`.toLowerCase();
    assert.doesNotMatch(texto, /no pagas nada hoy/);
    assert.doesNotMatch(texto, /tu bono no incluye este tipo de clase/);
  }
});
