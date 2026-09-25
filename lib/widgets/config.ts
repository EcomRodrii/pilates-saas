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
  diseno: null, sesion: null, cuentaInicio: 'reservas', tiposPlan: [],
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

export function anchoPorDefecto(w: WidgetDisponible): 'compacto' | 'completo' {
  return w.contenido.includes('horario') || w.contenido.includes('sesion') || w.id === 'citas' || w.id === 'cuenta'
    ? 'compacto' : 'completo';
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

  c.metodo = uno(o.metodo, ['iframe', 'nativa', 'popup', 'boton', 'enlace'] as const);
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
