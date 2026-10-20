import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginarTodo, TAMANO_PAGINA } from './paginar-todo.ts';

type Fila = { id: number };
const tabla = (n: number): Fila[] => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

/** Cliente simulado: ordena por id (el orden estable) y sirve `range(from, to)`. */
function cliente(filas: () => Fila[], opts: { espera?: number; falla?: (desde: number) => string | null } = {}) {
  const log = { llamadas: 0, enVuelo: 0, maxEnVuelo: 0, desdes: [] as number[] };
  const pagina = async (from: number, to: number) => {
    log.llamadas++;
    log.desdes.push(from);
    log.enVuelo++;
    log.maxEnVuelo = Math.max(log.maxEnVuelo, log.enVuelo);
    // La foto se toma al LLEGAR la petición, como hace Postgres.
    const todas = filas();
    const foto = (opts.espera ? todas : [...todas].sort((a, b) => a.id - b.id)).slice(from, to + 1);
    if (opts.espera) await new Promise((r) => setTimeout(r, opts.espera));
    log.enVuelo--;
    const msg = opts.falla?.(from) ?? null;
    if (msg) return { data: null, error: { message: msg } };
    return { data: foto, error: null };
  };
  return { pagina, log };
}

const ids = (f: Fila[]) => f.map((x) => x.id);

test('N páginas: filas únicas, en orden y completas', async () => {
  const { pagina } = cliente(() => tabla(7_350));
  const r = await paginarTodo(pagina);
  assert.equal(r.error, null);
  assert.equal(r.data.length, 7_350);
  assert.deepEqual(ids(r.data), tabla(7_350).map((x) => x.id));
});

test('tabla vacía: data [] y sin error', async () => {
  const { pagina, log } = cliente(() => []);
  const r = await paginarTodo(pagina);
  assert.deepEqual(r, { data: [], error: null });
  assert.equal(log.llamadas, 1);
});

test('menos de una página: una sola petición', async () => {
  const { pagina, log } = cliente(() => tabla(999));
  const r = await paginarTodo(pagina);
  assert.equal(r.data.length, 999);
  assert.equal(log.llamadas, 1);
});

test('un múltiplo exacto de 1.000 no pierde ni duplica la última página', async () => {
  for (const n of [1_000, 2_000, 5_000, 9_000]) {
    const { pagina } = cliente(() => tabla(n));
    const r = await paginarTodo(pagina);
    assert.equal(r.error, null, `n=${n}`);
    assert.equal(r.data.length, n, `n=${n}`);
    assert.equal(new Set(ids(r.data)).size, n, `n=${n}`);
  }
});

test('una página que falla a mitad: error y solo las páginas anteriores, nada después', async () => {
  const { pagina } = cliente(() => tabla(9_500), {
    falla: (desde) => (desde === 3 * TAMANO_PAGINA ? 'boom' : null),
  });
  const r = await paginarTodo(pagina);
  assert.deepEqual(r.error, { message: 'boom' });
  // Páginas 0, 1 y 2 (las anteriores a la fallida), en orden y sin huecos.
  assert.deepEqual(ids(r.data), tabla(3_000).map((x) => x.id));
});

test('el fallo de la primera página devuelve [] y el error', async () => {
  const { pagina } = cliente(() => tabla(5_000), { falla: () => 'sin permiso' });
  const r = await paginarTodo(pagina);
  assert.deepEqual(r, { data: [], error: { message: 'sin permiso' } });
});

test('alFallar se llama una vez con la página que falló', async () => {
  const { pagina } = cliente(() => tabla(6_000), { falla: (d) => (d === 2_000 ? 'x' : null) });
  const avisos: Array<[string, number, boolean]> = [];
  await paginarTodo(pagina, { alFallar: (e, d, rein) => avisos.push([e.message, d, rein]) });
  assert.deepEqual(avisos, [['x', 2_000, false]]);
});

test('un 504 transitorio en una página se reintenta y la carga sale completa', async () => {
  let fallos = 1;
  const base = cliente(() => tabla(4_200));
  const pagina = async (from: number, to: number) => {
    if (from === 2_000 && fallos-- > 0) return { data: null, error: { message: 'Gateway Timeout' } };
    return base.pagina(from, to);
  };
  const r = await paginarTodo(pagina);
  assert.equal(r.error, null);
  assert.equal(r.data.length, 4_200);
});

test('una excepción de la consulta se propaga como antes', async () => {
  const pagina = async (from: number) => {
    if (from >= 2_000) throw new Error('red caída');
    return { data: tabla(1_000), error: null };
  };
  await assert.rejects(() => paginarTodo(pagina), /red caída/);
});

test('con orden estable, escrituras entre páginas no repiten ni omiten filas leídas', async () => {
  let datos = tabla(6_000);
  const base = cliente(() => datos);
  let n = 0;
  const pagina = async (from: number, to: number) => {
    const r = await base.pagina(from, to);
    // Entre petición y petición entra una fila NUEVA con id mayor (el orden por
    // id la deja al final, así que no desplaza a ninguna ya leída).
    if (++n === 2) datos = [...datos, { id: 99_999 }];
    return r;
  };
  const r = await paginarTodo(pagina);
  assert.equal(new Set(ids(r.data)).size, r.data.length, 'ningún id repetido');
  assert.deepEqual(ids(r.data).slice(0, 6_000), tabla(6_000).map((x) => x.id));
});

test('sin orden estable el mismo escenario SÍ repite filas (por qué el orden es obligatorio)', async () => {
  // Orden de inserción con una fila que se borra antes de la 2.ª página: las
  // siguientes se desplazan y una se omite. Documenta el fallo que el
  // `.order('id')` evita.
  let datos = tabla(3_000);
  const pagina = async (from: number, to: number) => {
    const r = { data: datos.slice(from, to + 1), error: null };
    if (from === 0) datos = datos.filter((f) => f.id !== 1);
    return r;
  };
  const r = await paginarTodo(pagina, { concurrencia: 1 });
  assert.ok(!ids(r.data).includes(1001), 'la fila 1001 se omite');
});

test('concurrencia acotada a 4 y mucho menos tiempo que en serie', async () => {
  const ESPERA = 20;
  const t21 = tabla(21_000); // ya ordenada: el coste medido es la latencia, no el sort
  const serie = cliente(() => t21, { espera: ESPERA });
  const t0 = Date.now();
  await paginarTodo(serie.pagina, { concurrencia: 1 });
  const tSerie = Date.now() - t0;

  const par = cliente(() => t21, { espera: ESPERA });
  const t1 = Date.now();
  const r = await paginarTodo(par.pagina);
  const tPar = Date.now() - t1;

  assert.equal(r.data.length, 21_000);
  assert.ok(par.log.maxEnVuelo <= 4, `máx en vuelo ${par.log.maxEnVuelo}`);
  assert.ok(par.log.maxEnVuelo > 1);
  assert.ok(tPar < tSerie * 0.5, `paralelo ${tPar} ms vs serie ${tSerie} ms`);
});
