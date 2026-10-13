'use client';

// «Plazas que dejaron vacías» (P3.15): lo cuenta el servidor
// (`/api/informes/plazas-vacias`). La sonda decide si se enseña; cualquier fallo
// de la sonda = no, y la pantalla se queda como estaba. Un fallo AL CALCULAR,
// con la pieza encendida, se dice («no se ha podido»), nunca una lista vacía.

import { authHeader } from '@/lib/api-client';
import type { FilaPlazasVacias } from './plazas-vacias';

const RUTA = '/api/informes/plazas-vacias';

export type EstadoPlazasVacias =
  | { estado: 'cargando' }
  | { estado: 'ok'; filas: FilaPlazasVacias[] }
  | { estado: 'error' };

export async function plazasVaciasDisponible(): Promise<boolean> {
  const res = await fetch(RUTA, { headers: await authHeader() }).catch(() => null);
  if (!res?.ok) return false;
  const d = (await res.json().catch(() => null)) as { disponible?: unknown } | null;
  return d?.disponible === true;
}

export async function pedirPlazasVacias(desde: string, hasta: string): Promise<EstadoPlazasVacias> {
  const q = new URLSearchParams({ desde, hasta });
  const res = await fetch(`${RUTA}?${q}`, { headers: await authHeader() }).catch(() => null);
  if (!res?.ok) return { estado: 'error' };
  const d = (await res.json().catch(() => null)) as { disponible?: unknown; filas?: unknown } | null;
  if (d?.disponible !== true || !Array.isArray(d.filas)) return { estado: 'error' };
  const filas = (d.filas as Record<string, unknown>[]).filter(f =>
    typeof f.socioId === 'string' && [f.tarde, f.sinVenir, f.conPlaza].every(x => typeof x === 'number'));
  return { estado: 'ok', filas: filas as unknown as FilaPlazasVacias[] };
}
