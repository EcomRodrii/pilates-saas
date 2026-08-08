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

/**
 * La clave del catálogo público de un estudio. Vive aquí y no en el llamador
 * para que quien GUARDA y quien BORRA no puedan escribir dos cadenas distintas
 * — con dos literales sueltos, invalidar "funciona" sin borrar nada.
 */
export const claveCatalogoPublico = (studioId: string, liviano: boolean): string =>
  `catalogo-publico:${studioId}:${liviano ? 'liviano' : 'completo'}`;

/**
 * Tira el catálogo cacheado de uno o varios estudios, en sus dos variantes.
 *
 * ⚠️ Esto es lo que faltaba y por qué el fundador publicaba Noir y seguía
 * viendo Bloom: el tema publicado, los bloques y el orden del Inicio viajan
 * DENTRO de este catálogo, así que publicar escribía en la base de datos pero
 * el portal seguía sirviendo la copia anterior hasta un minuto. `publicar` es
 * un botón que promete "esto es lo que verán ahora": tenía que dejar de ser
 * verdad "dentro de un rato".
 *
 * ⚠️ Límite real, no resuelto aquí: este caché es un Map en memoria del
 * proceso. En Vercel, invalidar en la instancia que atendió el POST no toca
 * las demás instancias calientes, que seguirán con su copia hasta el TTL
 * (60s). Cerrarlo del todo pide un caché compartido (Redis) o dejar de
 * cachear el tema — decisión aparte. Lo que sí queda garantizado es que la
 * ventana pasa de "hasta 60s siempre" a "0s en el caso normal, hasta 60s si
 * la socia cae en otra instancia".
 */
export function invalidarCatalogoPublico(...studioIds: string[]): void {
  for (const id of studioIds) {
    if (!id) continue;
    cache.delete(claveCatalogoPublico(id, true));
    cache.delete(claveCatalogoPublico(id, false));
  }
}
