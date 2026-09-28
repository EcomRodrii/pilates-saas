// La configuración del constructor de widgets, por widget.
//
// ⚠️ La config EFECTIVA viaja CONGELADA en el código que se copia (decisión del
// fundador, 2026-08-20: configurador de snippets, sin «publicar»). Esto se
// guarda en `studios.widget_builder` (jsonb) solo para que al volver a la
// pantalla esté todo como se dejó. Por eso:
//  - todo se valida campo a campo al leer y la basura cae al default en
//    silencio (el jsonb es texto libre para la BD);
//  - un default NO se emite en el código (./integracion.ts): un snippet sin
//    tocar se comporta EXACTAMENTE igual que el widget de siempre.
//
// Sin imports de React/Next: lo leen los tests de `node --test`.

import { COLOR_VALIDO, fuenteValida } from '../reservar/config-widget.ts';
import type { TipoPlan } from '../types.ts';
import { WIDGETS, type MetodoIntegracion, type WidgetDisponible } from './catalogo.ts';
import { FIRMA_CONTENIDO_VALIDA, FORMAS_PEGADAS, claveVista, formaDeMetodo } from './pegado.ts';
import type { EstadoWeb } from './recetas.ts';

export interface ConfigConstructor {
  // ── Contenido ──
  /** Con qué días abre el horario. */
  vista: 'todo' | 'hoy';
  tipos: string[];
  instructoras: string[];
  salas: string[];
  mostrarPrecio: boolean;
  mostrarNivel: boolean;
  mostrarSustituta: boolean;
  /**
   * La vista del horario: 'completo' = tira de días con el día abierto,
   * 'ligero' = la semana en rejilla. `null` = la de cada método (el iframe
   * abre en días, la integración nativa en rejilla).
   */
  diseno: 'completo' | 'ligero' | null;
  /**
   * 'lista' = el horario de siempre (con su `diseno`); 'semana' = el calendario
   * semanal, días en columnas y horas en filas. Viaja con el iframe, el popup,
   * el enlace y el botón; la integración nativa no lo entiende y lo ignora.
   */
  presentacion: 'lista' | 'semana';
  /** «Reserva una clase»: la sesión a la que apunta. */
  sesion: string | null;
  /** «Mi cuenta»: con qué abre. */
  cuentaInicio: 'reservas' | 'bonos';
  /** «Planes y precios»: qué tipos se venden. Vacío = todos. */
  tiposPlan: TipoPlan[];

  // ── Diseño ──
  /**
   * 'estudio' = la identidad del estudio (el tema publicado en Apariencia): no
   * se emite NINGÚN ajuste de diseño y el widget se ve como su portal.
   * 'propia' = los de abajo, congelados en el código.
   */
  identidad: 'estudio' | 'propia';
  /** 'claro' = para una web clara (letra oscura); 'oscuro', al revés. */
  tema: 'auto' | 'claro' | 'oscuro';
  /** Color hex o 'transparente' (deja ver el fondo de la web). */
  fondo: string | null;
  marca: string | null;
  tinta: string | null;
  superficie: string | null;
  linea: string | null;
  forma: 'pill' | 'redondeado' | 'recto' | null;
  densidad: 'comoda' | 'compacta' | null;
  fuente: string | null;
  fuenteDisplay: string | null;
  /** Ancho del recuadro. `null` = el del widget (ver `anchoPorDefecto`). */
  ancho: 'compacto' | 'completo' | null;

  // ── Comportamiento ──
  /** Cómo se integra. `null` = el recomendado del widget. */
  metodo: MetodoIntegracion | null;
  /** Botón y popup. `null` = el del catálogo. */
  textoBoton: string | null;
  estiloBoton: 'relleno' | 'contorno';
  /** Botón y enlace: dónde se abre la página de reservas. */
  abrirEn: 'nueva' | 'misma';
  /** El pie con dirección y legales. La web del estudio ya suele tener el suyo. */
  mostrarPie: boolean;

