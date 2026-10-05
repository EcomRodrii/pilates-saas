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

/**
 * La versión mayor de iOS según el user agent (`… iPhone OS 16_6 like Mac OS X …`),
 * o `null` si no es un iPhone/iPad reconocible. El WKWebView de la app lleva el
 * mismo formato que Safari.
 */
export function versionIosSegun(ua: string): number | null {
  const m = /(?:iPhone|iPad|iPod)[^)]*?OS (\d+)[_.]/.exec(ua);
  return m ? Number(m[1]) : null;
}

/**
 * ¿La hoja de iOS para añadir un evento funciona sin pedir acceso al
 * calendario? Solo desde iOS 17 (la presenta el sistema, fuera de la app). En
 * iOS 15 y 16 va dentro de la app y, sin acceso, no tiene dónde guardar: ahí se
 * usa el .ics por la hoja de compartir, como siempre.
 */
export function hojaDeCalendarioSinPermiso(ua: string): boolean {
  const v = versionIosSegun(ua);
  return v !== null && v >= 17;
}
