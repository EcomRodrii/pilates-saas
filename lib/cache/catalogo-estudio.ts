// Caché TTL en memoria para catálogos casi-estáticos consultados con mucha
// frecuencia (ver audit de rendimiento). NO es un paradigma nuevo tipo Next.js
// Cache Components/unstable_cache — theme-data.ts ya documentó por qué no se
// introduce eso aquí. Es solo un Map con expiración, para el caso concreto de
// datos que no tienen PII y son iguales para todo el que los pida (p.ej. el
// catálogo público de un estudio: clases, salas, planes...).
//
// En Vercel serverless esto solo acierta cuando dos invocaciones caen en la
// misma instancia caliente — no es una garantía, es "gratis cuando coincide".
// Nunca puede ser más lento que no tener caché (el fallo es un cache miss
// normal), así que el riesgo de introducirlo es mínimo.

interface Entrada<T> {
  data: T;
  expiraEn: number;
}

const cache = new Map<string, Entrada<unknown>>();

export const TTL_CATALOGO_MS = 60_000;

export async function conCacheCatalogo<T>(
  clave: string,
  cargar: () => Promise<T>,
  ttlMs: number = TTL_CATALOGO_MS,
): Promise<T> {
  const hit = cache.get(clave);
  if (hit && hit.expiraEn > Date.now()) return hit.data as T;

  const data = await cargar();
  cache.set(clave, { data, expiraEn: Date.now() + ttlMs });
  return data;
}

// Invalidación explícita — para cuando una escritura de staff cambia el
// catálogo (p.ej. editar un plan) y no queremos esperar al TTL.
export function invalidarCacheCatalogo(clave: string): void {
  cache.delete(clave);
}
