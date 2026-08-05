// ═══════════════════════════════════════════════════════════════════════════
// Motor de campos — el panel de configuración sale del schema, no del JSX
// ═══════════════════════════════════════════════════════════════════════════
//
// Hoy la forma de cada bloque está CUADRUPLICADA: la interface TS
// (lib/portal-home-bloques.ts), el zod (lib/layout-schema.ts), el formulario
// del editor (components/theme/portal-bloques-editor.tsx, siete componentes a
// mano) y el render (components/portal/bloque-home-render.tsx). Añadir un
// campo obliga a tocar los cuatro, y nada garantiza que no se desincronicen.
//
// Este módulo es la fuente única: un array de `CampoSchema` describe un
// bloque, y de ahí se derivan el tipo TS (`ConfigDe`), el zod
// (lib/theme/campos-zod.ts) y el formulario (components/theme/inspector/).
//
// PURO A PROPÓSITO — sin React y sin zod, igual que lib/portal-home-bloques.ts
// (ver su comentario de cabecera): lo importan las tres vistas del portal, y
// arrastrar zod o componentes ahí engordaría el bundle de la app de socias.
// El zod vive en un módulo aparte; los controles, en components/.
//
// Dos reglas que vienen de errores ya cometidos en este repo:
//
//  · `resolverConfig` NUNCA pisa un valor guardado, ni siquiera `''`, `false`
//    o `0`. Rellenar un vacío "porque parece vacío" borraría un texto que la
//    propietaria dejó en blanco a propósito.
//  · `defaultsDe` CLONA arrays y objetos en cada llamada. Devolver la misma
//    referencia haría que dos bloques FAQ compartieran su array de preguntas
//    — el mismo bug de spread superficial que ya mordió en `instalar()` con
//    `variantes`/`radioTema` (ver theme-library.tsx).

/** Una opción de un campo `opciones`/`select`. */
export interface OpcionCampo {
  id: string;
  label: string;
  /** Nombre de icono lucide-react, NO el componente — este módulo es puro. */
  icono?: string;
}

/** Validadores con nombre. Datos, no funciones: la condición viaja en JSON. */
export type NombreValidador = 'href' | 'videoEmbed' | 'hex';

/**
 * Condición sobre los valores del MISMO objeto de config.
 *
 * Un solo lenguaje para dos usos que hoy están escritos por separado y se
 * contradicen en silencio: qué campos enseña el Inspector (`visibleSi`) y
 * cuándo un bloque está incompleto (`completoSi`, que hoy vive duplicado
 * entre `bloqueEstaCompleto` y los `return null` de cada componente de
 * render).
 */
export type CondicionCampo =
  | { campo: string; igual: string | number | boolean }
  | { campo: string; distinto: string | number | boolean }
  /** Cadena no vacía tras `trim()`, o array con al menos un elemento. */
  | { campo: string; noVacio: true }
  | { campo: string; valido: NombreValidador }
  /** Solo para campos `lista`: al menos N elementos. */
  | { campo: string; minimo: number }
  | { todas: readonly CondicionCampo[] }
  | { alguna: readonly CondicionCampo[] };

interface CampoBase<T extends string> {
  tipo: T;
  /**
   * Clave dentro de `config`. **Es lo que se persiste en el jsonb**: renombrar
   * un `id` es una migración de datos, no un refactor. Ver la regla de
   * `obsoleto` más abajo.
   */
  id: string;
  etiqueta: string;
  /** Texto de apoyo bajo el control. */
  ayuda?: string;
  marcador?: string;
  /**
   * Oculta el control cuando la condición no se cumple. NUNCA borra el valor
   * guardado: un campo que deja de verse conserva su contenido por si la
   * propietaria vuelve atrás.
   */
  visibleSi?: CondicionCampo;
  /**
   * Deja de pintarse, pero el zod lo sigue aceptando y el dato sobrevive.
   * **Nunca borres un campo de un schema**: al reescribir, zod poda las claves
   * que no conoce y se perdería contenido de la propietaria en silencio.
   */
  obsoleto?: true;
}

