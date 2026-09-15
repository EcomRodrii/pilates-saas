import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sociasQueHanVenido } from './han-venido.ts';

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `soc-${i}`);
}

test('una consulta por trozo de alumnas, no una por alumna', async () => {
  const trozos: string[][] = [];
  let unaAUna = 0;
  const vinieron = await sociasQueHanVenido(
    ids(120),
    async (parte) => { trozos.push(parte); return parte.filter((id) => id.endsWith('0')); },
    async () => { unaAUna++; return true; },
  );
  assert.deepEqual(trozos.map((t) => t.length), [50, 50, 20]);
  assert.equal(unaAUna, 0, 'sin corte no se pregunta alumna por alumna');
  assert.equal(vinieron.size, 12);
  assert.ok(vinieron.has('soc-10'));
  assert.ok(!vinieron.has('soc-11'), 'la que no sale no ha venido');
});

test('una alumna con varias clases asistidas cuenta una vez', async () => {
  const vinieron = await sociasQueHanVenido(
    ['a', 'b'],
    async () => ['a', 'a', 'a'],
    async () => { throw new Error('no debería preguntar'); },
  );
  assert.deepEqual([...vinieron], ['a']);
});

test('si la respuesta vuelve llena, las que no salieron se comprueban una a una', async () => {
  const preguntadas: string[] = [];
  const vinieron = await sociasQueHanVenido(
    ['a', 'b', 'c'],
    // Lleno (límite 3) con filas de «a»: «b» y «c» pueden haberse quedado fuera.
    async () => ['a', 'a', 'a'],
    async (id) => { preguntadas.push(id); return id === 'c'; },
    { limite: 3 },
  );
  assert.deepEqual(preguntadas.sort(), ['b', 'c']);
  assert.ok(vinieron.has('a'));
  assert.ok(!vinieron.has('b'));
  assert.ok(vinieron.has('c'), 'cortada por el límite, no por no haber venido');
});

test('sin alumnas no se consulta nada', async () => {
  let consultas = 0;
  const vinieron = await sociasQueHanVenido(
    [],
    async () => { consultas++; return []; },
    async () => { consultas++; return false; },
  );
  assert.equal(consultas, 0);
  assert.equal(vinieron.size, 0);
});

test('un error de la base no se traga: no se pinta a nadie como «primera clase» a ciegas', async () => {
  await assert.rejects(
    sociasQueHanVenido(['a'], async () => { throw new Error('boom'); }, async () => false),
    /boom/,
  );
});
