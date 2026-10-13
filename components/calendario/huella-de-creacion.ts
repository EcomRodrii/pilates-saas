'use client';

// HuellaDeCreacion (P2.3, doc 07 §6): tras crear, señalar DÓNDE está lo creado.
// Imperativo a propósito (sin estado de React): el calendario se vuelve a
// pintar al recargar sus datos, y esto espera a que las clases nuevas estén en
// el DOM (`data-sesion-id`, en tarjeta-clase.tsx), las desplaza a la vista y
// las marca 1,2 s. Si en 3 s no han aparecido (otra vista, un filtro), se
// rinde sin error: el toast «· Ver» sigue llevando a ellas.

const ESPERA_MAX_MS = 3000;
const DURACION_MS = 1200;

export function señalarClasesCreadas(ids: readonly string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  const inicio = Date.now();
  const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const intentar = () => {
    const els = ids
      .map(id => document.querySelector<HTMLElement>(`[data-sesion-id="${CSS.escape(id)}"]`))
      .filter((el): el is HTMLElement => !!el);
    if (els.length === 0) {
      if (Date.now() - inicio < ESPERA_MAX_MS) window.setTimeout(intentar, 100);
      return;
    }
    els[0].scrollIntoView({ block: 'center', inline: 'center', behavior: reducir ? 'auto' : 'smooth' });
    for (const el of els) el.classList.add('huella-creacion');
    window.setTimeout(() => { for (const el of els) el.classList.remove('huella-creacion'); }, DURACION_MS);
  };
  intentar();
}
