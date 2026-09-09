// ─────────────────────────────────────────────────────────────────────────────
// Los huecos que el contenido del panel tiene que dejarle al menú.
//
// Vive aquí, fuera de `components/layout/sidebar.tsx`, para poder probarlo: el
// cálculo es aritmética pura y el fallo que motivó separarlo NO se ve en una
// pantalla —se ve en el orden de las llamadas—, así que hacía falta poder
// llamarlas a mano y en el orden que rompe.
//
// `--sidebar-w` es el hueco de la izquierda y `--panel-top` el de arriba:
// siempre uno de los dos a cero. Se calculan juntos para que no puedan
// contradecirse.
//
// `--panel-sticky-top` es DISTINTO de `--panel-top` y por eso existe: es a qué
// altura puede clavarse algo `sticky` sin meterse debajo del menú.
//
//  · Tumbado, la barra es `fixed` y ocupa la banda de arriba, así que lo pegado
//    tiene que empezar donde ella acaba. Con `top-0` el buscador del Topbar se
//    clavaba en y=0 al scrollear, o sea DENTRO de la barra, y encima la tapaba
//    (z-30 contra su z-20): se veían las filas del menú por detrás de su fondo
//    translúcido.
//  · En columna no hay nada fijo arriba: ahí el sitio correcto es 0, no el
//    `0.5rem` de `--panel-top` (que es el aire del contenido, no un obstáculo).
//    Reutilizar `--panel-top` para las dos cosas dejaba una rendija de 8 px por
//    la que se veía pasar el contenido.
// ─────────────────────────────────────────────────────────────────────────────

/** Separación de la barra al borde superior (`top-4` de Tailwind). */
export const BARRA_SEPARACION = 16;

/**
 * Alto de partida de la barra tumbada. Es TAMBIÉN el que se le pone por
 * `style`, no una clase `h-[…]` aparte: escrito en dos sitios, el hueco salía
 * de un número y la barra medía el otro, y el contenido daba un salto de 16 px
 * en cada carga.
 *
 * Es un MÍNIMO, no una talla fija — de ahí que lo mida un `ResizeObserver`: con
 * el selector de sede de una cadena, con el tipo de letra del sistema más
 * grande, con el zoom del navegador o si algún día se le añade algo, la barra
 * crece y el hueco crece con ella. La constante solo cubre el primer pintado,
 * antes de poder medir.
 */
export const BARRA_ALTO_INICIAL = 68;

/**
 * La última altura MEDIDA de la barra.
 *
 * ⚠️ Esto era un parámetro con valor por defecto (`altoBarra = 68`), y ahí
 * estaba el arma cargada: de los cuatro sitios que piden los huecos, solo UNO
 * pasa la medida — el `ResizeObserver`. Los otros tres omiten el argumento, y
 * omitirlo significaba «la barra mide una fila», no «no lo sé». Cualquiera de
 * esos tres, corriendo con la barra ya crecida a dos o tres filas, dejaba
 * `--panel-sticky-top` en 84 px con la barra midiendo 155 o 210.
 *
 * Y no se arreglaba solo: el `ResizeObserver` únicamente vuelve a disparar si
 * la barra CAMBIA de tamaño. Si no cambia —y no tiene por qué—, el 84 se queda
 * puesto hasta que alguien recargue.
 *
 * Recordándola, omitir el argumento pasa a significar «conserva lo último que
 * medimos», que es lo que quiere decir siempre.
 */
let altoBarraMedido = BARRA_ALTO_INICIAL;

/** Vuelve al estado de una página recién cargada. Para tests. */
export function olvidarAltoBarra(): void {
  altoBarraMedido = BARRA_ALTO_INICIAL;
}

export interface HuecosDelMenu {
  sidebarW: string;
  panelTop: string;
  panelStickyTop: string;
}

/**
 * @param altoBarra alto medido de la barra. Omitirlo NO es «una fila»: es
 *   «no traigo medida nueva, usa la última buena».
 */
export function huecosDelMenu(
  horizontal: boolean,
  anchoSidebar: string,
  altoBarra?: number,
): HuecosDelMenu {
  // Un 0 tampoco es una medida: es una barra que aún no se ha pintado.
  if (altoBarra != null && altoBarra > 0) altoBarraMedido = altoBarra;
  const banda = `${Math.round(altoBarraMedido + BARRA_SEPARACION)}px`;
  return {
    sidebarW: horizontal ? '0px' : anchoSidebar,
    panelTop: horizontal ? banda : '0.5rem',
    panelStickyTop: horizontal ? banda : '0px',
  };
}
