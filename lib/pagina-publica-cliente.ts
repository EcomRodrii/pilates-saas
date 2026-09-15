import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import {
  estadoConfirmado, leerEstadoPaginaPublica, type CuerpoPaginaPublica, type EstadoPaginaPublica,
} from '@/lib/configuracion/pagina-publica';

// Las dos llamadas a `/api/pagina-publica`, compartidas por la fila de
// Configuración (Mi app y mi web) y por `PanelVisibilidad` (editor de
// apariencia, en mantenimiento). Una sola forma de leer y de dar algo por
// guardado: se comprueba la respuesta ANTES de decir que ha ido bien.

/** Cómo está ahora, o `null` si no se ha podido saber (y entonces no se afirma nada). */
export async function leerPaginaPublica(): Promise<EstadoPaginaPublica | null> {
  try {
    const res = await fetch('/api/pagina-publica', { headers: await authHeader() });
    if (!res.ok) return null;
    return leerEstadoPaginaPublica(await res.json().catch(() => null));
  } catch {
    return null;
  }
}

export type ResultadoPaginaPublica = { ok: true; estado: EstadoPaginaPublica } | { ok: false; error: string };

export async function guardarPaginaPublica(cuerpo: CuerpoPaginaPublica, anterior: EstadoPaginaPublica): Promise<ResultadoPaginaPublica> {
  try {
    const res = await fetch('/api/pagina-publica', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json().catch(() => null) as { error?: unknown } | null;
    if (!res.ok) {
      return { ok: false, error: typeof data?.error === 'string' && data.error ? data.error : 'No se ha podido guardar.' };
    }
    const estado = estadoConfirmado(data, cuerpo, anterior);
    return estado ? { ok: true, estado } : { ok: false, error: 'El servidor no ha confirmado el cambio' };
  } catch (e) {
    return { ok: false, error: mensajeSeguro((e as Error).message, ERROR_RED) };
  }
}
