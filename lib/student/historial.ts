'use client';

import { portalAuthHeader } from '@/lib/student/api-publica';
import type { ClaseDelHistorial } from '@/lib/student/estadisticas';

// Sus clases pasadas (`POST /api/public/historial`): la única fuente de «clases hechas». Ver `estadisticas.ts`.
//
// `null` = no se ha podido leer (sin sesión, sin red, el servidor falla). Quien lo pinte NO lo trata como «cero clases»:
// sin dato no hay cifra, y el bloque se calla. Un 0 a una alumna que viene cada semana es peor que no decir nada.
//
// Inicio y Mi plan lo piden los dos: un minuto de memoria evita la segunda ida y vuelta al cambiar de pestaña.

const MEMORIA_MS = 60_000;
const memoria = new Map<string, { en: number; datos: Promise<ClaseDelHistorial[] | null> }>();

export function getHistorial(studioId: string): Promise<ClaseDelHistorial[] | null> {
  const guardado = memoria.get(studioId);
  if (guardado && Date.now() - guardado.en < MEMORIA_MS) return guardado.datos;
  const datos = pedir(studioId);
  memoria.set(studioId, { en: Date.now(), datos });
  // Un fallo no se recuerda: el siguiente intento vuelve a preguntar.
  void datos.then((d) => { if (d === null) memoria.delete(studioId); });
  return datos;
}

async function pedir(studioId: string): Promise<ClaseDelHistorial[] | null> {
  try {
    const auth = await portalAuthHeader();
    if (!auth.Authorization) return null;
    const res = await fetch('/api/public/historial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      // 100 es el tope del servidor: de sobra para cuatro semanas.
      body: JSON.stringify({ studioId, limite: 100 }),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as { clases?: ClaseDelHistorial[] } | null;
    return Array.isArray(d?.clases) ? d.clases : null;
  } catch {
    return null;
  }
}
