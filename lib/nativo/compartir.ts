// Compartir un texto con un enlace: qué camino se toma y cómo se lee su final.
// Puro (compartir.test.ts); lo usa `compartirTexto` en puente.ts.
//
//   · Dentro de la app → la hoja nativa de iOS (`@capacitor/share`).
//   · En un navegador con `navigator.share` (Safari de iOS, Chrome de Android)
//     → la hoja del sistema, la misma que usaría la alumna desde cualquier web.
//   · Sin ninguna de las dos (casi todo escritorio) → quien llama copia el
//     texto al portapapeles, como se hacía hasta ahora.

export type FormaDeCompartir = 'nativa' | 'web' | 'copiar';

export function formaDeCompartir(o: { nativa: boolean; hayWebShare: boolean }): FormaDeCompartir {
  if (o.nativa) return 'nativa';
  return o.hayWebShare ? 'web' : 'copiar';
}

/**
 * ¿Cerró la hoja sin elegir nada? No es un fallo: no se enseña ni se copia nada.
 * `navigator.share` lo dice con un `AbortError`; Capacitor, con «Share canceled».
 */
export function esCancelacion(e: unknown): boolean {
  if (e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError') return true;
  const mensaje = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /cancel/i.test(mensaje);
}

/** El texto que se copia cuando no hay hoja de compartir: frase y enlace juntos. */
export function textoParaCopiar(texto: string, url?: string | null): string {
  if (!url || texto.includes(url)) return texto;
  return `${texto}\n${url}`;
}
