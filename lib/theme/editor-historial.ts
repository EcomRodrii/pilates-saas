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
