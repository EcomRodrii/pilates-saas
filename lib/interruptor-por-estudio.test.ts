import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encendidaPara } from './interruptor-por-estudio.ts';

test('apagada de serie; «on» para todos; «estudios:» solo para esos', () => {
  assert.equal(encendidaPara(undefined, 'studio-1'), false);
  assert.equal(encendidaPara('', 'studio-1'), false);
  assert.equal(encendidaPara('true', 'studio-1'), false, 'solo «on» enciende para todos');
  assert.equal(encendidaPara(' on ', 'studio-1'), true);
  assert.equal(encendidaPara('estudios:studio-1, studio-2', 'studio-2'), true);
  assert.equal(encendidaPara('estudios:studio-1', 'studio-3'), false);
  assert.equal(encendidaPara('estudios:studio-1', ''), false);
});

test('guardia: el mapa de € por plaza lee su variable solo en el servidor', async () => {
  const { readFileSync } = await import('node:fs');
  const ruta = readFileSync(new URL('../app/api/informes/euro-plaza/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, /euroPorPlazaEncendido\(sesion\.studioId\)/, 'el estudio sale de la sesión');
  assert.match(ruta, /puedeVer\(sesion\.rol, '\/informes'\)/, 'y solo para quien ve Informes');
  const cliente = readFileSync(new URL('./informes/euro-plaza-cliente.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cliente, /process\.env|INFORMES_EURO_PLAZA/);
});
