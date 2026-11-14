import { authHeader } from '@/lib/api-client';
import type { EstadoPaso, FilaPaso, IdOrigen } from './recorrido';

// El navegador habla con `/api/migracion/recorrido` (lo guardado por la propietaria). Los pasos de datos no pasan por aquí.
export async function cargarRecorrido(): Promise<{ ok: true; filas: FilaPaso[]; origen: IdOrigen | null; sinTabla: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/migracion/recorrido', { headers: await authHeader() });
    const d = (await res.json().catch(() => ({}))) as { filas?: FilaPaso[]; origen?: IdOrigen | null; error?: string; sinTabla?: boolean };
    if (!res.ok) return { ok: false, error: d.error ?? 'No se ha podido cargar el recorrido.' };
    return { ok: true, filas: Array.isArray(d.filas) ? d.filas : [], origen: d.origen ?? null, sinTabla: d.sinTabla === true };
  } catch {
    return { ok: false, error: 'No hay conexión. Vuelve a intentarlo en un momento.' };
  }
}

export async function guardarPaso(p: { paso: string; estado: EstadoPaso; nota?: string | null; origen?: IdOrigen }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/migracion/recorrido', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(p),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: d.error ?? 'No se ha podido guardar.' };
  } catch {
    return { ok: false, error: 'No hay conexión: no se ha guardado. Vuelve a intentarlo.' };
  }
}
