import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loQueTengo, tieneAlgo } from './lo-que-tengo.ts';
import { bonoParaClase } from './bono-cubre.ts';
import type { Bono, PlazaFijaVista } from './tipos.ts';

// Sin `@/`: con el alias este test dejaría de ejecutarse sin avisar.

const bono = (extra: Partial<Bono> = {}): Bono => ({
  id: 'b1', nombre: 'Bono 10 clases', creditosTotales: 10, creditosUsados: 3, compradoEn: '2026-10-01', expiraEn: '2026-10-31',
  estado: 'activo', precio: 120, tipoPlan: 'BONO', sesionesDelPlan: 10, ...extra,
});
const cuota = (extra: Partial<Bono> = {}): Bono => bono({
  id: 'q1', nombre: 'Reformer 2 días/semana', creditosTotales: Infinity, creditosUsados: 0, tipoPlan: 'MENSUAL', sesionesDelPlan: null, limiteSemanal: 2, ...extra,
});
const plaza = (extra: Partial<PlazaFijaVista> = {}): PlazaFijaVista => ({
  id: 'pf1', diaSemana: 1, hora: '10:00', sala: 'Sala Sol', salaId: 's1', tipo: 'Reformer', estado: 'ACTIVA', pausaPedida: null,
  proximaFecha: '2026-10-13', vigenciaHasta: null, sinClase: false, pausa: null, proximas: [], deClaseFija: false, instructora: null, ...extra,
});

test('solo bono: el bono que se gasta primero, con su saldo de `saldoBono`', () => {
  const t = loQueTengo({ bonos: [bono()] });
  assert.equal(t.cuota, null);
  assert.equal(t.bono?.id, 'b1');
  assert.deepEqual(t.saldo, { quedan: 7, de: 10 });
  assert.equal(t.sesionesEnBonos, 7);
});

test('un bono renovado no dice «de 10»: «de M» solo cuando es verdad', () => {
  const t = loQueTengo({ bonos: [bono({ creditosTotales: 13, creditosUsados: 2, renovado: true })] });
  assert.deepEqual(t.saldo, { quedan: 11, de: null });
});

test('cuota y bono: la cuota manda y el bono es lo que «también tienes»', () => {
  const t = loQueTengo({ bonos: [bono(), cuota()] });
  assert.equal(t.cuota?.id, 'q1');
  assert.equal(t.bono?.id, 'b1');
  assert.deepEqual(t.otros, []);
});

test('el bono principal es el mismo que el servidor gastaría primero (acotado antes que el general, luego caducidad)', () => {
  const general = bono({ id: 'general', expiraEn: '2026-10-20' });
  const acotado = bono({ id: 'acotado', expiraEn: '2026-12-31', tiposClaseIds: ['tc-r'] });
  const t = loQueTengo({ bonos: [general, acotado] });
  assert.equal(t.bono?.id, bonoParaClase([general, acotado], 'tc-r')?.id);
  assert.equal(t.bonosConSesiones, 2);
  assert.equal(t.sesionesEnBonos, 14);
  assert.deepEqual(t.otros.map((b) => b.id), ['general']);
});

test('un bono sin sesiones no es «tu bono», y lo que no está activo va a «anteriores», lo más reciente primero', () => {
  const t = loQueTengo({ bonos: [
    bono({ id: 'viejo', estado: 'expirado', compradoEn: '2026-01-01' }),
    bono({ id: 'agotado', estado: 'agotado', creditosUsados: 10, compradoEn: '2026-06-01' }),
  ] });
  assert.equal(t.bono, null);
  assert.deepEqual(t.anteriores.map((b) => b.id), ['agotado', 'viejo']);
  assert.equal(tieneAlgo(t), false);
});

test('la cuota en pausa sin nada activo se dice (no se le ofrece renovar)', () => {
  const t = loQueTengo({ bonos: [cuota({ estado: 'pausado' })] });
  assert.equal(t.cuota, null);
  assert.equal(t.cuotaEnPausa, true);
});

test('un bono sin límite que NO es cuota va a «otros»: no es tu cuota ni tu bono de sesiones', () => {
  const anual = bono({ id: 'anual', creditosTotales: Infinity, creditosUsados: 0, tipoPlan: 'BONO' });
  const t = loQueTengo({ bonos: [anual] });
  assert.equal(t.cuota, null);
  assert.equal(t.bono, null);
  assert.deepEqual(t.otros.map((b) => b.id), ['anual']);
  assert.equal(tieneAlgo(t), true);
});

test('clases fijas y recuperaciones viajan con lo demás', () => {
  const t = loQueTengo({ bonos: [], plazas: [plaza()], recuperaciones: { disponibles: 2, proximaCaducidad: '2026-10-20' } });
  assert.equal(t.fijas.length, 1);
  assert.deepEqual(t.recuperaciones, { disponibles: 2, proximaCaducidad: '2026-10-20' });
  assert.equal(tieneAlgo(t), true);
});
