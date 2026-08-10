// Deshacer/rehacer del editor de temas.
//
// Hoy el botón "Deshacer" de la barra NO deshace un paso: relee el borrador
// del servidor y **descarta todas las ediciones locales de golpe**, sin
// preguntar. Con ese nombre, quien lleva veinte minutos ajustando una pantalla
// pulsa esperando quitar lo último y lo pierde todo.
//
// Esto es el reducer que lo sustituye. Puro y sin React para poder probar la
// parte difícil —la fusión por campo y el tope— sin montar nada.
//
// ⚠️ **La fusión por campo es lo que hace esto usable, no un adorno.** Sin
// ella, escribir "Bienvenidas" en un título son doce estados en la pila y
// deshacer borra una letra por pulsación. Con ella, escribir un título es UN
// paso. La ventana se cuenta desde la ÚLTIMA tecla, no desde la primera: quien
// escribe despacio sigue teniendo un solo paso.

/** Tope de la pila. Cincuenta pasos son más de los que nadie deshace a mano. */
export const TOPE_HISTORIAL = 50;

/** Ventana de fusión, en milisegundos. */
export const VENTANA_FUSION_MS = 600;

export interface Historial<T> {
  pasado: T[];
  presente: T;
  futuro: T[];
  /** Qué campo produjo el estado actual, para saber si el siguiente fusiona. */
  claveUltima: string | null;
  /** Cuándo se registró, para la ventana. */
  instanteUltima: number;
}

export function crearHistorial<T>(inicial: T): Historial<T> {
  return { pasado: [], presente: inicial, futuro: [], claveUltima: null, instanteUltima: 0 };
}

export interface OpcionesRegistro {
  /**
   * Identifica el campo que se está tocando (p. ej. `'b-1:titulo'`). Dos
   * cambios seguidos con la MISMA clave dentro de la ventana se funden en uno.
   * Sin clave, cada cambio es un paso propio — que es lo que se quiere para
   * acciones discretas: reordenar, ocultar, añadir, eliminar.
   */
  clave?: string;
  /** Inyectado para poder probar la ventana sin esperar de verdad. */
  ahora?: number;
}

/**
 * Registra un estado nuevo. Devuelve el MISMO objeto si el estado no cambió
 * —comparación por identidad, igual que React— para no llenar la pila de
 * pasos vacíos cuando un setter se dispara sin cambiar nada.
 */
export function registrar<T>(h: Historial<T>, siguiente: T, opciones: OpcionesRegistro = {}): Historial<T> {
  if (siguiente === h.presente) return h;

  const ahora = opciones.ahora ?? Date.now();
  const clave = opciones.clave ?? null;
  const funde = clave !== null && clave === h.claveUltima && ahora - h.instanteUltima < VENTANA_FUSION_MS;

  // Al fundir se REEMPLAZA el presente sin tocar el pasado: el paso que ya
  // había en la pila sigue siendo el estado de antes de empezar a teclear.
  const pasado = funde ? h.pasado : [...h.pasado, h.presente].slice(-TOPE_HISTORIAL);

  return {
    pasado,
    presente: siguiente,
    // Cualquier edición nueva invalida lo rehacible: la rama que se había
    // deshecho ya no lleva a ningún sitio.
    futuro: [],
    claveUltima: clave,
    instanteUltima: ahora,
  };
}

export function puedeDeshacer<T>(h: Historial<T>): boolean {
  return h.pasado.length > 0;
}

export function puedeRehacer<T>(h: Historial<T>): boolean {
  return h.futuro.length > 0;
}

export function deshacer<T>(h: Historial<T>): Historial<T> {
  if (h.pasado.length === 0) return h;
  const anterior = h.pasado[h.pasado.length - 1];
  return {
    pasado: h.pasado.slice(0, -1),
    presente: anterior,
    futuro: [h.presente, ...h.futuro],
    // Se corta la fusión: lo siguiente que se escriba es un paso nuevo, no una
    // continuación de lo que se acaba de deshacer.
    claveUltima: null,
    instanteUltima: 0,
  };
}

export function rehacer<T>(h: Historial<T>): Historial<T> {
  if (h.futuro.length === 0) return h;
  const [siguiente, ...resto] = h.futuro;
  return {
    pasado: [...h.pasado, h.presente].slice(-TOPE_HISTORIAL),
    presente: siguiente,
    futuro: resto,
    claveUltima: null,
    instanteUltima: 0,
  };
}

// ── Dos pilas, un botón ─────────────────────────────────────────────────────

/** Una pila candidata a deshacer/rehacer, vista desde la barra superior. */
export interface PilaEditor {
  id: string;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  /** `instanteUltima` de su historial. */
  instante: number;
}

/**
 * Cuál de las pilas deshacer.
 *
 * Los bloques y los ajustes del tema tienen historial propio —son hooks
 * distintos, con estado distinto— pero la propietaria ve UN botón y espera que
 * deshaga **lo último que hizo**, sin importar en qué panel lo hizo. Se elige
 * la pila cuyo último paso es más reciente.
 *
 * ⚠️ No vale con "la que tenga pasos": si tocas un color y luego mueves un
 * bloque, ambas tienen pasos, y deshacer la equivocada deja a la propietaria
 * viendo cómo se deshace algo que hizo hace cinco minutos mientras lo último
 * sigue ahí. El desempate por instante es la única forma de acertar sin
 * fusionar el estado de los dos hooks.
 *
 * Devuelve `null` si ninguna puede deshacer — el botón va desactivado.
 */
export function pilaADeshacer(pilas: readonly PilaEditor[]): PilaEditor | null {
  const conPasos = pilas.filter((p) => p.puedeDeshacer);
  if (conPasos.length === 0) return null;
  return conPasos.reduce((a, b) => (b.instante > a.instante ? b : a));
}

/**
 * Cuál rehacer. Simétrico, pero con el instante al revés: rehacer va hacia
 * adelante, así que la pila correcta es la que se deshizo **más recientemente**
 * — que es la de instante mayor igual, porque `deshacer` no toca
 * `instanteUltima`. Se mantiene como función propia para que el día que eso
 * cambie no haya que descubrirlo en producción.
 */
export function pilaARehacer(pilas: readonly PilaEditor[]): PilaEditor | null {
  const conFuturo = pilas.filter((p) => p.puedeRehacer);
  if (conFuturo.length === 0) return null;
  return conFuturo.reduce((a, b) => (b.instante > a.instante ? b : a));
}
