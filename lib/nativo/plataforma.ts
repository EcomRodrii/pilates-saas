// ¿Esta página la está abriendo la app nativa? Puro (plataforma.test.ts).
//
// No importa `@capacitor/core` a propósito: dentro de la app, Capacitor mete
// su puente (`window.Capacitor`) en el WebView ANTES de que cargue la página,
// así que basta con mirarlo. Importar el paquete en la web solo para saber que
// no estamos en la app costaría bytes en cada carga de la web.

interface PuenteCapacitor {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

export function esNativoSegun(capacitor: unknown): boolean {
  if (!capacitor || typeof capacitor !== 'object') return false;
  const c = capacitor as PuenteCapacitor;
  try {
    return typeof c.isNativePlatform === 'function' && c.isNativePlatform() === true;
  } catch {
    return false;
  }
}

/** 'ios' | 'android' dentro de la app; `null` en la web. */
export function plataformaSegun(capacitor: unknown): 'ios' | 'android' | null {
  if (!esNativoSegun(capacitor)) return null;
  const p = (capacitor as PuenteCapacitor).getPlatform?.();
  return p === 'ios' || p === 'android' ? p : null;
}
