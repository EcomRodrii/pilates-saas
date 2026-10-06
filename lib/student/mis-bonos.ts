'use client';

import { portalAuthHeader } from '@/lib/student/api-publica';
import type { MovimientoBonoVista } from '@/lib/student/movimientos-bono';
import type { SemanaCuota } from '@/lib/student/semana-cuota';

// Lo que Bonos pide aparte del payload (`POST /api/public/mis-bonos`): los movimientos de un bono y «esta semana» de su
// cuota. ⚠️ LANZA si la respuesta no es buena o no tiene la forma esperada, como `getMisDerechos`: la tarjeta pinta su
// error, nunca una lista vacía o un «0 de 2» inventados.

export interface MovimientosVista {
  movimientos: MovimientoBonoVista[];
  hayMas: boolean;
  cuadra: boolean;
  historialCompleto: boolean;
  desde: string | null;
}

export interface SemanaVista extends SemanaCuota { suscripcionId: string; desde: string; hasta: string }

export interface DetalleBonos { movimientos: MovimientosVista | null; semanas: SemanaVista[] }

export async function getDetalleBonos(slug: string, p: {
  bono?: string | null; semanaDe?: string[]; limite?: number; antes?: { creadoEn: string; id: string } | null;
}): Promise<DetalleBonos> {
  const res = await fetch('/api/public/mis-bonos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify({ slug, bono: p.bono ?? null, semanaDe: p.semanaDe ?? [], limite: p.limite, antes: p.antes ?? null }),
  });
  if (!res.ok) throw new Error(`mis-bonos respondió ${res.status}`);
  const d = (await res.json().catch(() => null)) as { movimientos?: unknown; semanas?: unknown } | null;
  if (!d || !Array.isArray(d.semanas) || (d.movimientos !== null && (typeof d.movimientos !== 'object' || !Array.isArray((d.movimientos as MovimientosVista).movimientos)))) {
    throw new Error('mis-bonos devolvió una respuesta sin la forma esperada');
  }
  return { movimientos: d.movimientos as MovimientosVista | null, semanas: d.semanas as SemanaVista[] };
}