  // ── Avanzado ──
  /**
   * La etiqueta de seguimiento (`?ref=`). Con ella, las visitas y reservas de
   * este widget se distinguen en «Cómo le va a tu página» y la ficha de una
   * alumna nueva dice por dónde llegó (`socios.origen_lead`).
   * `null` = la de por defecto (`web-<widget>`); `''` = ninguna.
   */
  etiqueta: string | null;
  /** `loading="lazy"` en el iframe: no carga hasta que se acerca a la vista. */
  cargaDiferida: boolean;
}

export const CONFIG_POR_DEFECTO: ConfigConstructor = {
  vista: 'todo', tipos: [], instructoras: [], salas: [],
  mostrarPrecio: true, mostrarNivel: true, mostrarSustituta: true,
  diseno: null, presentacion: 'lista', sesion: null, cuentaInicio: 'reservas', tiposPlan: [],
  identidad: 'estudio', tema: 'auto',
  fondo: null, marca: null, tinta: null, superficie: null, linea: null,
  forma: null, densidad: null, fuente: null, fuenteDisplay: null, ancho: null,
  metodo: null, textoBoton: null, estiloBoton: 'relleno', abrirEn: 'nueva', mostrarPie: true,
  etiqueta: null, cargaDiferida: true,
};

/** Letras, números, guiones y guiones bajos: cabe en una URL sin codificar. */
export const ETIQUETA_VALIDA = /^[A-Za-z0-9_-]{1,40}$/;
const TIPOS_PLAN: readonly TipoPlan[] = ['MENSUAL', 'BONO', 'PUNTUAL'];
const TEXTO_BOTON_MAX = 40;

/** La etiqueta que se emite de verdad (`null` = ninguna). */
export function etiquetaEfectiva(c: ConfigConstructor, w: WidgetDisponible): string | null {
  if (c.etiqueta === null) return `web-${w.id}`;
  return c.etiqueta && ETIQUETA_VALIDA.test(c.etiqueta) ? c.etiqueta : null;
}

/**
 * El ancho del recuadro si no se toca. El calendario semanal va a todo el
 * ancho: son siete columnas, y en 480 px solo se verían tres días a la vez.
 */
export function anchoPorDefecto(w: WidgetDisponible, c?: Pick<ConfigConstructor, 'presentacion'>): 'compacto' | 'completo' {
  if (w.contenido.includes('horario') && c?.presentacion === 'semana') return 'completo';
  return w.contenido.includes('horario') || w.contenido.includes('sesion') || w.id === 'citas' || w.id === 'cuenta'
    ? 'compacto' : 'completo';
}

/**
 * El ancho de la ventana del popup (`data-tentare-ancho`). El calendario
 * semanal pide 960: su rejilla mide 670 px de mínimo, y en la ventana de 720
 * (menos el margen de la página y la barra de scroll del propio iframe) se
 * deslizaba unos píxeles en horizontal. El runtime acepta hasta 1200.
 */
export function anchoPopupDe(w: WidgetDisponible, c: Pick<ConfigConstructor, 'presentacion'>): number {
  return w.contenido.includes('horario') && c.presentacion === 'semana' ? 960 : w.anchoPopup;
}

export function metodoEfectivo(c: ConfigConstructor, w: WidgetDisponible): MetodoIntegracion {
  return c.metodo && w.metodos.includes(c.metodo) ? c.metodo : w.metodos[0];
}

export function textoBotonEfectivo(c: ConfigConstructor, w: WidgetDisponible): string {
  const t = c.textoBoton?.trim();
  return t ? t.slice(0, TEXTO_BOTON_MAX) : w.textoBoton;
}

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function color(v: unknown): string | null {
  return typeof v === 'string' && COLOR_VALIDO.test(v) ? v : null;
}
function fuente(v: unknown): string | null {
  return typeof v === 'string' && fuenteValida(v) ? v.trim() : null;
}
function uno<T extends string>(v: unknown, validos: readonly T[]): T | null {
  return typeof v === 'string' && (validos as readonly string[]).includes(v) ? (v as T) : null;
}

