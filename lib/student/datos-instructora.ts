'use client';

import { portalAuthHeader } from '@/lib/api-client';
import { getClases, getReservas } from '@/lib/student/datos';
import type { BajaConClase, ClaseQueDa, ClaseQueReserva } from '@/lib/student/agenda-instructora';

// Adaptador de datos de la instructora en la app. Delgado a propósito, como
// `datos.ts`: pide y devuelve; lo que decide vive en el servidor.

export interface AgendaInstructoraVista {
  clases: ClaseQueDa[];
  bajas: BajaConClase[];
}

/** Sus clases y sus bajas entre dos días (YYYY-MM-DD, ambos incluidos). */
export async function getAgendaInstructora(slug: string, desde: string, hasta: string): Promise<AgendaInstructoraVista> {
  const auth = await portalAuthHeader();
  const res = await fetch('/api/portal/instructora/agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ slug, desde, hasta }),
  });
  if (!res.ok) throw new Error(`instructora/agenda ${res.status}`);
  // ⚠️ Nunca dar por hecha la forma de la respuesta: un `{}` no puede tumbar la
  // pantalla (lo aprendió el dashboard del panel con un e2e ajeno).
  const d = await res.json() as Partial<AgendaInstructoraVista>;
  return {
    clases: Array.isArray(d.clases) ? d.clases : [],
    bajas: Array.isArray(d.bajas) ? d.bajas : [],
  };
}

/**
 * Las clases a las que viene COMO ALUMNA, para la agenda única.
 *
 * Sale del mismo catálogo que usa la app de la alumna (ni una petición nueva):
 * solo tiene sentido si además tiene ficha de alumna en el estudio, y quien
 * llama lo decide con la sesión.
 */
export async function getClasesComoAlumna(slug: string, desde: string, hasta: string): Promise<ClaseQueReserva[]> {
  const [reservas, clases] = await Promise.all([getReservas(slug), getClases(slug)]);
  const porId = new Map(clases.map((c) => [c.id, c]));
  const filas: ClaseQueReserva[] = [];
  for (const r of reservas) {
    if (r.estado !== 'confirmada' && r.estado !== 'en-espera') continue;
    const c = porId.get(r.claseId);
    if (!c || c.fecha < desde || c.fecha > hasta) continue;
    filas.push({
      reservaId: r.id, claseId: c.id, inicio: c.inicio, fecha: c.fecha, hora: c.hora,
      tipo: c.nombre, sala: c.sala || null, enEspera: r.estado === 'en-espera',
    });
  }
  return filas;
}
