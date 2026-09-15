'use client';

// Llamada del calendario a `/api/calendario/horario`. `null` = no se ha podido
// saber (sin red, error del servidor o respuesta con otra forma): la vista lo
// dice y ofrece reintentar, nunca pinta un horario vacío que no lo es.

import { authHeader } from '@/lib/api-client';
import type { HorarioFijo } from '@/lib/horario-fijo';

export async function pedirHorario(): Promise<HorarioFijo | null> {
  const respuesta = await fetch('/api/calendario/horario', { headers: await authHeader() }).catch(() => null);
  if (!respuesta?.ok) return null;
  const datos = (await respuesta.json().catch(() => null)) as Partial<HorarioFijo> & { ok?: boolean } | null;
  if (!datos?.ok || !Array.isArray(datos.dias) || !Array.isArray(datos.huerfanas)) return null;
  return { dias: datos.dias, huerfanas: datos.huerfanas };
}
