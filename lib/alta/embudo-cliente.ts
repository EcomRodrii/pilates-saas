import { authHeader } from '../api-client.ts';
import type { DetalleEmbudo } from './embudo.ts';

/**
 * Apunta en el embudo del alta que la propietaria compartió su enlace de
 * reservas, y por dónde (app/api/alta/paso). Nunca espera ni falla: es medir,
 * y lo que ve la persona no puede depender de que se apunte. Sin sesión no hace
 * nada. `keepalive`: el enlace de WhatsApp abre otra pestaña y la petición no
 * se corta con ella.
 */
export function apuntarEnlaceCompartido(canal: DetalleEmbudo): void {
  void (async () => {
    try {
      const cabecera = await authHeader();
      if (!('Authorization' in cabecera)) return;
      await fetch('/api/alta/paso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabecera },
        body: JSON.stringify({ paso: 'enlace_compartido', detalle: canal }),
        keepalive: true,
      });
    } catch { /* best-effort */ }
  })();
}
