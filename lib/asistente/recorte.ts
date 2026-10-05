// Lo que vuelve de una herramienta al modelo, acotado: ≤ 20 filas por lista
// (con `total` y `truncado: true`) y ≤ 9.000 caracteres en total. Nunca se
// corta un objeto a medias: se quitan filas enteras del final hasta que cabe.
// Puro: se prueba con `node --test`.

import { MAX_CHARS_CAMPO, MAX_CHARS_RESULTADO, MAX_FILAS } from './limites.ts';

/** Un texto que viene de los datos (nombre de clase, sala, plan…): corto, sin saltos ni corchetes. */
export function campo(texto: string | null | undefined): string {
  const limpio = (texto ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[[\]]/g, '').trim();
  return limpio.length > MAX_CHARS_CAMPO ? `${limpio.slice(0, MAX_CHARS_CAMPO - 1)}…` : limpio;
}

/** Las listas de primer nivel se cortan a `MAX_FILAS` y se apunta cuántas había. */
export function recortarResultado(valor: unknown, maxChars = MAX_CHARS_RESULTADO): string {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    const s = JSON.stringify(valor ?? null);
    return s.length <= maxChars ? s : JSON.stringify({ truncado: true });
  }
  const obj: Record<string, unknown> = { ...(valor as Record<string, unknown>) };
  const listas: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!Array.isArray(v)) continue;
    listas.push(k);
    if (v.length > MAX_FILAS) {
      obj[k] = v.slice(0, MAX_FILAS);
      obj[`${k}_total`] = v.length;
      obj.truncado = true;
    }
  }
  let s = JSON.stringify(obj);
  // Si aún no cabe, filas enteras fuera, empezando por la lista más larga.
  while (s.length > maxChars) {
    const k = listas
      .filter(l => (obj[l] as unknown[]).length > 0)
      .sort((a, b) => (obj[b] as unknown[]).length - (obj[a] as unknown[]).length)[0];
    if (!k) return JSON.stringify({ truncado: true });
    const lista = obj[k] as unknown[];
    if (obj[`${k}_total`] === undefined) obj[`${k}_total`] = lista.length;
    obj[k] = lista.slice(0, lista.length - 1);
    obj.truncado = true;
    s = JSON.stringify(obj);
  }
  return s;
}