const METODOS_VALIDOS: readonly MetodoIntegracion[] = ['iframe', 'nativa', 'popup', 'boton', 'enlace'];

/**
 * Lo guardado para UN widget → config válida. Entiende también la forma de
 * antes del catálogo (`ocultarPrecio`, `negro`, `anchoCompleto`…), para que
 * nadie pierda lo que ya había configurado.
 */
export function leerConfig(raw: unknown): ConfigConstructor {
  const c: ConfigConstructor = { ...CONFIG_POR_DEFECTO, tipos: [], instructoras: [], salas: [], tiposPlan: [] };
  if (!raw || typeof raw !== 'object') return c;
  const o = raw as Record<string, unknown>;

  if (o.vista === 'hoy') c.vista = 'hoy';
  c.tipos = lista(o.tipos);
  c.instructoras = lista(o.instructoras);
  c.salas = lista(o.salas);
  // Forma nueva (`mostrarX`) o la de antes (`ocultarX`).
  const mostrar = (nuevo: unknown, viejo: unknown) =>
    typeof nuevo === 'boolean' ? nuevo : viejo !== true;
  c.mostrarPrecio = mostrar(o.mostrarPrecio, o.ocultarPrecio);
  c.mostrarNivel = mostrar(o.mostrarNivel, o.ocultarNivel);
  c.mostrarSustituta = mostrar(o.mostrarSustituta, o.ocultarSustituta);
  c.diseno = uno(o.diseno, ['completo', 'ligero'] as const);
  c.presentacion = o.presentacion === 'semana' ? 'semana' : 'lista';
  c.sesion = typeof o.sesion === 'string' && o.sesion ? o.sesion : null;
  c.cuentaInicio = o.cuentaInicio === 'bonos' ? 'bonos' : 'reservas';
  c.tiposPlan = lista(o.tiposPlan).filter((t): t is TipoPlan => (TIPOS_PLAN as readonly string[]).includes(t));

  c.tema = uno(o.tema, ['auto', 'claro', 'oscuro'] as const) ?? 'auto';
  c.fondo = o.fondo === 'transparente' ? 'transparente' : color(o.fondo);
  c.marca = color(o.marca);
  c.tinta = color(o.tinta) ?? color(o.negro);
  c.superficie = color(o.superficie);
  c.linea = color(o.linea);
  c.forma = uno(o.forma, ['pill', 'redondeado', 'recto'] as const);
  c.densidad = uno(o.densidad, ['comoda', 'compacta'] as const);
  c.fuente = fuente(o.fuente);
  c.fuenteDisplay = fuente(o.fuenteDisplay);
  c.ancho = uno(o.ancho, ['compacto', 'completo'] as const)
    ?? (o.anchoCompleto === true ? 'completo' : null);
  // Sin `identidad` guardada (lo de antes del catálogo): si tocó algún ajuste
  // de diseño, es que lo quería propio — no se le puede apagar sin avisar.
  const tocoDiseno = [c.fondo, c.marca, c.tinta, c.superficie, c.linea, c.forma, c.densidad, c.fuente, c.fuenteDisplay]
    .some(v => v !== null) || c.tema !== 'auto';
  c.identidad = o.identidad === 'propia' || o.identidad === 'estudio' ? o.identidad : (tocoDiseno ? 'propia' : 'estudio');

  c.metodo = uno(o.metodo, METODOS_VALIDOS);
  c.textoBoton = typeof o.textoBoton === 'string' ? o.textoBoton.slice(0, TEXTO_BOTON_MAX) : null;
  c.estiloBoton = o.estiloBoton === 'contorno' ? 'contorno' : 'relleno';
  c.abrirEn = o.abrirEn === 'misma' ? 'misma' : 'nueva';
  c.mostrarPie = o.mostrarPie !== false;

  c.etiqueta = typeof o.etiqueta === 'string' && (o.etiqueta === '' || ETIQUETA_VALIDA.test(o.etiqueta)) ? o.etiqueta : null;
  c.cargaDiferida = o.cargaDiferida !== false;
  return c;
}

