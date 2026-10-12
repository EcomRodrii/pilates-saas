'use client';

// Llamadas del Calendario a `/api/series/repetir-mes`. Nada optimista: lo que
// se pinta es lo que devuelve el servidor, y un cuerpo con otra forma se trata
// como fallo (o como «no disponible»: sin datos fiables, no hay botón).

import { authHeader } from '@/lib/api-client';
import type { PropuestaRepetir, ResultadoRepetir } from './repetir-mes';

const RUTA = '/api/series/repetir-mes';
const SIN_RED = 'No se ha podido conectar. Inténtalo de nuevo.';

export async function repetirMesDisponible(): Promise<boolean> {
  const res = await fetch(RUTA, { headers: await authHeader() }).catch(() => null);
  if (!res?.ok) return false;
  const d = (await res.json().catch(() => null)) as { disponible?: unknown } | null;
  return d?.disponible === true;
}

async function post(cuerpo: Record<string, unknown>) {
  const res = await fetch(RUTA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(cuerpo),
  }).catch(() => null);
  if (!res) return { ok: false as const, datos: null };
  return { ok: res.ok, datos: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const error = (d: Record<string, unknown> | null, porDefecto: string) =>
  ({ ok: false as const, error: typeof d?.error === 'string' ? d.error : d ? porDefecto : SIN_RED });

export async function proponerRepetirMes(mes: string): Promise<{ ok: true; propuesta: PropuestaRepetir } | { ok: false; error: string }> {
  const r = await post({ accion: 'proponer', mes });
  const p = r.datos?.propuesta as PropuestaRepetir | undefined;
  if (r.ok && r.datos?.ok === true && p && Array.isArray(p.series) && Array.isArray(p.festivos) && typeof p.destino === 'string') {
    return { ok: true, propuesta: p };
  }
  return error(r.datos, 'No se ha podido preparar el mes.');
}

export async function crearRepetirMes(
  mes: string, series: { serieId: string; periodoVisto: number; fechas: string[] }[],
): Promise<{ ok: true; resultado: ResultadoRepetir } | { ok: false; error: string }> {
  const r = await post({ accion: 'crear', mes, series });
  const res = r.datos?.resultado as ResultadoRepetir | undefined;
  if (r.ok && r.datos?.ok === true && res && typeof res.creadas === 'number' && Array.isArray(res.ids)) {
    return { ok: true, resultado: res };
  }
  return error(r.datos, 'No se ha creado ninguna clase. Inténtalo de nuevo.');
}
