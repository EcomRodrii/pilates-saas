// Extrae TODO lo que se pueda leer con confianza de un tema importado, para
// precargar un tema NATIVO nuevo — la dirección contraria a
// enlazar-datos.ts (que escribe el dato real DENTRO del ZIP en cada
// petición). Aquí se lee el `default` tal cual lo trae el diseño, del HTML
// ORIGINAL sin enlazar (`contenidoFuenteDeFichero`, no `servirFicheroTema`):
// si se leyera la versión ya servida, `brand` ya habría sido sustituido por
// el color que el estudio tuviera guardado ANTES — se extraería el dato
// equivocado.
//
// Pedido explícito, tras ver que el primer intento ("solo el color") dejaba
// el resultado irreconocible frente al ZIP subido: "extrae todo, hasta lo
// más mínimo". Lo que SÍ se extrae ahora — colores (primario y secundario),
// texto (titular/subtítulo/CTA/"sobre nosotros") e imagen de portada, todo
// del mismo contrato documentado (`data-props`) que ya se usaba solo para el
// color. `studioName` sigue fuera a propósito: es un placeholder del diseño
// ("Estudio Alma"), no dato útil — el nombre real ya está en `studios.nombre`.
//
// Mismo mecanismo de lectura que `enlazarPropsDeclarados` (el propio export
// declara sus props editables en `<script data-dc-script data-props="...">`,
// uno por componente editable — portada, "sobre nosotros", CTA…, no uno solo
// para el color), pero LEE en vez de escribir. Puro: nada de red ni de
// Supabase aquí.

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

// ── El resto del contrato: segundo color, texto e imagen de portada ────────
// Todo del MISMO `data-props` que ya se usaba solo para `brand` — Claude
// Design declara un `<script data-dc-script>` por componente editable
// (portada, "sobre nosotros", CTA…), no uno solo para el color entero del
// diseño. Se combinan TODOS los que haya en el documento, no solo el
// primero.

interface PropDeclarada { editor?: string; default?: unknown }

/** Todas las props de todos los `data-dc-script` del documento, combinadas —
 *  si un nombre se repite en más de un bloque, gana la primera declaración. */
function todasLasPropsDeclaradas(html: string): Record<string, PropDeclarada> {
  const combinado: Record<string, PropDeclarada> = {};
  const re = /<script[^>]*\bdata-dc-script\b[^>]*\bdata-props="([^"]*)"[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    let props: unknown;
    try {
      props = JSON.parse(decodificarEntidadesHtml(m[1]));
    } catch {
      continue; // un bloque roto no tumba a los demás
    }
    if (!props || typeof props !== 'object') continue;
    for (const [nombre, valor] of Object.entries(props as Record<string, unknown>)) {
      if (!(nombre in combinado)) combinado[nombre] = valor as PropDeclarada;
    }
  }
  return combinado;
}

/** El segundo color declarado — cualquier prop `editor: 'color'` que no sea
 *  `brand` (el primario, ya cubierto por `extraerColorDeclarado`). */
function extraerSegundoColor(props: Record<string, PropDeclarada>): string | null {
  for (const [nombre, p] of Object.entries(props)) {
    if (nombre === 'brand') continue;
    if (p.editor === 'color' && typeof p.default === 'string' && hexARgb(p.default)) return p.default;
  }
  return null;
}

/** La primera imagen declarada con URL externa de verdad (http/https) — las
 *  de `<image-slot>` que apuntan dentro del propio ZIP (rutas relativas, o al
 *  origen aislado del importador) se descartan: no tienen URL pública fuera
 *  de ese sandbox, así que copiarlas es un problema de migración de activos
 *  aparte, no de lectura de texto. */
