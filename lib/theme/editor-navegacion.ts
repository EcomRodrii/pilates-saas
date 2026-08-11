// Las reglas de navegación del editor de temas, como funciones puras.
//
// Hoy un solo `nodo` decide DOS cosas a la vez: qué se está editando y qué
// enseña el preview. Eso funciona mientras el rail sea el único sitio desde
// el que se elige — en cuanto aparece un selector de página aparte (como el
// de Shopify), las dos cosas dejan de ir siempre juntas y la lógica de
// acoplamiento se reparte por el JSX en forma de condiciones sueltas.
//
// Aquí están separadas en tres ejes independientes (`modo`, `pagina`,
// `seleccion`) más las transiciones entre ellos, en un módulo sin React que
// se puede probar sin montar nada.
//
// ⚠️ La regla menos obvia, y la que hay que conservar: **el preview NO sigue
// siempre a la selección del rail**. Elegir "Inicio del panel" o "Contenido
// del portal" cambia lo que se edita pero deja el iframe donde estaba,
// porque esas dos no son pantallas del portal y no tienen vista que enseñar.
// Hoy eso lo consigue `pantallaActiva`, que solo se actualiza para
// home/clases/bonos; aquí es `vista`, con la misma condición explícita.

import { PANTALLA_IDS, type PantallaId } from '../portal-home-bloques.ts';

/** Páginas que el iframe del preview sabe enseñar. */
export const VISTAS_PREVIEW = [...PANTALLA_IDS, 'bienvenida', 'reservas', 'perfil'] as const;
export type VistaPreview = (typeof VISTAS_PREVIEW)[number];

/** Todo lo que puede estar seleccionado en el rail. */
export type PaginaEditor = VistaPreview | 'dashboard-inicio' | 'contenido-portal';

/**
 * Qué panel se está usando. `ajustes` es el tema global (colores, tipografía,
 * barra…); `secciones` es el contenido de una página concreta.
 */
export type ModoEditor = 'secciones' | 'ajustes';

export type SeleccionEditor =
  | { tipo: 'bloque'; pantalla: PantallaId; id: string }
  | { tipo: 'item'; grupo: 'contenido-portal'; id: string }
  | { tipo: 'categoria'; id: string }
  | null;

export interface EstadoEditor {
  modo: ModoEditor;
  /** Lo que está seleccionado en el rail. */
  pagina: PaginaEditor;
  /** Lo que enseña el iframe. NO siempre es `pagina` — ver la nota de arriba. */
  vista: VistaPreview;
  seleccion: SeleccionEditor;
}

export const ESTADO_INICIAL: EstadoEditor = {
  modo: 'secciones',
  pagina: 'home',
  vista: 'home',
  seleccion: null,
};

/** Si una página tiene constructor de bloques (las tres del portal). */
export function tieneBloques(pagina: PaginaEditor): pagina is PantallaId {
  return (PANTALLA_IDS as readonly string[]).includes(pagina);
}

/** Si el iframe sabe enseñar esta página. */
export function esVistaPreview(pagina: PaginaEditor): pagina is VistaPreview {
  return (VISTAS_PREVIEW as readonly string[]).includes(pagina);
}

/**
 * Elegir una página en el rail o en el selector. El preview la sigue **solo**
 * si sabe enseñarla; si no, se queda donde estaba en vez de irse a una caja
 * gris.
 */
export function elegirPagina(estado: EstadoEditor, pagina: PaginaEditor): EstadoEditor {
  return {
    modo: 'secciones',
    pagina,
    vista: esVistaPreview(pagina) ? pagina : estado.vista,
    // Cambiar de página deselecciona: el bloque que estaba elegido pertenecía
    // a otra página y su panel no tendría sentido aquí.
    seleccion: null,
  };
}

/**
 * Elegir un bloque, venga del rail o de un clic dentro del preview. Arrastra
 * la página consigo — un bloque siempre pertenece a una.
 */
export function elegirBloque(estado: EstadoEditor, pantalla: PantallaId, id: string): EstadoEditor {
  return { modo: 'secciones', pagina: pantalla, vista: pantalla, seleccion: { tipo: 'bloque', pantalla, id } };
}

/** Elegir un item de "Contenido del portal" (mensaje destacado, banners). */
export function elegirItemContenido(estado: EstadoEditor, id: string): EstadoEditor {
  return {
    modo: 'secciones',
    pagina: 'contenido-portal',
    // No es una pantalla del portal: el preview se queda donde esté.
    vista: estado.vista,
    seleccion: { tipo: 'item', grupo: 'contenido-portal', id },
  };
}

/**
 * Elegir una categoría de los ajustes del tema. **No toca `pagina` ni
 * `vista`**: los ajustes son globales, y al abrir "Colores" la propietaria
 * quiere seguir viendo la pantalla que estaba mirando para juzgar el cambio.
 */
export function elegirCategoria(estado: EstadoEditor, id: string): EstadoEditor {
  return { ...estado, modo: 'ajustes', seleccion: { tipo: 'categoria', id } };
}

/**
 * Cerrar la categoría de ajustes abierta, sin salir de los ajustes.
 *
 * Hace falta desde que las categorías son un ACORDEÓN dentro de la propia
 * columna en vez de una lista que abre un panel aparte: un acordeón se cierra
 * volviendo a pulsar su cabecera, y sin esto no había ninguna transición que
 * dejara `seleccion` en null sin arrastrar de paso `pagina`/`vista`
 * (`elegirPagina` sí las toca, y usarla aquí movería el preview al cerrar un
 * desplegable — que no es lo que nadie espera).
 */
export function cerrarCategoria(estado: EstadoEditor): EstadoEditor {
  return { ...estado, modo: 'ajustes', seleccion: null };
}

/** Ir a una vista del preview sin cambiar lo que se edita (navegar, no editar). */
export function irAVista(estado: EstadoEditor, vista: VistaPreview): EstadoEditor {
  return { ...estado, pagina: vista, vista, seleccion: null };
}

/** El id del bloque seleccionado en ESTA pantalla, o null. */
export function bloqueSeleccionadoEn(estado: EstadoEditor, pantalla: PantallaId): string | null {
  return estado.seleccion?.tipo === 'bloque' && estado.seleccion.pantalla === pantalla
    ? estado.seleccion.id
    : null;
}

/** La pantalla sobre la que operan los paneles de bloques. */
export function pantallaOperativa(estado: EstadoEditor): PantallaId {
  if (estado.seleccion?.tipo === 'bloque') return estado.seleccion.pantalla;
  if (tieneBloques(estado.pagina)) return estado.pagina;
  // Ni la página ni la selección son de bloques (p. ej. estamos en Ajustes o
  // en Contenido del portal): se opera sobre la última pantalla del portal
  // que se estuvo mirando, que es lo que enseña el preview.
  return tieneBloques(estado.vista) ? estado.vista : 'home';
}
