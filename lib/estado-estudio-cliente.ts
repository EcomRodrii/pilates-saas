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

import { useEffect, useRef, useState } from 'react';
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

// ── Llegar desde un aviso a LA tarjeta (y a la fila) que lo motivó ────────────
//
// Un aviso de la campana lleva a `/dashboard#decidir-…` (y, si es una petición
// concreta, `?peticion=<id>`). Dos cosas hacen que el navegador solo no baste:
// la tarjeta se pinta DESPUÉS de pedir sus filas, así que el salto nativo al
// `#` cae en el vacío; y estando ya en el panel, `router.push` no relanza nada
// que un componente pueda oír. Por eso la campana avisa con `EVENTO_ANCLA` y
// cada tarjeta se engancha con `useAnclaDeAviso`.
const EVENTO_ANCLA = 'tentare-ir-a-ancla';

/** Lo llama la campana tras navegar: `href` es el destino del aviso. */
export function avisarAncla(href: string): void {
  if (typeof window === 'undefined') return;
  const u = new URL(href, window.location.origin);
  if (!u.hash) return;
  window.dispatchEvent(new CustomEvent(EVENTO_ANCLA, {
    detail: { ancla: u.hash.slice(1), peticion: u.searchParams.get('peticion') },
  }));
}

/** `true` si llegó a la fila pedida (o a la tarjeta, si no se pidió fila). */
function irAAncla(ancla: string, peticion: string | null): boolean {
  const tarjeta = document.getElementById(ancla);
  if (!tarjeta) return false;
  const fila = peticion
    ? tarjeta.querySelector<HTMLElement>(`[data-peticion="${CSS.escape(peticion)}"]`)
    : null;
  if (peticion && !fila) return false;
  const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  (fila ?? tarjeta).scrollIntoView({ block: 'center', behavior: suave ? 'smooth' : 'auto' });
  tarjeta.focus({ preventScroll: true });
  if (fila) {
    // Un aro unos segundos: lo justo para ver CUÁL es entre varias iguales.
    fila.classList.add('ring-2', 'ring-primary');
    window.setTimeout(() => fila.classList.remove('ring-2', 'ring-primary'), 3000);
  }
  return true;
}

/**
 * Engancha una tarjeta de «por decidir» a los avisos que llevan a ella.
 * `listo` = ya ha pintado sus filas (antes no hay a dónde ir). `onNoEsta` se
 * llama si lo que el aviso señalaba ya no está —otra persona lo resolvió—, para
 * que la tarjeta lo diga en vez de dejar un clic mudo.
 */
export function useAnclaDeAviso(ancla: string | undefined, listo: boolean, onNoEsta?: () => void): void {
  const noEsta = useRef(onNoEsta);
  useEffect(() => { noEsta.current = onNoEsta; });
  useEffect(() => {
    if (!ancla || !listo) return;
    const ir = (peticion: string | null) => { if (!irAAncla(ancla, peticion)) noEsta.current?.(); };
    // Llegada desde otra pantalla: el `#` y el `?peticion` ya están en la URL.
    if (window.location.hash === `#${ancla}`) {
      ir(new URLSearchParams(window.location.search).get('peticion'));
      // Se consumen: recargar o compartir la URL no debe volver a saltar.
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
    const alAvisar = (ev: Event) => {
      const d = (ev as CustomEvent<{ ancla: string; peticion: string | null }>).detail;
      if (d?.ancla === ancla) ir(d.peticion);
    };
    window.addEventListener(EVENTO_ANCLA, alAvisar);
    return () => window.removeEventListener(EVENTO_ANCLA, alAvisar);
  }, [ancla, listo]);
}
