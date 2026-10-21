import { authHeader } from '../api-client.ts';
import type { DetalleEmbudo } from './embudo.ts';

/** Pide a app/api/alta/paso que apunte un paso. Nunca espera ni falla: es medir. */
function pedir(cuerpo: Record<string, unknown>): void {
  void (async () => {
    try {
      const cabecera = await authHeader();
      if (!('Authorization' in cabecera)) return;
      await fetch('/api/alta/paso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabecera },
        body: JSON.stringify(cuerpo),
        keepalive: true,
      });
    } catch { /* best-effort */ }
  })();
}

/**
 * Apunta en el embudo del alta que la propietaria compartió su enlace de
 * reservas, y por dónde (app/api/alta/paso). Nunca espera ni falla: es medir,
 * y lo que ve la persona no puede depender de que se apunte. Sin sesión no hace
 * nada. `keepalive`: el enlace de WhatsApp abre otra pestaña y la petición no
 * se corta con ella.
 */
export function apuntarEnlaceCompartido(canal: DetalleEmbudo): void {
  pedir({ paso: 'enlace_compartido', detalle: canal });
}

/**
 * Pide apuntar que terminó «Tu estudio» (paso 3 del alta nueva). Se llama DESPUÉS
 * de que la base de datos haya confirmado lo guardado, y aun así la ruta lo
 * vuelve a mirar allí antes de apuntarlo.
 */
export function apuntarTuEstudio(): void {
  pedir({ paso: 'config_completada' });
}

/**
 * El recorrido rápido de tres paradas ya salió (PR-5): no vuelve a salir solo,
 * ni en este navegador (lo recuerda también quien lo enseña) ni en otro.
 */
export function apuntarRecorridoVisto(): void {
  pedir({ paso: 'recorrido_visto' });
}

/** «Tu plan, sin sorpresas» ya se enseñó: sale UNA vez, tras la primera reserva (PR-5). */
export function apuntarPlanEnsenado(): void {
  pedir({ paso: 'plan_ensenado' });
}
