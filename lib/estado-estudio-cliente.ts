'use client';

// Una sola carga de GET /api/estado-estudio compartida por la home (la bandeja)
// y el menú (el contador de Inicio). Los dos se montan a la vez en la primera
// carga del panel y, sin esto, pedirían lo mismo dos veces.
//
// A diferencia de `unaVez` (que solo junta peticiones simultáneas), aquí sí hay
// una caché corta: volver a Inicio desde el calendario no debe relanzar trece
// recuentos cada vez. 30 s es poco para que un número se lea viejo, y se refresca
// al volver a la pestaña o cuando alguien avisa de que ha cambiado algo
// (`invalidarEstadoEstudio`). Sin polling: el menú vive en TODAS las páginas y
// el proyecto ya ha pagado ráfagas de peticiones en la base de datos.

import { useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { unaVez } from '@/lib/una-vez';
import type { ClaveConteo, EstadoEstudio } from '@/lib/estado-estudio';

/**
 * Dónde está, dentro de la propia bandeja, la tarjeta que resuelve cada línea
 * de «Decidir» sin `href`. La línea salta a este id y la tarjeta lo lleva: una
 * sola fuente para las dos puntas, para que no se desincronicen.
 */
export const ANCLA_DECIDIR: Partial<Record<ClaveConteo, string>> = {
  penalizacionesPorAprobar: 'decidir-penalizaciones',
  devolucionesPorRevisar: 'decidir-devoluciones',
  canjesPorEntregar: 'decidir-canjes',
};

const FRESCO_MS = 30_000;
const EVENTO = 'tentare-estado-estudio-cambiado';
let ultimo: { at: number; datos: EstadoEstudio } | null = null;

async function pedir(): Promise<EstadoEstudio | null> {
  return unaVez('estado-estudio', async () => {
    const res = await fetch('/api/estado-estudio', { headers: await authHeader() });
    if (!res.ok) return null;
    const d = (await res.json()) as Partial<EstadoEstudio> | null;
    // ⚠️ Sin dar por hecha la forma: esto se pinta en la home y en el menú de
    // todas las páginas. Un cuerpo inesperado no puede tumbar ninguno de los dos.
    if (!d || typeof d.nDecidir !== 'number' || !Array.isArray(d.decidir)
      || !Array.isArray(d.enMarcha) || !Array.isArray(d.resuelto)) return null;
    return d as EstadoEstudio;
  });
}

/** Tras aprobar, entregar o resolver algo que la bandeja cuenta. */
export function invalidarEstadoEstudio(): void {
  ultimo = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

export function useEstadoEstudio(): EstadoEstudio | null {
  const [datos, setDatos] = useState<EstadoEstudio | null>(() => ultimo?.datos ?? null);

  useEffect(() => {
    let vivo = true;
    const cargar = async (forzar: boolean) => {
      if (!forzar && ultimo && Date.now() - ultimo.at < FRESCO_MS) return;
      try {
        const d = await pedir();
        if (!vivo || !d) return;
        ultimo = { at: Date.now(), datos: d };
        setDatos(d);
      } catch {
        // Silencioso: un contador que no se actualiza esta vez se corrige solo
        // al volver a la pestaña — no merece interrumpir a nadie.
      }
    };
    void cargar(false);
    const alVolver = () => { if (!document.hidden) void cargar(false); };
    const alCambiar = () => { void cargar(true); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener(EVENTO, alCambiar);
    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener(EVENTO, alCambiar);
    };
  }, []);

  return datos;
}