/**
 * Todo `studios.widget_builder` → config por widget del catálogo.
 * Un widget sin nada guardado con su id nuevo hereda lo de sus ids viejos
 * (`clases` → `horario`, `embed-script` → `horario` con integración nativa…).
 */
export function leerConfigs(raw: Record<string, unknown> | null | undefined): Record<string, ConfigConstructor> {
  const out: Record<string, ConfigConstructor> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const w of WIDGETS) {
    if (w.estado !== 'disponible') continue;
    if (w.id in raw) { out[w.id] = leerConfig(raw[w.id]); continue; }
    const viejo = (w.legado ?? []).find(id => id in raw);
    if (!viejo) continue;
    const c = leerConfig(raw[viejo]);
    // El «Calendario embebido» de antes ES la integración nativa del horario.
    if (viejo === 'embed-script') c.metodo = 'nativa';
    out[w.id] = c;
  }
  return out;
}

// ── Lo copiado y lo guardado ─────────────────────────────────────────────────

/**
 * La huella del código la última vez que se copió desde aquí
 * (`firmaCodigo`, ./integracion.ts) y cuándo. Solo sirve para avisar de que
 * algo que va en el código cambió DESPUÉS de copiarlo: nunca se emite, y no
 * dice nada de lo que hay de verdad en su web (si lo copió a mano, o lo pegó
 * en dos sitios, esto no lo sabe).
 *
 * Desde la Fase C (28-sep-2026) lleva también lo que hace falta para la portada
 * «Lo que tienes en tu web». Los cuatro son OPCIONALES y solo se leen si son
 * válidos: las copias de antes no los tienen, y siguen leyéndose igual.
 */
export interface Copiado {
  firma: string;
  /** ISO. */
  en: string;
  /** La forma que se copió. `metodoEnWeb` da la de AHORA, que puede ser otra. */
  metodo?: MetodoIntegracion;
  /**
   * Una foto de la configuración copiada (sin huérfanos). Con ella, «qué
   * cambió» se calcula por grupos contra la MISMA plantilla (`gruposCambiados`,
   * ./en-tu-web.ts): un cambio en la plantilla de Tentare no sale como un
   * cambio suyo, que es lo que pasa comparando solo `firma`.
   */
  config?: ConfigConstructor;
  /**
   * `firmaContenidoDe` de lo copiado: la versión que /reservar dirá ver en su
   * web. Solo dentro de una página y encima; la nativa, el botón y el enlace no
   * la mandan.
   */
  contenido?: string;
  /**
   * Las versiones de copias anteriores (`claveVista`), la más reciente primero
   * y hasta `MAX_ANTERIORES`. Es lo que deja decir «una versión ANTERIOR» y no
   * solo «distinta»: comparar fechas no lo demuestra (un código retocado a mano
   * antes de copiar saldría como anterior).
   */
  anteriores?: string[];
}

const FIRMA_VALIDA = /^[0-9a-z]{1,32}$/;
export const MAX_ANTERIORES = 5;

function esClaveVista(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const i = v.indexOf(':');
  return i > 0 && (FORMAS_PEGADAS as readonly string[]).includes(v.slice(0, i)) && FIRMA_CONTENIDO_VALIDA.test(v.slice(i + 1));
}

/** Sin basura, sin repetir y cortada: el jsonb es texto libre para la BD. */
function limpiarAnteriores(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter(esClaveVista))].slice(0, MAX_ANTERIORES) : [];
}

