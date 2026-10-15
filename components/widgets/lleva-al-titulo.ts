// Al cambiar de paso en el constructor de Widgets (panel nuevo), la página tiene que
// quedar con el TÍTULO del paso nuevo a la vista. `focus()` a secas solo asegura que
// el contenedor «se vea un poco» y dejaba la pantalla a media altura (en «Cómo se
// ve» se aterrizaba en «Color de los botones»), como si «Siguiente» no hubiera hecho
// nada. Y la barra de arriba (sticky y translúcida) y, en el móvil, la barra de volver
// tapan lo que pasa por debajo: se descuenta lo que haya clavado arriba.

/** Lo que ocupan, arriba del todo, las barras fijas o pegadas (px desde el borde de la ventana). */
export function altoDeBarrasArriba(doc: Document = document): number {
  let alto = 0;
  const ancho = doc.documentElement.clientWidth;
  const barras = Array.from(doc.querySelectorAll<HTMLElement>('[data-panel-topbar], .sticky, .fixed'))
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .sort((a, b) => a.r.top - b.r.top);
  for (const { el, r } of barras) {
    const estilo = getComputedStyle(el);
    if (estilo.position !== 'sticky' && estilo.position !== 'fixed') continue;
    // Una barra de arriba: ancha, baja y pegada al borde (o a otra barra) de arriba.
    if (r.width < ancho * 0.6 || r.height > 160 || r.height < 24) continue;
    if (r.top > alto + 2 || r.bottom <= 0) continue;
    alto = Math.max(alto, r.bottom);
  }
  return alto;
}

/** Lleva `el` justo debajo de las barras de arriba. Respeta `prefers-reduced-motion`. */
export function llevarAlTitulo(el: HTMLElement) {
  const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const arriba = el.getBoundingClientRect().top + window.scrollY - altoDeBarrasArriba() - 16;
  window.scrollTo({ top: Math.max(0, Math.round(arriba)), behavior: reducir ? 'auto' : 'smooth' });
}
