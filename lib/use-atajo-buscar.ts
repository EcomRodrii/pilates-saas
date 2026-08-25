'use client';

import { useSyncExternalStore } from 'react';

// Atajo de teclado del buscador global: "⌘K" no existe fuera de Mac (topbar.tsx,
// global-search.tsx). Solo se puede saber en cliente — useSyncExternalStore en
// vez de setState-en-efecto (prohibido por el lint del React Compiler) porque
// no hay ningún evento al que suscribirse, solo un valor fijo por sesión que
// difiere entre el snapshot de servidor y el de cliente. Fichero propio (no
// lib/utils.ts) porque ese lo importan Server Components, y useSyncExternalStore
// rompe el build de Turbopack ahí (#1383).
function noOp() { return () => {}; }
function snapshotAtajoBuscar(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent) ? '⌘K' : 'Ctrl+K';
}
export function useAtajoBuscar(): string {
  return useSyncExternalStore(noOp, snapshotAtajoBuscar, () => '⌘K');
}