/** `widget_builder[<id>].copiado` de cada widget del catálogo. */
export function leerCopiados(raw: Record<string, unknown> | null | undefined): Record<string, Copiado> {
  const out: Record<string, Copiado> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const w of WIDGETS) {
    const o = raw[w.id];
    const k = o && typeof o === 'object' ? (o as Record<string, unknown>).copiado : null;
    if (!k || typeof k !== 'object') continue;
    const x = k as Record<string, unknown>;
    const { firma, en } = x;
    if (!(typeof firma === 'string' && FIRMA_VALIDA.test(firma) && typeof en === 'string' && !Number.isNaN(Date.parse(en)))) continue;
    const copia: Copiado = { firma, en };
    const metodo = uno(x.metodo, METODOS_VALIDOS);
    if (metodo) copia.metodo = metodo;
    if (x.config && typeof x.config === 'object' && !Array.isArray(x.config)) copia.config = leerConfig(x.config);
    if (typeof x.contenido === 'string' && FIRMA_CONTENIDO_VALIDA.test(x.contenido)) copia.contenido = x.contenido;
    const anteriores = limpiarAnteriores(x.anteriores);
    if (anteriores.length) copia.anteriores = anteriores;
    out[w.id] = copia;
  }
  return out;
}

/** La versión que la página dirá ver de esta copia (`claveVista`), o `null` si no se sabe. */
export function claveDeCopia(k: Copiado | null | undefined): string | null {
  if (!k?.metodo || !k.contenido) return null;
  const forma = formaDeMetodo(k.metodo);
  return forma ? claveVista(forma, k.contenido) : null;
}

/**
 * Lo que se guarda al copiar (lo llama `registrarCopia`, en el constructor):
 * la huella, cuándo, la forma, la foto de la configuración, la versión que
 * verá la página y el historial. La versión de la copia de antes pasa delante
 * del historial —salvo que sea la misma que se copia ahora—, sin repetir y con
 * `MAX_ANTERIORES` como mucho.
 */
export function nuevaCopia(anterior: Copiado | null | undefined, x: {
  firma: string;
  en: string;
  metodo: MetodoIntegracion;
  config: ConfigConstructor;
  contenido: string | null;
}): Copiado {
  const copia: Copiado = { firma: x.firma, en: x.en, metodo: x.metodo, config: x.config };
  if (x.contenido && FIRMA_CONTENIDO_VALIDA.test(x.contenido)) copia.contenido = x.contenido;
  const nueva = claveDeCopia(copia);
  const anteriores = limpiarAnteriores([claveDeCopia(anterior), ...(anterior?.anteriores ?? [])].filter(k => k !== nueva));
  if (anteriores.length) copia.anteriores = anteriores;
  return copia;
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

/**
 * Lo que se escribe en `studios.widget_builder`. FUSIONA sobre lo que había:
 * las claves que este constructor no entiende (ids viejos de antes del
 * catálogo, lo que añada una versión más nueva dentro de `_web`…) se quedan
 * como estaban, y cada widget lleva su `copiado`. Reescribir el objeto entero
 * se comería `_web` y la dueña tendría que volver a contestar con qué está
 * hecha su web.
 */
export function fusionarWidgetBuilder(
  raw: Record<string, unknown> | null | undefined,
  configs: Readonly<Record<string, ConfigConstructor>>,
  copiados: Readonly<Record<string, Copiado>>,
  web: EstadoWeb,
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...objeto(raw) };
  for (const [id, c] of Object.entries(configs)) {
    base[id] = copiados[id] ? { ...c, copiado: copiados[id] } : { ...c };
  }
  for (const [id, k] of Object.entries(copiados)) {
    if (!(id in configs)) base[id] = { ...objeto(base[id]), copiado: k };
  }
  // Sin contestar, `_web` se queda como estaba (quizá con una plataforma que
  // esta versión no conoce). La dirección se contesta junto a la plataforma:
  // si la borró, se borra.
  if (web.plataforma) {
    const { direccion: _antes, ...restoDeWeb } = objeto(base._web);
    base._web = { ...restoDeWeb, plataforma: web.plataforma, ...(web.direccion ? { direccion: web.direccion } : {}) };
  }
  return base;
}