export type CampoSchema =
  | (CampoBase<'texto'> & { porDefecto: string; maxLargo?: number })
  | (CampoBase<'textoLargo'> & { porDefecto: string; maxLargo?: number; filas?: number })
  | (CampoBase<'url'> & { porDefecto: string })
  | (CampoBase<'imagen'> & { porDefecto: string })
  | (CampoBase<'color'> & { porDefecto: string })
  /** Hex NULLABLE: `null` = "hereda del tema" (ver ColorFieldMini). */
  | (CampoBase<'colorHeredado'> & { porDefecto: null })
  /** Fila de botones — para 2-4 valores. El PRIMERO es el aspecto de hoy. */
  | (CampoBase<'opciones'> & { opciones: readonly OpcionCampo[]; porDefecto: string })
  /** `<select>` nativo — a partir de 5 valores. */
  | (CampoBase<'select'> & { opciones: readonly OpcionCampo[]; porDefecto: string })
  | (CampoBase<'booleano'> & { porDefecto: boolean })
  | (CampoBase<'numero'> & { porDefecto: number; min?: number; max?: number; paso?: number })
  /**
   * Repetidor (preguntas de un FAQ, imágenes de una galería…).
   *
   * ⚠️ `campos` NO admite otra `lista`: un solo nivel. Sin ese tope, `ConfigDe`
   * y el Inspector se vuelven recursivos sin límite y entra por la puerta de
   * atrás toda la complejidad del anidamiento que se decidió no construir.
   */
  | (CampoBase<'lista'> & {
      campos: readonly CampoSchemaSinLista[];
      /** Singular: "+ Añadir {etiquetaElemento}" / "Quitar {…}". */
      etiquetaElemento: string;
      /** Id del subcampo que titula la fila cuando está plegada. */
      resumenCampo?: string;
      max?: number;
      porDefecto: readonly Record<string, unknown>[];
    });

/** Todo `CampoSchema` menos `lista` — el tope de un nivel, en el tipo. */
export type CampoSchemaSinLista = Exclude<CampoSchema, { tipo: 'lista' }>;

/**
 * Agrupación PRESENTACIONAL: referencia ids, no anida campos.
 *
 * Si un grupo contuviera los campos, la config persistida tendría que ser
 * anidada (migración de datos) o aplanarse de forma implícita. Con ids, la
 * forma guardada sigue siendo el objeto plano de siempre.
 */
export interface GrupoCampos {
  id: string;
  titulo: string;
  campos: readonly string[];
  /** Plegado al abrir el Inspector. */
  plegado?: boolean;
}

// ── Tipo de `config` derivado del schema ────────────────────────────────────
// Funciona porque los schemas se declaran `as const satisfies readonly
// CampoSchema[]`. Por eso todos los arrays de los tipos de arriba son
// `readonly`: sin eso, `as const` no satisface la interfaz.

type ValorCampo<C extends CampoSchema> =
  C extends { tipo: 'texto' | 'textoLargo' | 'url' | 'imagen' | 'color' } ? string
  : C extends { tipo: 'colorHeredado' } ? string | null
  : C extends { tipo: 'booleano' } ? boolean
  : C extends { tipo: 'numero' } ? number
  : C extends { tipo: 'opciones' | 'select' } ? C['opciones'][number]['id']
  : C extends { tipo: 'lista'; campos: infer S extends readonly CampoSchema[] } ? ConfigDe<S>[]
  : never;

/** El tipo de `config` de un bloque, derivado de su lista de campos. */
export type ConfigDe<Campos extends readonly CampoSchema[]> = {
  [C in Campos[number] as C['id']]: ValorCampo<C>;
};

// ── Validadores con nombre ──────────────────────────────────────────────────
// Espejan el saneado que YA hace el render (`resolverHrefBloque`,
// `resolverVideoEmbed` en lib/portal-home-bloques.ts). Aquí solo se necesita
// el "¿es válido?", no el valor resuelto, así que se comprueba la forma sin
// importar aquel módulo (que a su vez importaría éste — ciclo).

const HEX = /^#[0-9a-fA-F]{6}$/;

function esHrefValido(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  const v = valor.trim();
  if (v === '') return false;
  // Ruta interna del portal.
  if (v.startsWith('/')) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function esVideoValido(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  const v = valor.trim();
  if (v === '') return false;
  try {
    const host = new URL(v).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'vimeo.com' || host === 'player.vimeo.com';
  } catch {
    return false;
  }
}

const VALIDADORES: Record<NombreValidador, (valor: unknown) => boolean> = {
  href: esHrefValido,
  videoEmbed: esVideoValido,
  hex: (v) => typeof v === 'string' && HEX.test(v),
};

// ── Funciones puras ─────────────────────────────────────────────────────────

function noEstaVacio(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'string') return valor.trim() !== '';
  return valor != null;
}

/**
 * ¿Se cumple la condición? Sin condición → `true` (nada que exigir).
 * Nunca lanza: ante un valor inesperado devuelve `false`, que es la dirección
 * segura tanto para `visibleSi` (no pintar) como para `completoSi` (avisar de
 * que falta algo).
 */
