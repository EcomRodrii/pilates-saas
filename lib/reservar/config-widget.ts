// El vocabulario de parámetros del widget embebido, CONGELADO en el snippet.
//
// Mismo modelo que Momence (configurador puro de snippets): la configuración
// viaja en la URL del iframe (Modo A, `?tipos=id1,id2`) o en los atributos
// `data-*` del contenedor (Modo B, `data-tipos="id1,id2"`) — no hay nada que
// guardar ni publicar. Este módulo es el ÚNICO parser de ese vocabulario, para
// que los dos modos no puedan divergir en qué aceptan ni en cómo lo validan.
//
// ⚠️ Sin imports de Next ni de React a propósito: lo compila esbuild para el
// bundle embebible (app/widget-bundle/main.tsx) además de Next para
// /reservar/[slug]. Y misma regla que `resolverApariencia`: un valor con
// basura se IGNORA (queda el default), nunca rompe — estos parámetros llegan
// por la URL de una página pública y cualquiera puede escribirlos.

/**
 * Color `#rgb`/`#rrggbb`/`#rrggbbaa`. Vive aquí (módulo común sin dependencias)
 * y `apariencia-widget.ts` lo importa — una sola puerta anti-XSS para todo lo
 * que acabe interpolado en CSS.
 */
export const COLOR_VALIDO = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * ⚠️ Un nombre de fuente llega por la URL de una página PÚBLICA (Modo A) o por
 * un atributo `data-*` que cualquiera puede escribir (Modo B). Se acota a
 * letras, números y espacios: es lo que cabe en un nombre de familia de Google
 * Fonts, y deja fuera comillas, llaves y paréntesis — o sea, todo lo que haría
 * falta para salirse de la declaración CSS o del `<link>` que la carga.
 * Vive aquí (módulo común sin dependencias, compilado por esbuild para el
 * bundle) y `apariencia-widget.ts` lo importa — UNA puerta anti-XSS, no dos
 * copias que puedan divergir.
 */
export const FUENTE_VALIDA = /^[A-Za-z0-9][A-Za-z0-9 ]{0,39}$/;

export function fuenteValida(v: string): boolean {
  return FUENTE_VALIDA.test(v.trim());
}

/**
 * El `font-family` completo de una familia nombrada, con la pila de reserva
 * detrás: la fuente puede tardar en cargar o no existir, y sin reserva ese
 * rato se ve en Times New Roman.
 */
export function familiaCssDe(nombre: string): string {
  return `'${nombre.trim()}', system-ui, sans-serif`;
}

/**
 * La URL de Google Fonts para cargar una familia nombrada, o `null`.
 *
 * Se valida el nombre aquí aunque el caller ya lo haya filtrado: son dos
 * puertas para lo mismo a propósito, porque esta cadena acaba en el `href` de
 * un `<link>` que se inyecta en un documento (el nuestro en Modo A, el de la
 * WEB DEL ESTUDIO en Modo B).
 *
 * ⚠️ Se codifica PRIMERO y se cambian los `%20` por `+` DESPUÉS. Al revés
 * —meter los `+` y luego codificar— salen `%2B` y Google Fonts devuelve un 400:
 * pedirías la familia «Space+Grotesk» con un signo más literal en el nombre.
 * `display=swap` a propósito: la carga de la fuente nunca bloquea el pintado
 * del widget — mientras llega se ve la pila de reserva.
 */
export function urlFuenteGoogle(nombre: string | null | undefined): string | null {
  if (!nombre || !fuenteValida(nombre)) return null;
  const familia = encodeURIComponent(nombre.trim()).replace(/%20/g, '+');
  return `https://fonts.googleapis.com/css2?family=${familia}:wght@400;500;600;700&display=swap`;
}

// Ids del repo: UUIDs en producción, slugs cortos en fixtures/tests. Letras,
// números y guiones basta para ambos y deja fuera todo lo que serviría para
// salirse de un atributo o un selector.
const ID_VALIDO = /^[A-Za-z0-9-]{1,64}$/;

export interface ConfigWidget {
  /** Ids de tipos de clase a los que se limita el horario. Vacío = todos. */
  tipos: string[];
  /** Ids de instructoras. Vacío = todas. */
  instructoras: string[];
  /** Ids de salas. Vacío = todas. */
  salas: string[];
  /** 'hoy' = solo el día de hoy; 'todo' = la ventana completa de siempre. */
  vistaInicial: 'hoy' | 'todo';
  ocultarPrecio: boolean;
  ocultarNivel: boolean;
  ocultarSustituta: boolean;
  /**
   * 'completo' = tira de días + día completo (`estiloDias='dias'`);
   * 'ligero' = rejilla compacta (`estiloDias='grid'`). `null` = el default del
   * modo que lo lea (Modo A completo, Modo B ligero) — por eso no se resuelve
   * aquí.
   */
  diseno: 'completo' | 'ligero' | null;
  /** Fondo del contenedor raíz (Modo B; en Modo A ya existe `?fondo=`). */
  colorFondo: string | null;
  /** Color primario de marca (`--portal-brand`). */
  colorPrimario: string | null;
  /** La tinta del texto (Modo B; en Modo A ya existe `?tinta=`). */
  colorNegro: string | null;
  /**
   * Nombre de familia (Google Fonts) para el cuerpo/UI (Modo B; en Modo A ya
   * existe `?fuente=`, resuelto por `resolverApariencia` con lo guardado en el
   * tema debajo — mismo reparto que `fondo`/`tinta`).
   */
  fuente: string | null;
  /** Fuente de titulares/horas/precios. `null` = la misma que `fuente`. */
  fuenteDisplay: string | null;
}

