// ¿Lo que se escribe en ⌘K parece una pregunta para Tentare? Entonces la fila
// «Preguntar a Tentare» va PRIMERA (§12.4: empieza por ¿ o por un
// interrogativo, acaba en ?, o tiene 4 palabras o más); si no, va al final y no
// le roba la navegación. Puro: se prueba con `node --test`.

const INTERROGATIVOS = new Set(['que', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'cual', 'cuales', 'como', 'cuando', 'donde', 'quien', 'quienes', 'por']);

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

export function pareceUnaPregunta(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  if (t.startsWith('¿') || t.endsWith('?')) return true;
  const palabras = sinTildes(t).split(/\s+/).filter(Boolean);
  if (palabras.length >= 4) return true;
  const primera = palabras[0];
  if (primera === 'por') return palabras[1] === 'que';
  return INTERROGATIVOS.has(primera);
}
