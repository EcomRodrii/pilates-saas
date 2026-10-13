import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTERRUPTORES, interruptoresDe, interruptoresPara } from './interruptores.ts';

// El formato (`on` / `estudios:`) lo prueba lib/interruptor-por-estudio.test.ts.
// Lo esperado sale del propio catálogo: cada interruptor nuevo no obliga a
// reescribir estas líneas (chocaban en cada PR que añadía uno).
const todosApagados = () => Object.fromEntries(Object.keys(INTERRUPTORES).map((k) => [k, false])) as Record<string, boolean>;
const soloEncendido = (k: string) => ({ ...todosApagados(), [k]: true });

test('apagado de serie; «estudios:» solo para esos', () => {
  assert.deepEqual(interruptoresDe('s1', {}), todosApagados());
  assert.deepEqual(interruptoresDe('s1', { CLIENTAS_FILTROS: 'estudios:s0' }), todosApagados());
  for (const [clave, variable] of Object.entries(INTERRUPTORES)) {
    assert.deepEqual(interruptoresDe('s1', { [variable]: 'estudios:s1' }), soloEncendido(clave), variable);
  }
});

test('guardia: las variables solo se leen en el servidor', () => {
  const ruta = readFileSync(new URL('../../app/api/estudio/interruptores/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, /process\.env/);
  const cliente = readFileSync(new URL('./interruptores-cliente.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cliente, /process\.env/);
});

test('si el navegador pregunta por otra sede que la de la sesión, no hay respuesta que recordar (409)', () => {
  const entorno = { CLIENTAS_FILTROS: 'estudios:s1' };
  assert.deepEqual(interruptoresPara('s1', 's1', entorno), soloEncendido('filtrosClientas'));
  assert.deepEqual(interruptoresPara('s1', null, entorno), soloEncendido('filtrosClientas'));
  assert.equal(interruptoresPara('s1', 's2', entorno), null, 'ni el «sí» de una sede bajo la otra');
  assert.equal(interruptoresPara('s2', 's1', { CLIENTAS_FILTROS: 'on' }), null, 'ni un «no» falso que se recuerde 30 min');
  const ruta = readFileSync(new URL('../../app/api/estudio/interruptores/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, /status: 409/);
});
