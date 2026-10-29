import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPasosParaPanel } from './agrupar.ts';
import type { PasoDemo } from '../modelo.ts';

const paso = (titulo: string, ruta?: string, extra: Record<string, unknown> = {}): PasoDemo => ({
  id: titulo, titulo, proposito: `p ${titulo}`, bloques: [], porQue: [],
  pantalla: ruta ? { ruta, titular: titulo, detalle: `d ${titulo}`, ...extra } : undefined,
});

test('la misma pantalla seguida sale una vez, con los datos del último paso y la historia en orden', () => {
  const g = agruparPasosParaPanel([
    paso('Reglas', '/configuracion?tab=reservas', { reglas: { ventanaCancelacionHoras: 12 } }),
    paso('Su bono', '/clientas/soc-1', { bonos: [{ nombre: 'B', restantes: 4, total: 10, caducaEnDias: 6 }] }),
    paso('Reserva', '/clientas/soc-1', { bonos: [{ nombre: 'B', restantes: 3, total: 10, caducaEnDias: 6 }] }),
    paso('Caducan 3', '/clientas/soc-1', { bonos: [{ nombre: 'B', restantes: 3, total: 10, caducaEnDias: -1 }] }),
  ]);
  assert.deepEqual(g.map((x) => x.pantalla?.ruta), ['/configuracion?tab=reservas', '/clientas/soc-1']);
  assert.equal(g[1].titulo, 'Caducan 3');
  assert.equal(g[1].pantalla?.bonos?.[0].caducaEnDias, -1, 'se ve cómo acaba');
  assert.deepEqual(g[1].historia, ['Su bono', 'Reserva', 'Caducan 3']);
  assert.equal(g[0].historia, undefined, 'un paso solo no lleva historia');
});

test('volver a una pantalla ya enseñada con los mismos ajustes no la repite: su conclusión se cuenta donde se está', () => {
  const r = { reglas: { recuperacionAutoSemanal: true } };
  const g = agruparPasosParaPanel([paso('Reglas', '/configuracion?tab=reservas', r), paso('Semana', '/clientas/soc-1'), paso('Cancela', '/clientas/soc-1'), paso('Gana 1 recuperación', '/configuracion?tab=reservas', r)]);
  assert.deepEqual(g.map((x) => x.pantalla?.ruta), ['/configuracion?tab=reservas', '/clientas/soc-1']);
  assert.equal(g[1].pantalla?.ruta, '/clientas/soc-1', 'sigue en SU pantalla');
  assert.equal(g[1].pantalla?.titular, 'Gana 1 recuperación');
  assert.deepEqual(g[1].historia, ['Semana', 'Cancela', 'Gana 1 recuperación']);
});

test('con otros ajustes sí es otra pantalla, y un paso sin pantalla se queda como está', () => {
  const g = agruparPasosParaPanel([
    paso('A', '/configuracion?tab=reservas', { reglas: { ventanaCancelacionHoras: 12 } }), paso('B', '/clientas/soc-1'),
    paso('C', '/configuracion?tab=reservas', { reglas: { ventanaCancelacionHoras: 48 } }), paso('Sin pantalla'),
  ]);
  assert.equal(g.length, 4);
});
