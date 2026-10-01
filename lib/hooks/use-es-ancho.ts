'use client';

import { useSyncExternalStore } from 'react';

// ¿Cabe la lista y una ficha a la vez? Desde 1180 px de ventana: el iPad de
// recepción en horizontal (1180 × 820) y cualquier escritorio. Por debajo, abrir
// una clienta navega a su página como siempre.
//
// `useSyncExternalStore` y no un efecto con `setState`: se suscribe al cambio de
// tamaño sin un render intermedio, y en servidor responde `false` (sin ventana),
// así que la hidratación no discrepa.
const CONSULTA = '(min-width: 1180px)';

function suscribir(aviso: () => void): () => void {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener('change', aviso);
  return () => mq.removeEventListener('change', aviso);
}

export function useEsAncho(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
