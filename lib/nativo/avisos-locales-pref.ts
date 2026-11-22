// ¿Quiere esta alumna los avisos de clase en ESTE iPhone? Es del dispositivo, no
// del servidor (los avisos locales no pasan por él). Encendidos de serie.

const CLAVE = 'tentare-avisos-locales';

export function avisosLocalesEncendidos(): boolean {
  try { return window.localStorage.getItem(CLAVE) !== 'off'; } catch { return true; }
}

export function guardarAvisosLocales(encendido: boolean): void {
  try {
    if (encendido) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, 'off');
  } catch { /* sin almacenamiento: se queda el valor de serie */ }
}
