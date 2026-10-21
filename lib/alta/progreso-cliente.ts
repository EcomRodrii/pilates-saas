import { authHeader } from '../api-client.ts';
import type { EventoProgreso } from './abandono.ts';

/**
 * Cuenta al servidor un paso del alta que él no ve solo (ver
 * app/api/alta/progreso). Nunca bloquea ni falla: es diagnóstico, y un alta no
 * puede quedarse esperando a que se apunte que ha fallado. Sin sesión no hace
 * nada (no hay cuenta a la que apuntarlo).
 */
export function avisarProgresoAlta(
  evento: EventoProgreso,
  estudio?: string,
  /** Alta nueva con la sesión abierta: su versión y la de los textos legales aceptados. */
  extra?: { version?: 'v2' | 'v2_prueba'; condiciones?: string },
): void {
  void (async () => {
    try {
      const cabecera = await authHeader();
      if (!('Authorization' in cabecera)) return;
      await fetch('/api/alta/progreso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabecera },
        body: JSON.stringify({ evento, ...(estudio?.trim() ? { estudio: estudio.trim() } : {}), ...(extra ?? {}) }),
        keepalive: true,
      });
    } catch { /* best-effort */ }
  })();
}
