'use client';

// Derechos RGPD, lado PANEL: descargar los datos de una clienta, ver y cerrar
// sus solicitudes, y ejecutar la supresión. Cada función devuelve lo que dijo
// el servidor; ninguna anuncia éxito por su cuenta.

import { authHeader } from '@/lib/api-client';
import { descargarBlob, nombreDeDescarga } from '@/lib/descargar-blob';
import type { SolicitudDerechosVista } from '@/lib/socios/solicitudes-derechos';

export type Resultado = { ok: true } | { ok: false; error: string };

export interface SolicitudConSocia extends SolicitudDerechosVista {
  socia: { nombre: string; suprimida: boolean } | null;
}

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const d = (await res.json().catch(() => null)) as { error?: string } | null;
  return d?.error ?? porDefecto;
}

export async function descargarDatosSocia(socioId: string): Promise<Resultado> {
  try {
    const res = await fetch(`/api/socios/${encodeURIComponent(socioId)}/exportar`, { headers: await authHeader() });
    if (!res.ok) return { ok: false, error: await mensajeDe(res, 'No se han podido preparar sus datos.') };
    descargarBlob(await res.blob(), nombreDeDescarga(res, 'datos-clienta.json'));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/**
 * `null` = no se pudo cargar (la pantalla lo dice, no pinta «ninguna»).
 *
 * ⚠️ La forma se COMPRUEBA, no se da por hecha: esto se pinta dentro de la ficha
 * de la clienta, y un `{}` (proxy, error raro, el catch-all de los e2e) leído a
 * ciegas como `.solicitudes.filter` tumbaba la ficha entera, no solo esta tarjeta.
 */
export async function listarSolicitudesDerechos(socioId?: string):
Promise<{ solicitudes: SolicitudConSocia[]; excluirDePerfilado: boolean | null } | null> {
  try {
    const qs = socioId ? `?socioId=${encodeURIComponent(socioId)}` : '';
    const res = await fetch(`/api/socios/solicitudes-derechos${qs}`, { headers: await authHeader() });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as { solicitudes?: unknown; excluirDePerfilado?: unknown } | null;
    if (!d || !Array.isArray(d.solicitudes)) return null;
    const solicitudes = d.solicitudes.filter((s): s is SolicitudConSocia =>
      !!s && typeof s === 'object'
      && typeof (s as SolicitudConSocia).id === 'string'
      && typeof (s as SolicitudConSocia).tipo === 'string'
      && typeof (s as SolicitudConSocia).estado === 'string'
      && typeof (s as SolicitudConSocia).plazoHasta === 'string');
    return { solicitudes, excluirDePerfilado: typeof d.excluirDePerfilado === 'boolean' ? d.excluirDePerfilado : null };
  } catch {
    return null;
  }
}

export async function cerrarSolicitudDerechos(id: string, accion: 'resolver' | 'rechazar', nota?: string): Promise<Resultado> {
  try {
    const res = await fetch('/api/socios/solicitudes-derechos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ id, accion, nota }),
    });
    if (!res.ok) return { ok: false, error: await mensajeDe(res, 'No se ha podido cerrar la solicitud.') };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}

/** La supresión real es la ruta de siempre; esto solo la llama y lee su respuesta. */
export async function ejecutarSupresionSocia(socioId: string): Promise<Resultado> {
  try {
    const res = await fetch('/api/socios/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ socioId }),
    });
    if (!res.ok) return { ok: false, error: await mensajeDe(res, 'No se han podido eliminar sus datos.') };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de conexión' };
  }
}