export const CONFIG_WIDGET_POR_DEFECTO: ConfigWidget = {
  tipos: [], instructoras: [], salas: [],
  vistaInicial: 'todo',
  ocultarPrecio: false, ocultarNivel: false, ocultarSustituta: false,
  diseno: null,
  colorFondo: null, colorPrimario: null, colorNegro: null,
  fuente: null, fuenteDisplay: null,
};

/** Lo mínimo que hace falta de la fuente. Un `URLSearchParams` encaja tal cual. */
export interface FuenteConfig {
  get(nombre: string): string | null;
}

/**
 * Adapta un `dataset` (DOMStringMap) a `FuenteConfig`: los atributos
 * `data-ocultar-precio` llegan como `dataset.ocultarPrecio`, así que se
 * convierte el nombre kebab a camelCase antes de mirar. Vive aquí y no en
 * main.tsx para que el mapeo de nombres sea parte del vocabulario testeado.
 */
export function fuenteDeDataset(dataset: Record<string, string | undefined>): FuenteConfig {
  return {
    get(nombre: string) {
      const camel = nombre.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      const v = dataset[camel];
      return v === undefined ? null : v;
    },
  };
}

function leerLista(v: string | null): string[] {
  if (v == null) return [];
  return v.split(',').map(s => s.trim()).filter(s => ID_VALIDO.test(s));
}

// '1'/'true' y '0'/'false' explícitos ('true' porque es la convención de los
// atributos data-* estilo Momence, '1'/'0' porque es la de los query params de
// apariencia-widget). La cadena VACÍA cuenta como true: un atributo booleano
// escrito a pelo (`data-ocultar-precio`) significa "sí". Cualquier otra cosa
// se ignora — nunca `Boolean('false')`.
function leerBooleano(v: string | null): boolean | undefined {
  if (v == null) return undefined;
  const t = v.trim().toLowerCase();
  if (t === '' || t === '1' || t === 'true') return true;
  if (t === '0' || t === 'false') return false;
  return undefined;
}

function leerColor(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return COLOR_VALIDO.test(t) ? t : null;
}

function leerFuente(v: string | null): string | null {
  if (v == null) return null;
  return fuenteValida(v) ? v.trim() : null;
}

/**
 * Parser único del snippet, para ambos modos. Nombres exactos del vocabulario
 * (query param en Modo A / `data-<nombre>` en Modo B):
 * `tipos`, `instructoras`, `salas` (ids separados por coma), `vista`
 * (`hoy`|`todo`), `ocultar-precio`, `ocultar-nivel`, `ocultar-sustituta`
 * (booleanos), `diseno` (`completo`|`ligero`), `fondo`, `marca`, `negro`
 * (colores hex), `fuente`, `fuente-display` (familias de Google Fonts).
 *
 * ⚠️ En Modo A, `fondo` y `negro`/`tinta` los sigue resolviendo
 * `resolverApariencia` (mismos nombres de siempre, con lo guardado debajo) —
 * la página solo consume de aquí filtros, vista, toggles, diseño y `marca`.
 */
export function resolverConfigWidget(fuente: FuenteConfig): ConfigWidget {
  const vistaCruda = fuente.get('vista')?.trim();
  const disenoCrudo = fuente.get('diseno')?.trim();
  return {
    tipos: leerLista(fuente.get('tipos')),
    instructoras: leerLista(fuente.get('instructoras')),
    salas: leerLista(fuente.get('salas')),
    vistaInicial: vistaCruda === 'hoy' ? 'hoy' : 'todo',
    ocultarPrecio: leerBooleano(fuente.get('ocultar-precio')) ?? false,
    ocultarNivel: leerBooleano(fuente.get('ocultar-nivel')) ?? false,
    ocultarSustituta: leerBooleano(fuente.get('ocultar-sustituta')) ?? false,
    diseno: disenoCrudo === 'completo' || disenoCrudo === 'ligero' ? disenoCrudo : null,
    colorFondo: leerColor(fuente.get('fondo')),
    colorPrimario: leerColor(fuente.get('marca')),
    colorNegro: leerColor(fuente.get('negro')),
    fuente: leerFuente(fuente.get('fuente')),
    fuenteDisplay: leerFuente(fuente.get('fuente-display')),
  };
}
