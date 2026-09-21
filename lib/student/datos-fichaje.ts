'use client';

import { portalAuthHeader } from '@/lib/api-client';
import type { EstadoFichaje } from '@/lib/fichaje/fichaje-servidor';

// Adaptador del fichaje de la instructora. Delgado, como `datos-instructora.ts`:
// pide y devuelve; lo que decide vive en `/api/portal/instructora/fichaje`.

export type { EstadoFichaje };
export type AccionFichaje = 'estado' | 'entrada' | 'salida';

export interface RespuestaFichaje {
  estado: EstadoFichaje;
  /** Entrar con una jornada ya abierta: no se creó otra. */
  yaAbierta: boolean;
  /** Salir sin jornada abierta: ya estaba cerrada. */
  yaCerrada: boolean;
  minutos: number | null;
}

export async function fichar(slug: string, accion: AccionFichaje): Promise<RespuestaFichaje> {
  const res = await fetch('/api/portal/instructora/fichaje', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify({ slug, accion }),
  });
  if (!res.ok) throw new Error(`instructora/fichaje ${res.status}`);
  // Nunca dar por hecha la forma de la respuesta: un `{}` no puede tumbar la pantalla.
  const d = await res.json() as Partial<RespuestaFichaje>;
  const e = d.estado;
  return {
    estado: {
      abierta: e?.abierta ?? null,
      proxima: e?.proxima ?? null,
      ventanaMinutos: typeof e?.ventanaMinutos === 'number' ? e.ventanaMinutos : 10,
      relacion: e?.relacion === 'CONTRATADA' || e?.relacion === 'AUTONOMA' ? e.relacion : null,
      hoy: {
        minutosCerrados: typeof e?.hoy?.minutosCerrados === 'number' ? e.hoy.minutosCerrados : 0,
        jornadasCerradas: typeof e?.hoy?.jornadasCerradas === 'number' ? e.hoy.jornadasCerradas : 0,
      },
    },
    yaAbierta: d.yaAbierta === true,
    yaCerrada: d.yaCerrada === true,
    minutos: typeof d.minutos === 'number' ? d.minutos : null,
  };
}
