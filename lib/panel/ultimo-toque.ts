// ─────────────────────────────────────────────────────────────────────────────
// Dónde tocó la persona por última vez, para que un diálogo nazca de ahí.
//
// Un diálogo no sabe qué botón lo abrió (lo abre un estado, no el botón), pero
// sí puede saber dónde fue el último clic: si fue hace un instante, fue ese. Así
// crece desde el botón, como una ventana desde el Dock, en vez de aparecer en el
// centro de la nada. Si el último toque es viejo (se abrió por teclado, por un
// aviso o al cargar), nace desde su propio centro.
// ─────────────────────────────────────────────────────────────────────────────

export interface Toque { x: number; y: number; en: number }

/** Más que esto entre el clic y la apertura, y ya no se considera «el botón que lo abrió». */
export const VIGENCIA_TOQUE_MS = 700;

let ultimo: Toque | null = null;
let escuchando = false;

/** Se instala una sola vez, en captura: ningún `stopPropagation` de una pantalla lo tapa. */
export function escucharToques(): void {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  window.addEventListener('pointerdown', (e) => {
    ultimo = { x: e.clientX, y: e.clientY, en: Date.now() };
  }, { capture: true, passive: true });
}

export function toqueReciente(ahora = Date.now()): Toque | null {
  return ultimo && ahora - ultimo.en <= VIGENCIA_TOQUE_MS ? ultimo : null;
}

/**
 * El `transform-origin` (en px, relativo a la caja) para que un elemento crezca
 * desde el punto tocado. `centro` es el centro que ocupa en pantalla y `caja` su
 * tamaño de maquetación: durante la animación va escalado, pero escalar respecto
 * a un punto no mueve el centro, así que centro + tamaño sin escalar dan la
 * esquina real. Puro, para probarlo.
 */
export function origenDesdeToque(
  toque: { x: number; y: number },
  centro: { x: number; y: number },
  caja: { ancho: number; alto: number },
): string {
  const izquierda = centro.x - caja.ancho / 2;
  const arriba = centro.y - caja.alto / 2;
  return `${Math.round(toque.x - izquierda)}px ${Math.round(toque.y - arriba)}px`;
}

/**
 * Hace que el elemento que acaba de montarse nazca del último toque, si fue hace
 * un instante. Para un ref de función: corre antes de pintar.
 */
export function nacerDelToque(el: HTMLElement | null): void {
  if (!el) return;
  const toque = toqueReciente();
  if (!toque) return;
  const r = el.getBoundingClientRect();
  el.style.transformOrigin = origenDesdeToque(
    toque,
    { x: r.left + r.width / 2, y: r.top + r.height / 2 },
    { ancho: el.offsetWidth, alto: el.offsetHeight },
  );
}

/** Solo para los tests. */
export function _fijarToque(t: Toque | null): void { ultimo = t; }
