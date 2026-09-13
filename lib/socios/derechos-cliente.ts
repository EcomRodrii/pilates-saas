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

/** `null` = no se pudo cargar (la pantalla lo dice, no pinta «ninguna»). */
export async function listarSolicitudesDerechos(socioId?: string):
Promise<{ solicitudes: SolicitudConSocia[]; excluirDePerfilado: boolean | null } | null> {
  try {
    const qs = socioId ? `?socioId=${encodeURIComponent(socioId)}` : '';
    const res = await fetch(`/api/socios/solicitudes-derechos${qs}`, { headers: await authHeader() });
    if (!res.ok) return null;
    return await res.json();
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
