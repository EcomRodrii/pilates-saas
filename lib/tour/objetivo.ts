// ─────────────────────────────────────────────────────────────────────────────
// Cuándo lo que señala un paso «no está», y cuándo eso es un fallo de la visita.
//
// Si no aparece en `ESPERA_OBJETIVO_MS`, la tarjeta lo dice («No encuentro el
// recuadro…») y ofrece «Llévame». Pero solo se avisa a Sentry de lo que NUNCA
// llegó a verse en el paso: eso es un selector roto o una pantalla que no lo
// pinta. Lo que se vio y se fue lo ha movido la persona (pulsó la fila, se fue a
// otra pantalla y el aviso corría antes que el cambio de ruta): no es un fallo, y
// avisar de ello llenaba Sentry de falsos (JAVASCRIPT-NEXTJS-3J, oct-2026).
//
// Puro y sin React: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export const ESPERA_OBJETIVO_MS = 8_000;

export interface RastroObjetivo {
  /** Se ha visto al menos una vez desde que empezó a buscarse. */
  visto: boolean;
  /** Desde cuándo no está (al empezar, desde el principio). `null` = está. */
  faltaDesde: number | null;
}

export function empezarRastro(ahora: number): RastroObjetivo {
  return { visto: false, faltaDesde: ahora };
}

/**
 * Lo que toca tras medir. `sinFoco`: la tarjeta dice que no lo encuentra.
 * `avisar`: además es un fallo de la visita (nunca se vio), y va a Sentry.
 */
export function medirRastro(r: RastroObjetivo, esta: boolean, ahora: number): { rastro: RastroObjetivo; sinFoco: boolean; avisar: boolean } {
  if (esta) return { rastro: { visto: true, faltaDesde: null }, sinFoco: false, avisar: false };
  const faltaDesde = r.faltaDesde ?? ahora;
  const sinFoco = ahora - faltaDesde > ESPERA_OBJETIVO_MS;
  return { rastro: { visto: r.visto, faltaDesde }, sinFoco, avisar: sinFoco && !r.visto };
}
