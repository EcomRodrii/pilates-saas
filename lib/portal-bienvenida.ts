// Lógica pura de "¿ya vio la bienvenida en este dispositivo?" (tema
// "Editorial", galería de temas). Separado del componente para poder
// testearse sin localStorage/React — mismo principio que lib/portal-modo.tsx.

const PREFIJO = 'pilates:portal-bienvenida-vista:';

export function claveBienvenida(slug: string): string {
  return `${PREFIJO}${slug}`;
}

export function yaVioBienvenida(slug: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(claveBienvenida(slug)) === '1';
  } catch {
    // Storage bloqueado (modo privado estricto, cuota) — no bloquear la
    // pantalla de login por esto: se comporta como si ya la hubiera visto.
    return true;
  }
}

export function marcarBienvenidaVista(slug: string): void {
  try {
    window.localStorage.setItem(claveBienvenida(slug), '1');
  } catch {
    /* ignore */
  }
}
