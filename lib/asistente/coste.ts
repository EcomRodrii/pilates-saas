// Lo que cuesta una respuesta, con el `usage` que devuelve Anthropic. Puro.
//
// `input_tokens` es solo lo que NO salió de caché: el prompt entero es
// input + cache_read + cache_creation (cada uno a su precio).

import { PRECIOS_HAIKU_45 } from './modelo.ts';

export interface UsoAcumulado {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export const USO_CERO: UsoAcumulado = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

interface UsoDeAnthropic {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function sumarUso(a: UsoAcumulado, u: UsoDeAnthropic): UsoAcumulado {
  return {
    input: a.input + (u.input_tokens ?? 0),
    output: a.output + (u.output_tokens ?? 0),
    cacheRead: a.cacheRead + (u.cache_read_input_tokens ?? 0),
    cacheCreation: a.cacheCreation + (u.cache_creation_input_tokens ?? 0),
  };
}

/** Dólares, redondeados a la millonésima (la precisión de `ia_consumos.coste_usd`). */
export function costeUsd(u: UsoAcumulado): number {
  const p = PRECIOS_HAIKU_45;
  const usd = (u.input * p.entrada + u.output * p.salida + u.cacheRead * p.lecturaCache + u.cacheCreation * p.escrituraCache) / 1_000_000;
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
