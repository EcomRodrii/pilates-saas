// Lo que cuesta una respuesta, con el `usage` que devuelve Anthropic. Puro.
//
// `input_tokens` es solo lo que NO salió de caché: el prompt entero es
// input + cache_read + cache_creation (cada uno a su precio).

import { PRECIOS_HAIKU_45 } from './modelo.ts';
import { MAX_CHARLAS_GRATIS_DIA } from './limites.ts';

export interface UsoAcumulado {
  input: number;
  output: number;
  cacheRead: number;
  /** Todo lo escrito en caché (5 min + 1 h): es lo que guarda `ia_consumos`. */
  cacheCreation: number;
  /** De eso, lo escrito con TTL de una hora (el prefijo, 2× en vez de 1,25×). Solo si hubo. */
  cacheCreation1h?: number;
}

export const USO_CERO: UsoAcumulado = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

interface UsoDeAnthropic {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  /** El desglose por TTL de lo escrito en caché. */
  cache_creation?: { ephemeral_1h_input_tokens?: number | null } | null;
}

export function sumarUso(a: UsoAcumulado, u: UsoDeAnthropic): UsoAcumulado {
  const unaHora = (a.cacheCreation1h ?? 0) + (u.cache_creation?.ephemeral_1h_input_tokens ?? 0);
  return {
    input: a.input + (u.input_tokens ?? 0),
    output: a.output + (u.output_tokens ?? 0),
    cacheRead: a.cacheRead + (u.cache_read_input_tokens ?? 0),
    cacheCreation: a.cacheCreation + (u.cache_creation_input_tokens ?? 0),
    ...(unaHora > 0 ? { cacheCreation1h: unaHora } : {}),
  };
}

/** Dólares, redondeados a la millonésima (la precisión de `ia_consumos.coste_usd`). */
export function costeUsd(u: UsoAcumulado): number {
  const p = PRECIOS_HAIKU_45;
  const unaHora = Math.min(u.cacheCreation1h ?? 0, u.cacheCreation);
  const usd = (u.input * p.entrada + u.output * p.salida + u.cacheRead * p.lecturaCache
    + (u.cacheCreation - unaHora) * p.escrituraCache + unaHora * p.escrituraCache1h) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/**
 * Las unidades que descontará `ia_cerrar_consulta` (la dueña de la fórmula, en
 * SQL). Esto es solo su espejo para los textos y las pruebas: 1 por cada 0,03 $
 * empezados, de 1 a 5.
 */
export function unidadesDe(usd: number): number {
  return Math.min(5, Math.max(1, Math.ceil(usd / 0.03)));
}

/**
 * Espejo de la regla de cobro de `ia_cerrar_consulta` (migr 20261006014513): una
 * respuesta solo gasta si ha usado al menos una herramienta de datos; la charla
 * es gratis mientras el estudio lleve menos de MAX_CHARLAS_GRATIS_DIA hoy. Lo
 * fallido o liberado, nunca. Solo para las pruebas y los textos: lo que se cobra
 * lo decide SIEMPRE el libro.
 */
export function unidadesACobrar(c: { estado: 'CONSUMIDA' | 'FALLIDA' | 'LIBERADA'; costeUsd: number; nHerramientas: number; charlasGratisHoy: number }): number {
  if (c.estado !== 'CONSUMIDA') return 0;
  if (c.nHerramientas === 0 && c.charlasGratisHoy < MAX_CHARLAS_GRATIS_DIA) return 0;
  return unidadesDe(c.costeUsd);
}
