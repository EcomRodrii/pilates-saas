'use client';

// ¿Enseña Informes el mapa de «€ por plaza»? Lo decide el servidor
// (`/api/informes/euro-plaza`). Cualquier fallo o respuesta rara = no: la
// pantalla se queda como estaba.

import { authHeader } from '@/lib/api-client';

export async function euroPorPlazaDisponible(): Promise<boolean> {
  const res = await fetch('/api/informes/euro-plaza', { headers: await authHeader() }).catch(() => null);
  if (!res?.ok) return false;
  const d = (await res.json().catch(() => null)) as { disponible?: unknown } | null;
  return d?.disponible === true;
}
