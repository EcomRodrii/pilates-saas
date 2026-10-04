// La decisión de `pasoDelPortal` (./doble-factor-portal.ts), pura, para
// probarla con node --test sin navegador.

export type PasoPortal = 'ok' | 'dos-pasos';

/**
 * Con lo que dice la sesión del dispositivo:
 *   · sin la verificación activada (el siguiente nivel no es `aal2`) → 'ok', sin red;
 *   · ya en `aal2` (escribió el código de la app) → 'ok';
 *   · confiada ya en esta carga → 'ok';
 *   · si no → 'preguntar' al servidor (dispositivo recordado o código del correo).
 */
export function decidirPasoPortal(p: { actual: string | null; siguiente: string | null; yaConfiada: boolean }): PasoPortal | 'preguntar' {
  if (p.siguiente !== 'aal2') return 'ok';
  if (p.actual === 'aal2') return 'ok';
  if (p.yaConfiada) return 'ok';
  return 'preguntar';
}

/**
 * A dónde volver tras el segundo paso. Solo rutas de la app de ESTE estudio o
 * de su página de reservas: el parámetro llega por la URL y, sin esto, la
 * pantalla sería un redirector abierto (mismo criterio que el `?next=` del login).
 */
export function destinoTrasDosPasos(next: string | null | undefined, slug: string): string {
  const inicio = `/portal/${encodeURIComponent(slug)}`;
  if (!next || /[\u0000-\u001f\u007f\\]/.test(next) || next.startsWith('//')) return inicio;
  const base = 'https://origen.invalid';
  let url: URL;
  try { url = new URL(next, base); } catch { return inicio; }
  if (url.origin !== base) return inicio;
  const ruta = url.pathname + url.search + url.hash;
  // La ruta exacta o algo DEBAJO de ella: `/reservar/casaotra` no es `/reservar/casa`.
  const dentroDe = (raiz: string) => url.pathname === raiz || url.pathname.startsWith(`${raiz}/`);
  if (!dentroDe(inicio) && !dentroDe(`/reservar/${encodeURIComponent(slug)}`)) return inicio;
  // Nunca de vuelta a la propia pantalla del segundo paso.
  return dentroDe(`${inicio}/acceso/dos-pasos`) ? inicio : ruta;
}
