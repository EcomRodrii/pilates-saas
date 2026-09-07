// Dónde aterriza lo que se renderiza en un portal DENTRO del panel.
//
// ⚠️ El problema que resuelve: `PanelThemeProvider` pone la clase `.dark` en un
// <div>, nunca en <html> —a propósito, para no teñir la app de socias, que vive
// en la misma aplicación—. Un `createPortal(…, document.body)` sale de ese div,
// así que los tokens vuelven a los CLAROS: la hoja aparece blanca sobre un
// panel oscuro y cualquier texto pensado para fondo oscuro queda blanco sobre
// blanco. Es el «no se ven ni letras ni números» del modo oscuro.
//
// La razón de portalear sigue siendo válida y no se toca: `position: fixed` deja
// de medirse contra el viewport si un ancestro tiene transform/filter (topbar
// usa backdrop-blur, y `.panel-page-in` anima con transform). Lo que cambia es
// el DESTINO: un anfitrión que cuelga directo del contenedor del tema —dentro
// de `.dark`, fuera de lo transformado—, en vez de `document.body`.

export const ID_ANFITRION_PANEL = 'panel-portal-host';

/**
 * El anfitrión del panel si existe; si no, `document.body`.
 *
 * El respaldo importa: estos mismos componentes se usan FUERA del panel (app de
 * la alumna, widget), donde no hay anfitrión ni `.dark` que respetar. Ahí el
 * comportamiento tiene que seguir siendo exactamente el de antes.
 */
export function anfitrionPortal(): HTMLElement {
  if (typeof document === 'undefined') return null as unknown as HTMLElement;
  return document.getElementById(ID_ANFITRION_PANEL) ?? document.body;
}
