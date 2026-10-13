'use client';

import { authHeader } from '@/lib/api-client';

/**
 * ¿Ve este estudio «Tu Tentare»? Lo decide el servidor (interruptor
 * `TU_TENTARE` y que sea la propietaria). Cualquier fallo o respuesta rara es
 * «no»: Configuración se queda exactamente como estaba.
 */
export async function tuTentareActivo(): Promise<boolean> {
  try {
    const res = await fetch('/api/configuracion/tu-tentare', { headers: await authHeader() });
    if (!res.ok) return false;
    const d = (await res.json()) as { activo?: unknown } | null;
    return d?.activo === true;
  } catch {
    return false;
  }
}
