import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonimizarTermino } from './busquedas-sin-resultado.ts';

test('se normaliza: minúsculas, sin acentos, espacios colapsados', () => {
  assert.equal(anonimizarTermino('  Importar   BSPORT '), 'importar bsport');
  assert.equal(anonimizarTermino('Cómo cobrar la matrícula'), 'como cobrar la matricula');
  assert.equal(anonimizarTermino('lista-de-espera'), 'lista-de-espera');
});

test('lo que parece un dato personal se descarta entero, no se «limpia»', () => {
  for (const q of [
    'ana.garcia@example.com', 'escribe a ana@example.com', 'https://tentare.app/x', 'www.estudio.com', 'mi web estudio.es',
    '612 34 56 78', 'nif 12345678z', 'es91 2100 0418 4502', 'reservas de maria lopez garcia de la fuente hoy',
  ]) {
    assert.equal(anonimizarTermino(q), null, q);
  }
});

test('demasiado corto, demasiado largo o con símbolos raros: nada', () => {
  for (const q of ['', 'ab', 'x'.repeat(61), 'a<script>', 'cobro; drop table', '¿cómo?']) assert.equal(anonimizarTermino(q), null, q);
  assert.equal(anonimizarTermino(null), null);
  assert.equal(anonimizarTermino(42), null);
});

test('una búsqueda corriente con cifras sueltas se conserva', () => {
  assert.equal(anonimizarTermino('bono 10 clases'), 'bono 10 clases');
  assert.equal(anonimizarTermino('iva 21'), 'iva 21');
});
