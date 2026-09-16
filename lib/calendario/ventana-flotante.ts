// ─────────────────────────────────────────────────────────────────────────────
// La ventana flotante del calendario: si está abierta, si está plegada y dónde.
//
// Es una preferencia de ESTE ordenador, no del estudio: en el portátil de
// recepción la quieres arriba a la derecha y en casa cerrada. Por eso vive en
// localStorage y no en la base de datos, y perderla al borrar los datos del
// navegador no le cuesta nada a nadie.
//
// La posición se acota aquí, en funciones puras y probadas, por una razón: una
// ventana que se arrastra se puede soltar medio fuera, y la pantalla puede
// encoger después (cambiar de monitor, desacoplar el portátil). Lo que no puede
// pasar nunca es que la ventana quede fuera de alcance, porque entonces no hay
// barra que agarrar para traerla de vuelta.
// ─────────────────────────────────────────────────────────────────────────────

export const ANCHO_VENTANA = 320;
/** Aire mínimo entre la ventana y el borde de la pantalla. */
export const MARGEN_VENTANA = 12;
/** Al abrirla por primera vez: debajo de la barra superior del panel, para no taparla. */
const ARRIBA_INICIAL = 88;
const DERECHA_INICIAL = 24;

export interface Punto { x: number; y: number }
export interface Tamano { ancho: number; alto: number }

export interface EstadoVentana {
  abierta: boolean;
  plegada: boolean;
  /** Agrandada: la semana entera en columnas, sin dejar de ser una ventana. */
  expandida: boolean;
  /** `null` = todavía no se ha movido: se coloca arriba a la derecha. */
  posicion: Punto | null;
}

export const ESTADO_INICIAL: EstadoVentana = { abierta: false, plegada: false, expandida: false, posicion: null };

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lo guardado, sin fiarse de su forma: una versión vieja o un valor tocado a mano no pueden tumbar el panel. */
export function leerEstado(raw: string | null): EstadoVentana {
  if (!raw) return ESTADO_INICIAL;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return ESTADO_INICIAL; }
  if (!v || typeof v !== 'object') return ESTADO_INICIAL;
  const o = v as Record<string, unknown>;
  const p = o.posicion as Record<string, unknown> | null | undefined;
  return {
    abierta: o.abierta === true,
    plegada: o.plegada === true,
    expandida: o.expandida === true,
    posicion: p && esNumero(p.x) && esNumero(p.y) ? { x: p.x, y: p.y } : null,
  };
}

export function posicionInicial(pantalla: Tamano, ancho = ANCHO_VENTANA): Punto {
  return { x: Math.max(MARGEN_VENTANA, pantalla.ancho - ancho - DERECHA_INICIAL), y: ARRIBA_INICIAL };
}

const entre = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Deja la ventana entera dentro de la pantalla, con su margen.
 *
 * Si no cabe entera (más alta que la pantalla), se queda pegada arriba: lo que
 * tiene que verse siempre es la barra por la que se arrastra, que es la de arriba.
 */
export function acotarPosicion(p: Punto, ventana: Tamano, pantalla: Tamano): Punto {
  const maxX = Math.max(MARGEN_VENTANA, pantalla.ancho - ventana.ancho - MARGEN_VENTANA);
  const maxY = Math.max(MARGEN_VENTANA, pantalla.alto - ventana.alto - MARGEN_VENTANA);
  return { x: entre(p.x, MARGEN_VENTANA, maxX), y: entre(p.y, MARGEN_VENTANA, maxY) };
}

// ─── El estado compartido ────────────────────────────────────────────────────
// La abre el Calendario y la pinta el armazón del panel, que no se conocen: se
// hablan por aquí, con `useSyncExternalStore`. La memoria es la fuente de verdad
// y localStorage solo su copia, para que la ventana funcione también donde el
// navegador bloquea el almacenamiento (ahí, simplemente, no se recuerda).

const CLAVE = 'tentare:calendario-ventana';
let memoria: EstadoVentana | null = null;
const oyentes = new Set<() => void>();

function cargar(): EstadoVentana {
  if (memoria) return memoria;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(CLAVE); } catch { /* almacenamiento bloqueado */ }
  memoria = leerEstado(raw);
  return memoria;
}

export function suscribirVentana(avisar: () => void): () => void {
  oyentes.add(avisar);
  return () => { oyentes.delete(avisar); };
}

/** Siempre el MISMO objeto mientras no cambie: `useSyncExternalStore` entra en bucle si no. */
export function estadoVentana(): EstadoVentana {
  return typeof window === 'undefined' ? ESTADO_INICIAL : cargar();
}

export function estadoVentanaServidor(): EstadoVentana {
  return ESTADO_INICIAL;
}

export function actualizarVentana(cambio: Partial<EstadoVentana>): void {
  memoria = { ...cargar(), ...cambio };
  try { window.localStorage.setItem(CLAVE, JSON.stringify(memoria)); } catch { /* ídem */ }
  for (const avisar of oyentes) avisar();
}

// ─── Saltar a una clase desde la ventana ─────────────────────────────────────
// Fuera del Calendario basta con navegar a `/calendario?sesion=…` (el enlace que
// ya usa Inicio). DENTRO no: la página solo lee `?sesion` al montarse, y navegar
// a la misma ruta no la vuelve a montar. Así que ahí se le avisa con un evento.

export const EVENTO_SALTAR_A_CLASE = 'tentare:calendario-saltar-a-clase';

// ─── El origen de la animación de apertura ───────────────────────────────────
// La ventana nace del botón que la abre (como una ventana de macOS desde el
// Dock), no de la nada. No se guarda: solo sirve para la animación de entrada.

/** Cuánto vale un origen: lo justo para que la ventana que se abre ahora lo use. */
const VIGENCIA_ORIGEN_MS = 1000;
let origenApertura: (Punto & { en: number }) | null = null;

export function abrirVentanaDesde(boton: HTMLElement | null): void {
  const caja = boton?.getBoundingClientRect();
  origenApertura = caja ? { x: caja.left + caja.width / 2, y: caja.top + caja.height / 2, en: Date.now() } : null;
  actualizarVentana({ abierta: true, plegada: false });
}

/**
 * El punto del que nace la ventana, si se acaba de abrir desde un botón.
 *
 * No se borra al leerlo: en desarrollo React monta los componentes dos veces, y
 * la segunda lectura se quedaba sin origen. Caduca solo.
 */
export function origenAperturaReciente(ahora = Date.now()): Punto | null {
  if (!origenApertura || ahora - origenApertura.en > VIGENCIA_ORIGEN_MS) return null;
  return { x: origenApertura.x, y: origenApertura.y };
}
