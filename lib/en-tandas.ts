// Como `Promise.all(lista.map(fn))`, pero con como mucho `tamano` llamadas a la vez: el mismo resultado y en el mismo
// orden. Para escrituras en lote contra PostgREST: un `Promise.all` sin cota abre tantas conexiones como elementos
// (cada upsert son dos consultas) y, con varios runs a la vez, agota el pool («Timed out acquiring connection from
// connection pool», PGRST003). Si una falla, la tanda en curso termina de lanzarse y el error se propaga como en
// `Promise.all`; las siguientes ya no se lanzan.
import { trocear } from './trocear.ts';

export async function enTandas<T, R>(lista: readonly T[], tamano: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let base = 0;
  for (const tanda of trocear(lista, tamano)) {
    out.push(...(await Promise.all(tanda.map((x, j) => fn(x, base + j)))));
    base += tanda.length;
  }
  return out;
}