function extraerImagenDeclarada(props: Record<string, PropDeclarada>): string | null {
  for (const p of Object.values(props)) {
    if (p.editor !== 'image') continue;
    if (typeof p.default === 'string' && /^https?:\/\//i.test(p.default)) return p.default;
  }
  return null;
}

/**
 * Candidatos de texto: (nombre de la prop, valor) para las que tengan un
 * `default` de tipo string, no vacío, que no sea ni un color ni una imagen
 * ni `studioName` (placeholder del diseño).
 */
function candidatosDeTexto(props: Record<string, PropDeclarada>): { nombre: string; valor: string }[] {
  const candidatos: { nombre: string; valor: string }[] = [];
  for (const [nombre, p] of Object.entries(props)) {
    if (nombre === 'studioName') continue;
    const v = p.default;
    if (typeof v !== 'string') continue;
    const limpio = v.trim();
    if (!limpio || hexARgb(limpio) || /^https?:\/\//i.test(limpio)) continue;
    candidatos.push({ nombre, valor: limpio });
  }
  return candidatos;
}

// Mismos límites que sus campos en lib/theme-schema.ts — copiados, no
// importados: este módulo es puro (sin zod) para poder testearse solo.
const MAX_CTA = 28;
const MAX_TITULAR = 70;
const MAX_SUBTITULO = 160;
const MAX_SOBRE_TITULO = 60;
const MAX_SOBRE_TEXTO = 600;

/** Los cinco huecos de texto de /reservar, de más corto a más largo — el
 *  orden en el que el RELLENO POR LONGITUD (el respaldo, ver más abajo)
 *  reparte lo que el nombre de la prop no supo clasificar. */
const HUECOS_TEXTO = [
  { campo: 'reservarCta', max: MAX_CTA },
  { campo: 'reservarTitular', max: MAX_TITULAR },
  { campo: 'reservarSubtitulo', max: MAX_SUBTITULO },
  { campo: 'reservarSobreTitulo', max: MAX_SOBRE_TITULO },
  { campo: 'reservarSobreTexto', max: MAX_SOBRE_TEXTO },
] as const;

/**
 * El nombre de una prop es, de lejos, la señal más fuerte de qué es —
 * "quienesSomos" es un título de sección corto (3 palabras) SIEMPRE, nunca un
 * botón, aunque por longitud pura empate con uno.
 *
 * ⚠️ El ORDEN es la parte que importa, y de la más específica a la más
 * genérica — si no, un nombre compuesto matchea con el patrón equivocado
 * porque lo contiene como subcadena: "subtitulo" contiene "titulo", y
 * "sobreTitulo"/"sobreTexto" contienen "sobre" Y ("titulo" o "texto") a la
 * vez. Comprobar los compuestos (líneas 2-4) antes que los genéricos sueltos
 * (línea 5, el catch-all de "título") es lo que evita que "sobreTitulo"
 * acabe clasificado como titular en vez de como título de "sobre nosotros".
 */
const PATRONES_CAMPO: { patron: RegExp; campo: (typeof HUECOS_TEXTO)[number]['campo'] }[] = [
  { patron: /bot[oó]n|\bcta\b|llamada|accion|action|button/i, campo: 'reservarCta' },
  { patron: /subt[ií]tulo|subtitle|tagline|eyebrow/i, campo: 'reservarSubtitulo' },
  { patron: /sobre.*texto|descripcion|parrafo|cuerpo|\btexto\b|body|description|copy/i, campo: 'reservarSobreTexto' },
  { patron: /sobre|about|quien|nosotros/i, campo: 'reservarSobreTitulo' },
  { patron: /t[ií]tulo|titular|heading|headline|^title$/i, campo: 'reservarTitular' },
];

function truncar(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Reparte los candidatos de texto entre los cinco campos de /reservar en DOS
 * pasadas:
 *
 *  1. Por NOMBRE de la prop (`PATRONES_CAMPO`) — la señal fuerte: un diseño
 *     que declara "quienesSomos"/"ctaTexto" ya está diciendo qué es cada
 *     cosa, y adivinar por longitud en vez de leerlo sería peor que no
 *     adivinar. Solo el PRIMER candidato que matchea cada patrón se usa —
 *     los siguientes con el mismo patrón se ignoran para no pisar el hueco.
 *  2. Lo que sobra (nombres sin patrón reconocido, o cuyo hueco ya lo ocupó
 *     otro por nombre) se reparte por LONGITUD entre los huecos que sigan
 *     vacíos, de más corto a más largo — el respaldo para diseños que no
 *     nombran sus props de forma reconocible.
 *
 * Con menos candidatos que huecos, el resto se queda vacío — un titular sin
 * "sobre nosotros" es mejor que forzar el hueco con el candidato equivocado.
 * Es una apuesta razonable, no una certeza: por eso esto instala un
 * BORRADOR, nunca se publica solo — se revisa antes de publicar, igual que
 * el color.
 */
function repartirTextos(candidatos: { nombre: string; valor: string }[]): Record<string, string> {
  const resultado: Record<string, string> = {
    reservarTitular: '', reservarSubtitulo: '', reservarCta: '',
    reservarSobreTitulo: '', reservarSobreTexto: '',
  };
  const ocupados = new Set<string>();
  const sinClasificar: string[] = [];

  for (const { nombre, valor } of candidatos) {
    const regla = PATRONES_CAMPO.find(({ patron }) => patron.test(nombre));
    if (regla && !ocupados.has(regla.campo)) {
      resultado[regla.campo] = valor;
      ocupados.add(regla.campo);
    } else {
      sinClasificar.push(valor);
    }
  }

  const huecosVacios = HUECOS_TEXTO.filter(({ campo }) => !ocupados.has(campo));
  sinClasificar.sort((a, b) => a.length - b.length);
  const n = Math.min(sinClasificar.length, huecosVacios.length);
  for (let i = 0; i < n; i++) {
    const esUltimoHueco = i === huecosVacios.length - 1;
    const valor = esUltimoHueco ? sinClasificar[sinClasificar.length - 1]! : sinClasificar[i]!;
    resultado[huecosVacios[i]!.campo] = valor;
  }

  for (const { campo, max } of HUECOS_TEXTO) resultado[campo] = truncar(resultado[campo]!, max);
  return resultado;
}

export interface ContenidoExtraido {
  primary: string;
  secondary: string | null;
  imagenUrl: string | null;
  reservarTitular: string;
  reservarSubtitulo: string;
  reservarCta: string;
  reservarSobreTitulo: string;
  reservarSobreTexto: string;
}

/**
 * Todo lo que "Extraer a tema nativo" precarga — colores, texto e imagen de
 * portada, del mismo contrato `data-props` que ya usaba el color en
 * solitario. Nunca lanza y nunca deja un campo a medias: lo que no se puede
 * asignar con confianza se queda vacío (el comportamiento de fábrica de cada
 * campo), no con basura.
 */
export function extraerContenidoDeMarca(html: string): ContenidoExtraido {
  const props = todasLasPropsDeclaradas(html);
  const textos = repartirTextos(candidatosDeTexto(props));
  return {
    primary: extraerColorDeMarca(html),
    secondary: extraerSegundoColor(props),
    imagenUrl: extraerImagenDeclarada(props),
    reservarTitular: textos.reservarTitular!,
    reservarSubtitulo: textos.reservarSubtitulo!,
    reservarCta: textos.reservarCta!,
    reservarSobreTitulo: textos.reservarSobreTitulo!,
    reservarSobreTexto: textos.reservarSobreTexto!,
  };
}
