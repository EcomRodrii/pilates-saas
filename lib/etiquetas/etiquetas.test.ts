import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORES_ETIQUETA, SUGERIDAS, colorDe, efectoDeRenombrar, esColorEtiqueta, listaDeEtiquetas, motivoNombreNoValido,
  normalizarNombre, opcionesParaPoner, resumenDeEtiquetas, type Etiqueta,
} from './etiquetas.ts';

const cat = (nombre: string, color: Etiqueta['color'] = 'rosa', id = `id-${nombre}`): Etiqueta => ({ id, nombre, color });

test('el nombre se guarda sin espacios de más', () => {
  assert.equal(normalizarNombre('  Mamás   de  Pilates '), 'Mamás de Pilates');
});

test('un nombre vale si no está vacío, cabe y no se repite (sin distinguir mayúsculas)', () => {
  assert.match(motivoNombreNoValido('   ', []) ?? '', /Escribe/);
  assert.match(motivoNombreNoValido('x'.repeat(31), []) ?? '', /Máximo 30/);
  assert.equal(motivoNombreNoValido('x'.repeat(30), []), null);
  assert.match(motivoNombreNoValido('vip', ['VIP']) ?? '', /Ya hay/);
  assert.match(motivoNombreNoValido(' VIP ', ['vip']) ?? '', /Ya hay/);
  assert.equal(motivoNombreNoValido('Nueva', ['VIP']), null);
});

test('al editar, el nombre actual no cuenta como repetido: cambiar solo las mayúsculas vale', () => {
  assert.equal(motivoNombreNoValido('vip', ['VIP'], 'VIP'), null);
  assert.match(motivoNombreNoValido('Online', ['VIP', 'Online'], 'VIP') ?? '', /Ya hay/);
});

test('la lista junta el catálogo y lo que hay en las fichas, sin repetir y con su cuenta', () => {
  const lista = listaDeEtiquetas(
    [cat('VIP', 'rosa'), cat('Mamás', 'verde')],
    [{ tags: ['VIP', 'Lesión'] }, { tags: ['vip'] }, { tags: ['Lesión', 'Lesión'] }, { tags: [] }, {}, { tags: null }],
  );
  assert.deepEqual(lista.map(e => [e.nombre, e.usos, e.id !== null, e.color]), [
    ['Lesión', 2, false, 'gris'],
    ['Mamás', 0, true, 'verde'],
    ['VIP', 2, true, 'rosa'],
  ]);
});

test('un cliente con la misma etiqueta escrita de dos maneras cuenta una vez', () => {
  const [v] = listaDeEtiquetas([cat('VIP')], [{ tags: ['VIP', 'vip'] }]);
  assert.equal(v.usos, 1);
});

test('sin catálogo, el nombre es la grafía que más se ha escrito', () => {
  const [e] = listaDeEtiquetas([], [{ tags: ['vip'] }, { tags: ['Vip'] }, { tags: ['Vip'] }]);
  assert.equal(e.nombre, 'Vip');
  assert.equal(e.usos, 3);
});

test('el catálogo manda sobre el nombre y el color de las fichas', () => {
  const [e] = listaDeEtiquetas([cat('VIP', 'violeta')], [{ tags: ['vip'] }]);
  assert.deepEqual([e.nombre, e.color, e.usos], ['VIP', 'violeta', 1]);
});

test('al etiquetar se ofrecen las del estudio y las sugeridas que faltan, sin las ya puestas', () => {
  const op = opcionesParaPoner([cat('Mamás', 'verde')], [{ tags: ['VIP'] }], ['mamás']);
  const nombres = op.map(e => e.nombre);
  assert.ok(!nombres.includes('Mamás'), 'la que ya lleva no se ofrece (sin distinguir mayúsculas)');
  assert.equal(nombres.filter(n => n === 'VIP').length, 1, 'VIP sale una vez: la de las fichas, no también la sugerida');
  assert.ok(nombres.includes('Lesión'), 'las sugeridas que el estudio no tiene siguen saliendo');
  assert.equal(nombres.length, SUGERIDAS.length, 'VIP (fichas) + las seis sugeridas restantes');
});

test('una etiqueta se pinta con su color del catálogo; sin catálogo, con el de la sugerida; si no, gris', () => {
  assert.equal(colorDe('vip', [cat('VIP', 'violeta')]), 'violeta');
  assert.equal(colorDe('Lesión', []), 'rojo');
  assert.equal(colorDe('Algo mío', []), 'gris');
});

test('renombrar dice a cuántos clientes toca y si se funde con otra', () => {
  const lista = listaDeEtiquetas([cat('VIP'), cat('Vip2')], [{ tags: ['VIP'] }, { tags: ['VIP'] }, { tags: ['Vip2'] }]);
  assert.deepEqual(efectoDeRenombrar(lista, 'VIP', 'Premium'), { alumnas: 2, seFunde: false });
  assert.deepEqual(efectoDeRenombrar(lista, 'VIP', 'vip2'), { alumnas: 2, seFunde: true });
  assert.deepEqual(efectoDeRenombrar(lista, 'VIP', 'vip'), { alumnas: 2, seFunde: false }, 'cambiar solo mayúsculas no es fundir');
});

test('el valor de hoy de la fila', () => {
  assert.equal(resumenDeEtiquetas(null), null);
  assert.equal(resumenDeEtiquetas([]), 'Ninguna');
  assert.equal(resumenDeEtiquetas(listaDeEtiquetas([cat('A')], [])), '1 etiqueta');
  assert.equal(resumenDeEtiquetas(listaDeEtiquetas([cat('A'), cat('B')], [])), '2 etiquetas');
});

test('los ocho colores son los de la base de datos', () => {
  assert.deepEqual([...COLORES_ETIQUETA], ['gris', 'rosa', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'violeta']);
  assert.ok(esColorEtiqueta('azul'));
  assert.ok(!esColorEtiqueta('fucsia'));
  assert.ok(SUGERIDAS.every(s => esColorEtiqueta(s.color)));
});
