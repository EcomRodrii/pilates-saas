import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encendidoPara, interruptoresDe, interruptoresPara } from './interruptores.ts';

test('apagado de serie; «on» para todos; «estudios:» solo para esos', () => {
  assert.equal(encendidoPara(undefined, 's1'), false);
  assert.equal(encendidoPara('true', 's1'), false);
  assert.equal(encendidoPara(' on ', 's1'), true);
  assert.equal(encendidoPara('estudios:s0, s1', 's1'), true);
  assert.equal(encendidoPara('estudios:s0', 's1'), false);
  assert.deepEqual(interruptoresDe('s1', {}), { filtrosClientas: false });
  assert.deepEqual(interruptoresDe('s1', { CLIENTAS_FILTROS: 'estudios:s1' }), { filtrosClientas: true });
});

test('guardia: las variables solo se leen en el servidor', () => {
  const ruta = readFileSync(new URL('../../app/api/estudio/interruptores/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, /process\.env/);
  const cliente = readFileSync(new URL('./interruptores-cliente.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cliente, /process\.env/);
});

test('si el navegador pregunta por otra sede que la de la sesión, todo apagado', () => {
  const entorno = { CLIENTAS_FILTROS: 'estudios:s1' };
  assert.deepEqual(interruptoresPara('s1', 's1', entorno), { filtrosClientas: true });
  assert.deepEqual(interruptoresPara('s1', null, entorno), { filtrosClientas: true });
  assert.deepEqual(interruptoresPara('s1', 's2', entorno), { filtrosClientas: false });
  assert.deepEqual(interruptoresPara('s2', 's1', { CLIENTAS_FILTROS: 'on' }), { filtrosClientas: false });
});
