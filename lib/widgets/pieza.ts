// El código del widget por ID (30-sep-2026) — la parte que carga también el
// bundle sin marco (app/widget-bundle/main.tsx).
//
// Un código nuevo no lleva el contenido del widget: lleva `w=<id>` en la URL
// (dentro de una página, encima, botón y enlace) o `data-widget="<id>"` sin
// marco, y lo publicado de ese widget vive en `widget_piezas`. Así, cambiar qué
// clases se ven o el precio no obliga a volver a pegarlo: basta «Aplicar en mi
// web». Lo que va en el propio HTML (el ancho, la carga diferida, el texto del
// botón…) sigue pidiendo pegarlo otra vez, y el constructor lo dice.
//
// ⚠️ Lo publicado MANDA en todo lo que la página lee del código (`CLAVES_FIRMA`):
// lo que el código pegado traiga de eso se descarta. Así la versión que ve
// «Visto en» es exactamente la publicada, y un código retocado a mano no puede
// mezclarse a medias con ella. Lo demás (`data-studio`, `embed`, `ventana`,
// `utm_*`…) pasa tal cual.
//
// Solo importa ./firma-contenido.ts: el bundle no tiene por qué arrastrar el
// generador de código (eso vive en ./pieza-destino.ts, solo servidor).

import { CLAVES_FIRMA } from './firma-contenido.ts';

/** El parámetro de la URL que lleva el id. */
export const PARAM_PIEZA = 'w';

/** 10 caracteres base62: lo que genera el servidor y lo que exige la tabla. */
export const ID_PIEZA = /^[A-Za-z0-9]{10}$/;

export function esIdPieza(v: unknown): v is string {
  return typeof v === 'string' && ID_PIEZA.test(v);
}

const CLAVES: ReadonlySet<string> = new Set(CLAVES_FIRMA);

/** Un par del vocabulario del código, ya validado: `[nombre-en-kebab, valor]`. */
export type ParPieza = [string, string];

const aCamel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const CLAVES_CAMEL: ReadonlySet<string> = new Set([...CLAVES_FIRMA].map(aCamel));

/**
 * El `dataset` de la nativa con lo publicado encima: fuera todo lo que la
 * página lee (y el propio `data-widget`), dentro los pares publicados. Queda
 * con los nombres en camelCase, como los da `dataset`, para que el resto del
 * bundle lo lea igual que siempre (`fuenteDeDataset`).
 */
export function datasetConPares(
  dataset: Readonly<Record<string, string | undefined>>,
  pares: readonly (readonly [string, string])[],
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(dataset)) {
    if (k === 'widget' || CLAVES_CAMEL.has(k)) continue;
    out[k] = v;
  }
  for (const [k, v] of pares) {
    if (CLAVES.has(k)) out[aCamel(k)] = v;
  }
  return out;
}

const MAX_PARES = 64;
const MAX_VALOR = 2000;

/**
 * La respuesta de `/api/public/widget-pieza` → los pares, o `null` si no tiene
 * la forma esperada (y entonces el widget se pinta como si no hubiera id). Un
 * nombre que no es del vocabulario se ignora: el servidor nunca lo manda, y
 * si lo hiciera no tendría a quién decirle nada.
 */
export function leerParesPieza(raw: unknown): ParPieza[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const lista = (raw as { pares?: unknown }).pares;
  if (!Array.isArray(lista) || lista.length > MAX_PARES) return null;
  const out: ParPieza[] = [];
  for (const par of lista) {
    if (!Array.isArray(par) || par.length !== 2) return null;
    const [k, v] = par as unknown[];
    if (typeof k !== 'string' || typeof v !== 'string' || v.length > MAX_VALOR) return null;
    if (CLAVES.has(k)) out.push([k, v]);
  }
  return out;
}
