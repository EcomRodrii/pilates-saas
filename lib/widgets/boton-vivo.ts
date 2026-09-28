// El botón que abre la ventana (método «Popup»), en vivo: Fase D del
// constructor de widgets (29-sep-2026).
//
// El código NUEVO de un popup sin diseño propio pinta su botón con variables
// CSS y un respaldo: `background:var(--tentare-boton,#343825)`. El respaldo es
// el color de cuando se copió; el valor de ahora lo pone `widget-popup.js` al
// cargar, con UNA regla `<style>` por estudio que pide a
// `/api/public/widget-boton`. Así el botón sigue el estilo de sus widgets sin
// volver a pegar nada, como ya hacía lo de DENTRO de la ventana.
//
// ⚠️ Esto va DENTRO de `widget-popup.js`, que se descarga en todas las páginas
// de la web del estudio: nada pesado. Solo el tipo de las esquinas (se borra al
// compilar) y la puerta de URLs del propio runtime (./popup-url.ts), que ya
// iba en el script.
//
// ⚠️ Y es lo ÚNICO que escribe CSS en la web del estudio a partir de una
// respuesta de red: todo se valida aquí, con listas cerradas (hex y el enum de
// las esquinas). Lo que no encaja no se pinta, y se queda el respaldo.

import type { FormaWeb } from '../reservar/estilo-web-tipos.ts';
import { urlPopupPermitida } from './popup-url.ts';

/** Lo que pide el runtime: el botón de ESE estudio, como se ve hoy. */
export const RUTA_BOTON_VIVO = '/api/public/widget-boton';

/** Las tres variables que lee el código del popup (y las únicas que escribe la regla). */
export const VAR_FONDO = '--tentare-boton';
export const VAR_TEXTO = '--tentare-boton-texto';
export const VAR_RADIO = '--tentare-boton-radio';

/** Un slug de `/reservar/<slug>`: el mismo juego de caracteres que deja pasar ./popup-url.ts. */
export const SLUG_POPUP = /^[A-Za-z0-9-]{1,100}$/;

/**
 * El radio del botón por cada «Esquinas» del estilo de su web: los MISMOS que
 * pinta la ventana por dentro (`FORMA_RADIOS[x].boton`,
 * lib/reservar/apariencia-widget.ts; un test los ata). Copiados y no
 * importados: aquel módulo arrastra el catálogo de fuentes, y esto va en el
 * script que carga toda su web.
 */
export const RADIO_BOTON: Readonly<Record<FormaWeb, string>> = Object.freeze({
  pill: '999px',
  redondeado: '13px',
  recto: '6px',
});

const FORMAS = Object.keys(RADIO_BOTON) as FormaWeb[];

/** Con o sin forma corta, sin alfa: es lo que emite el servidor y lo único que se pinta. */
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface BotonVivo {
  fondo: string;
  texto: string;
  esquinas: FormaWeb;
}

/**
 * Lo que llega de la red (o lo que calcula el panel), validado ENTERO: fondo y
 * texto en hex, las esquinas del enum. Cualquier otra cosa → `null`, y el botón
 * se queda con su respaldo. Devuelve un objeto nuevo: una clave de más no viaja.
 */
export function leerBotonVivo(crudo: unknown): BotonVivo | null {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const { fondo, texto, esquinas } = crudo as Record<string, unknown>;
  if (typeof fondo !== 'string' || !HEX.test(fondo)) return null;
  if (typeof texto !== 'string' || !HEX.test(texto)) return null;
  if (typeof esquinas !== 'string' || !(FORMAS as string[]).includes(esquinas)) return null;
  return { fondo, texto, esquinas: esquinas as FormaWeb };
}

/**
 * ¿Lee este `style` las variables? Solo los códigos de la Fase D. Los de antes
 * y los de diseño propio llevan colores literales: no hay nada que pedir.
 *
 * Con la doble declaración (el hex y después el `var()`) sigue viéndolas; si un
 * filtro de HTML se comió las declaraciones con `var()` (KSES de un WordPress
 * sin `unfiltered_html`), da `false`, no se pide nada y se queda el literal.
 */
export function usaBotonVivo(style: string | null): boolean {
  return !!style?.includes(`var(${VAR_FONDO}`);
}

/**
 * El slug del estudio de un `data-tentare-popup` que el runtime abriría
 * (`urlPopupPermitida`: solo `/reservar/<slug>` en el mismo origen que el
 * script, con el apex como `www`). `null` si no lo abriría, o si es la vista
 * previa del panel (`vista-previa=1`): esa se pinta con el borrador, no con lo
 * publicado.
 */
export function slugDePopup(cruda: string | null, origen: string): string | null {
  const url = urlPopupPermitida(cruda, origen);
  if (!url) return null;
  const u = new URL(url);
  if (u.searchParams.get('vista-previa') === '1') return null;
  const slug = u.pathname.slice('/reservar/'.length);
  return SLUG_POPUP.test(slug) ? slug : null;
}

/**
 * La regla que pinta los botones de ESE estudio en la página:
 * `[data-tentare-popup*="/reservar/<slug>?"]{--tentare-boton:…}`. Una regla y
 * no una propiedad por botón: llega también a los que aparecen después, y dos
 * estudios en la misma página (una cadena con dos sedes) no se pisan.
 *
 * `null` si el slug o los colores no validan. Se revalida aquí aunque quien
 * llama ya lo haya hecho: es lo único que escribe CSS, y un `"` en el slug o un
 * `;}` en un color saldría del selector o de la declaración.
 */
export function cssBotonVivo(slug: string, b: BotonVivo): string | null {
  if (!SLUG_POPUP.test(slug)) return null;
  const v = leerBotonVivo(b);
  if (!v) return null;
  return `[data-tentare-popup*="/reservar/${slug}?"]{${VAR_FONDO}:${v.fondo};${VAR_TEXTO}:${v.texto};${VAR_RADIO}:${RADIO_BOTON[v.esquinas]}}`;
}
