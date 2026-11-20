'use client';

// «Acabo de crear mi estudio y voy hacia su bienvenida»: una marca de la pestaña (sessionStorage) que pone
// `alta-nueva.tsx` al llegar a «Tu estudio ya existe». Mientras está puesta, el panel pinta una pantalla de carga
// oscura y neutra (con el logo) en vez del esqueleto claro del panel: sin ella, al pulsar «Configurar mi estudio» se
// veía un instante el panel y, de golpe, la bienvenida oscura («un engaño de ir al panel», 20-nov-2026).
// Se quita sola cuando la bienvenida aparece o el estudio ya la tiene vista.

import { useSyncExternalStore } from 'react';

const CLAVE = 'tentare-alta-en-curso';
const oyentes = new Set<() => void>();
const avisar = () => { for (const f of oyentes) f(); };

function leer(): boolean {
  try { return window.sessionStorage.getItem(CLAVE) === '1'; } catch { return false; }
}

export function marcarAltaEnCurso(): void {
  try { window.sessionStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento: el esqueleto de siempre */ }
  avisar();
}

export function limpiarAltaEnCurso(): void {
  try { window.sessionStorage.removeItem(CLAVE); } catch { /* idem */ }
  avisar();
}

/** ¿Viene de crear su estudio en esta pestaña? En el servidor, siempre `false`. */
export function useAltaEnCurso(): boolean {
  return useSyncExternalStore(
    (cb) => { oyentes.add(cb); return () => { oyentes.delete(cb); }; },
    leer,
    () => false,
  );
}