export function cumpleCondicion(
  cond: CondicionCampo | undefined,
  valores: Record<string, unknown>,
): boolean {
  if (!cond) return true;
  if ('todas' in cond) return cond.todas.every((c) => cumpleCondicion(c, valores));
  if ('alguna' in cond) return cond.alguna.some((c) => cumpleCondicion(c, valores));

  const valor = valores?.[cond.campo];
  if ('igual' in cond) return valor === cond.igual;
  if ('distinto' in cond) return valor !== cond.distinto;
  if ('noVacio' in cond) return noEstaVacio(valor);
  if ('valido' in cond) return VALIDADORES[cond.valido](valor);
  if ('minimo' in cond) return Array.isArray(valor) && valor.length >= cond.minimo;
  return false;
}

/** Copia profunda de un valor por defecto. Ver la nota de cabecera. */
function clonar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(clonar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, clonar(v)]));
  }
  return valor;
}

/**
 * Valores por defecto de una lista de campos.
 * CLONA en cada llamada: dos bloques del mismo tipo no pueden compartir el
 * array de su repetidor.
 */
export function defaultsDe(campos: readonly CampoSchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const campo of campos) out[campo.id] = clonar(campo.porDefecto);
  return out;
}

/**
 * Rellena las claves AUSENTES con su `porDefecto`, clave a clave — mismo
 * principio que `resolveTheme()`/`resolveVariantes()`.
 *
 * Esto es lo que hace los defaults RETROACTIVOS: la config guardada pasa a ser
 * un PARCHE sobre el schema, así que un campo nuevo llega a los estudios que
 * ya tenían el bloque, sin migración. (Es justo el problema de "los `defaults`
 * de un tema no son retroactivos" que ya obligó a reinstalar temas a mano.)
 *
 * ⚠️ Solo para `config`. NUNCA para `estilo`: ahí "ausente" y "valor por
 * defecto" significan cosas distintas en el render (`estilo?.esquinas ? X :
 * (estilo?.fondo ? radio.card : undefined)`), y rellenarlo cambiaría el
 * aspecto de estudios reales.
 */
export function resolverConfig(
  campos: readonly CampoSchema[],
  raw: unknown,
): Record<string, unknown> {
  const guardado = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? (raw as Record<string, unknown>)
    : {};
  // Se parte de lo GUARDADO para conservar claves que este despliegue todavía
  // no conoce (otro más nuevo puede haberlas escrito). Al reescribir, zod las
  // podará — pero leerlas no debe perderlas.
  const out: Record<string, unknown> = { ...guardado };
  for (const campo of campos) {
    if (!(campo.id in out)) out[campo.id] = clonar(campo.porDefecto);
  }
  return out;
}

/**
 * Campos que el Inspector debe pintar, en orden, con `visibleSi` y `obsoleto`
 * ya aplicados.
 */
export function camposVisibles(
  campos: readonly CampoSchema[],
  valores: Record<string, unknown>,
): CampoSchema[] {
  return campos.filter((c) => !c.obsoleto && cumpleCondicion(c.visibleSi, valores));
}

/**
 * Mensaje de error de UN campo, o `null`. Es ADVISORY: sirve para avisar en el
 * panel, nunca para bloquear el guardado del borrador — a medio escribir todo
 * está mal, y perder lo tecleado por eso sería peor que el error.
 */
export function validarCampo(campo: CampoSchema, valor: unknown): string | null {
  if (campo.tipo === 'url' && typeof valor === 'string' && valor.trim() !== '' && !esHrefValido(valor)) {
    return 'Escribe una ruta que empiece por / o un enlace https://';
  }
  if (campo.tipo === 'color' && typeof valor === 'string' && !HEX.test(valor)) {
    return 'Usa un color en formato #RRGGBB';
  }
  if (campo.tipo === 'colorHeredado' && valor != null && (typeof valor !== 'string' || !HEX.test(valor))) {
    return 'Usa un color en formato #RRGGBB, o déjalo vacío para heredar del tema';
  }
  if (campo.tipo === 'numero' && typeof valor === 'number') {
    if (campo.min != null && valor < campo.min) return `El mínimo es ${campo.min}`;
    if (campo.max != null && valor > campo.max) return `El máximo es ${campo.max}`;
  }
  if ((campo.tipo === 'texto' || campo.tipo === 'textoLargo') && campo.maxLargo != null) {
    if (typeof valor === 'string' && valor.length > campo.maxLargo) {
      return `Máximo ${campo.maxLargo} caracteres`;
    }
  }
  if (campo.tipo === 'lista' && campo.max != null && Array.isArray(valor) && valor.length > campo.max) {
    return `Máximo ${campo.max}`;
  }
  return null;
}
