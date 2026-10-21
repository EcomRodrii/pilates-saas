// ─────────────────────────────────────────────────────────────────────────────
// La vista previa de la app de la alumna con un BORRADOR encima: la app real
// (`/portal/<slug>`) en un iframe del mismo origen, y lo que se está eligiendo
// pintado como un `<style>` más específico que lo publicado. Así se ve con los
// datos de verdad y nada llega a las alumnas hasta publicar.
//
// Es el mecanismo de «Apariencia de tu app»
// (components/apariencia/editor-apariencia-app.tsx), sacado aquí para que el
// paso «Tu marca» del alta nueva use el mismo y no un dibujo de la app.
// ─────────────────────────────────────────────────────────────────────────────

const ID_ESTILO_BORRADOR = 'apariencia-borrador';

// Un iPhone le da a la app un margen arriba (isla y hora) y abajo (indicador de inicio) con
// `env(safe-area-inset-*)`; dentro de un iframe esos márgenes valen 0 y la cabecera quedaría
// debajo de la isla. La app los lee de estas dos variables: aquí se les dan los del iPhone 17.
const MARGEN_IPHONE = 'html .student-app { --safe-top: 62px; --safe-bottom: 34px; }\n';

/** Pinta el borrador dentro de la app del iframe. Mismo origen: se escribe en su `<head>`. */
export function pintarBorrador(iframe: HTMLIFrameElement | null, css: string) {
  const doc = iframe?.contentDocument;
  if (!doc?.head) return;
  let el = doc.getElementById(ID_ESTILO_BORRADOR);
  if (!el) {
    el = doc.createElement('style');
    el.id = ID_ESTILO_BORRADOR;
    doc.head.appendChild(el);
  }
  el.textContent = MARGEN_IPHONE + css;
}
