'use client';

// Tema día/noche del portal de la clienta. Ligero: estado local + localStorage +
// un evento de ventana para que Shell y páginas se sincronicen sin contexto.
// El color de marca sigue siendo --portal-brand (lo pone el tema publicado del
// estudio); esto solo controla los neutros.
//
// La paleta vive en `lib/portal-paleta.ts` (datos puros, con test de contraste);
// aquí solo está el hook. Se reexporta para no romper ningún import existente.

import { useEffect, useState, useCallback } from 'react';
import { MODO_TOKENS, type Modo, type ModoTokens } from './portal-paleta';

export { MODO_TOKENS };
export type { Modo, ModoTokens };

const KEY = 'pilates:portal-modo';
const EVT = 'pilates:portal-modo-change';

// Arranca en DÍA: el diseño del portal es claro, y hasta ahora la clienta que
// nunca tocaba el interruptor no llegaba a verlo. Quien ya eligió noche a mano
// conserva su elección — está en localStorage y se lee tal cual.
const POR_DEFECTO: Modo = 'dia';

function readModo(): Modo {
  if (typeof window === 'undefined') return POR_DEFECTO;
  const v = window.localStorage.getItem(KEY);
  return v === 'dia' || v === 'noche' ? v : POR_DEFECTO;
}

export function useModo() {
  const [modo, setModoState] = useState<Modo>(POR_DEFECTO);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee localStorage y escucha eventos 'storage' para sincronizar entre pestañas. Sistema externo.
    setModoState(readModo());
    const sync = () => setModoState(readModo());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const setModo = useCallback((m: Modo) => {
    try { window.localStorage.setItem(KEY, m); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVT));
    setModoState(m);
  }, []);

  const toggle = useCallback(() => setModo(readModo() === 'noche' ? 'dia' : 'noche'), [setModo]);

  const noche = modo === 'noche';
  return { modo, noche, toggle, setModo, t: MODO_TOKENS[modo] };
}
