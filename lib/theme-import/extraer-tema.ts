// Extrae el color de marca DECLARADO por un tema importado, para precargar
// un tema NATIVO nuevo — la dirección contraria a enlazar-datos.ts (que
// escribe el dato real DENTRO del ZIP en cada petición). Aquí se lee el
// `default` tal cual lo trae el diseño, del HTML ORIGINAL sin enlazar
// (`contenidoFuenteDeFichero`, no `servirFicheroTema`): si se leyera la
// versión ya servida, `brand` ya habría sido sustituido por el color que el
// estudio tuviera guardado ANTES — se extraería el dato equivocado.
//
// Por qué solo el color, y no fotos ni texto (ver el pedido completo del
// fundador): las fotos de `<image-slot>` viven en R2 bajo el origen aislado
// del importador, sin URL pública estable fuera de él — copiarlas a donde
// vive de verdad la imagen de un tema nativo es un problema de migración de
// activos aparte, no una extracción de texto. Y `studioName` en el ZIP es un
// placeholder del diseño ("Estudio Alma"), no dato útil: el nombre real del
// estudio ya está en `studios.nombre`. El color de marca es lo único que es
// a la vez extraíble con certeza (contrato documentado, `data-props`) y
// directamente útil en un `ThemeConfig`.
//
// Mismo mecanismo de lectura que `enlazarPropsDeclarados` (el propio export
// declara sus props editables en `<script data-dc-script data-props="...">`),
// pero LEE en vez de escribir. Puro: nada de red ni de Supabase aquí.

import { hexARgb } from '../wcag-contrast.ts';

function decodificarEntidadesHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * El `default` de la prop `brand` declarada en `data-props`, si el HTML la
 * trae y su valor es un hex de verdad — `null` en cualquier otro caso (sin
 * `data-props`, sin `brand`, JSON roto, o un valor que no es un color). Nunca
 * lanza: un ZIP mal formado no puede tumbar la extracción, solo dejarla sin
 * nada que ofrecer.
 *
 * Es la señal MÁS precisa cuando existe (Claude Design declara así sus props
 * editables), pero es un contrato de un solo origen — la mayoría de ZIPs no
 * lo traen. `extraerColorDeMarca()`, más abajo, es la que de verdad se usa:
 * cae por dos heurísticas más generales antes de rendirse.
 */
export function extraerColorDeclarado(html: string): string | null {
  const m = /<script[^>]*\bdata-dc-script\b[^>]*\bdata-props="([^"]*)"[^>]*>/.exec(html);
  if (!m) return null;

  let props: Record<string, { default?: unknown }>;
  try {
    props = JSON.parse(decodificarEntidadesHtml(m[1]));
  } catch {
    return null;
  }
  if (!props || typeof props !== 'object') return null;

  const valor = props.brand?.default;
  if (typeof valor !== 'string') return null;
  return hexARgb(valor) ? valor : null;
}

// ── Heurísticas generales, para el resto de ZIPs (sin el contrato de arriba) ─
//
// Ningún export tool de terceros declara sus colores de la misma forma, así
// que en vez de perseguir nombres de variable concretos ("--brand",
// "--primary", "--acento"...) se usan dos señales que SÍ son casi
// universales en CSS moderno: los colores se declaran como custom
// properties (`--algo: #hex`, sea cual sea el nombre), y el de marca de
// verdad se USA en más de un sitio del documento — un gris de fondo también
// se declara como variable, pero el color de marca es el que además se
// repite en botones, acentos, iconos…

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const VAR_CSS_RE = /--[a-zA-Z0-9-]+\s*:\s*(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))\b/g;

function normalizarHex(hex: string): string {
  const limpio = hex.trim().toLowerCase();
  return limpio.length === 4 ? '#' + limpio.slice(1).split('').map((c) => c + c).join('') : limpio;
}

/**
 * Gris/blanco/negro de verdad: los tres canales prácticamente iguales. Un
 * color de marca, aunque sea oscuro o apagado (el verde oliva `#333B24` de
 * Tentada tiene una diferencia de 23 entre canales), siempre tiene alguno de
 * los tres claramente distinto — es lo que lo hace UN color y no un neutro.
 * El umbral es deliberadamente bajo (10, no ~24): un umbral alto clasificaba
 * como "neutro" colores de marca reales y apagados, que es precisamente el
 * caso que esta función existe para no perderse.
 */
function esNeutro(hex: string): boolean {
  const rgb = hexARgb(hex);
  if (!rgb) return true;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) < 10;
}

/**
 * De los colores declarados como variable CSS, el que además aparece más
 * veces usado en el resto del documento — declarado Y usado a la vez, sin
 * depender de qué nombre le puso el diseño a su variable.
 */
function extraerColorPorUso(html: string): string | null {
  const declarados = new Set<string>();
  for (const m of html.matchAll(VAR_CSS_RE)) {
    const hex = normalizarHex(m[1]);
    if (!esNeutro(hex)) declarados.add(hex);
  }
  if (declarados.size === 0) return null;

  const usos = new Map<string, number>();
  for (const m of html.matchAll(HEX_RE)) {
    const hex = normalizarHex(m[0]);
    if (declarados.has(hex)) usos.set(hex, (usos.get(hex) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let max = 0;
  for (const [hex, n] of usos) if (n > max) { max = n; mejor = hex; }
  // Ninguno de los declarados se repite fuera de su propia línea de
  // declaración (raro, pero posible): el primero que se declaró es mejor
  // que nada.
  return mejor ?? [...declarados][0]!;
}

/** Último recurso: el color no-neutro que más se repite en todo el
 *  documento, esté declarado como variable o no. */
function extraerColorMasFrecuente(html: string): string | null {
  const usos = new Map<string, number>();
  for (const m of html.matchAll(HEX_RE)) {
    const hex = normalizarHex(m[0]);
    if (esNeutro(hex)) continue;
    usos.set(hex, (usos.get(hex) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let max = 0;
  for (const [hex, n] of usos) if (n > max) { max = n; mejor = hex; }
  return mejor;
}

// Mismo valor que `DEFAULT_THEME.primary` (lib/theme-schema.ts) — congelado
// aquí a propósito, no importado: este módulo es puro (sin zod) y el valor
// no necesita seguir en sincronía con el default del tema al milímetro, solo
// ser un verde razonable si de verdad no hay ninguna pista mejor.
const COLOR_POR_DEFECTO = '#343825';

/**
 * El color de marca de un tema importado — NUNCA `null`. Tres pasadas, de
 * más a menos precisa: el contrato declarado, la variable CSS más usada, el
 * color no-neutro más frecuente, y si de verdad no hay ninguna pista, el
 * verde de fábrica. Un ZIP sin nada que ofrecer no bloquea a la propietaria
 * con un error — instala un borrador con un color por defecto, que se
 * cambia en dos clics una vez dentro del editor visual.
 */
export function extraerColorDeMarca(html: string): string {
  return extraerColorDeclarado(html) ?? extraerColorPorUso(html) ?? extraerColorMasFrecuente(html) ?? COLOR_POR_DEFECTO;
}
