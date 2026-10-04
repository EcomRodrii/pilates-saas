'use client';

// Las clases que se repiten (las que la alumna puede hacer su clase fija), desde su app. Mismo contrato que el resto de
// llamadas de la app: nunca lanza. `null` = no se ha podido saber (sin red, error, o una respuesta con otra forma).

import { portalAuthHeader } from '@/lib/student/api-publica';
import type { CatalogoClasesFijas } from '@/lib/clases-fijas-reglas';

export async function pedirCatalogoClasesFijas(slug: string): Promise<CatalogoClasesFijas | null> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/clases-fijas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as Partial<CatalogoClasesFijas> | null;
    if (!d || !Array.isArray(d.sueltas)) return null;
    // Las clases fijas con nombre se retiraron el 4-oct-2026: el servidor ya no manda ninguna.
    return { ofertas: [], sueltas: d.sueltas, pedidas: [] };
  } catch {
    return null;
  }
}
