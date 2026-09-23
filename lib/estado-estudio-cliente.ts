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

// Definido en el módulo puro (con su test); se reexporta para que las tarjetas
// y la bandeja lo sigan importando de aquí.
export { ANCLA_DECIDIR } from '@/lib/estado-estudio';

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

/**
 * Cuántos de esta clase esperan decisión, según la bandeja.
 *
 * `null` = la bandeja todavía no ha contestado (o falló): «no lo sé», nunca
 * cero.
 *
 * ⚠️ Un `0` aquí significa TRES cosas que la bandeja no distingue: «el servidor
 * ha contado cero», «a este rol no se le cuenta esto» y «hace hasta 30 s no
 * había nada» (el recuento va cacheado). Por eso esto sirve para que un RESUMEN
 * diga la misma cifra que la bandeja, y NO para decidir si se enseña algo con lo
 * que se trabaja: un cero cacheado escondería trabajo real. Lo fija
 * `e2e/estado-del-estudio.spec.ts` («si el recuento aún dice nada y la tarjeta
 * sí tiene algo, se ve la tarjeta»).
 */
export function useConteoDecidir(clave: ClaveConteo): number | null {
  const estado = useEstadoEstudio();
  if (!estado) return null;
  return estado.decidir.find(l => l.id === clave)?.n ?? 0;
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
