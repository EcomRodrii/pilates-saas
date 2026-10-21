'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { authHeader } from '@/lib/api-client';
import { leerEstadoAlta, type EstadoAlta } from './estado';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que contesta GET /api/alta/estado, UNA vez para todo el panel: la tarjeta
// del Resumen, la píldora de la barra, la hoja del móvil, el WhatsApp de la
// esquina, el recorrido y la tarjeta del plan leen lo mismo, con una sola
// petición en vuelo (un `Map` por estudio y una suscripción, como los
// interruptores).
//
// Se vuelve a preguntar al volver a la pestaña (con un mínimo entre preguntas)
// y cuando la pantalla sabe que algo ha cambiado (`recargarEstadoAlta`, tras
// compartir el enlace). Un fallo de red deja lo que hubiera; una respuesta que
// no se entiende es «no se sabe» (`null`): no marca nada ni enseña nada.
// ─────────────────────────────────────────────────────────────────────────────

interface Entrada {
  /** `undefined` = aún no ha contestado; `null` = contestó y no se sabe nada. */
  estado: EstadoAlta | null | undefined;
  t: number;
}

const MINIMO_ENTRE_PREGUNTAS_MS = 20_000;
const memoria = new Map<string, Entrada>();
const enCurso = new Set<string>();
const oyentes = new Set<() => void>();
const avisar = () => { for (const f of oyentes) f(); };

async function preguntar(studioId: string, forzar = false) {
  if (enCurso.has(studioId)) return;
  const previa = memoria.get(studioId);
  if (!forzar && previa && previa.estado !== undefined && Date.now() - previa.t < MINIMO_ENTRE_PREGUNTAS_MS) return;
  enCurso.add(studioId);
  try {
    const res = await fetch('/api/alta/estado', { headers: await authHeader() });
    const cuerpo = res.ok ? await res.json().catch(() => null) : null;
    const leido = leerEstadoAlta(cuerpo);
    // Un 5xx o una respuesta rara no borra lo que ya se sabía.
    memoria.set(studioId, { estado: leido ?? previa?.estado ?? null, t: Date.now() });
  } catch {
    memoria.set(studioId, { estado: previa?.estado ?? null, t: Date.now() });
  } finally {
    enCurso.delete(studioId);
    avisar();
  }
}

let ultimoEstudio: string | null = null;

/** Vuelve a preguntar ya (tras compartir el enlace, al volver de crear la clase…). */
export function recargarEstadoAlta(): void {
  if (ultimoEstudio) void preguntar(ultimoEstudio, true);
}

/**
 * Marca en memoria lo que la pantalla acaba de ver hacer (compartir el enlace
 * con el portapapeles confirmado, el recorrido enseñado) mientras el servidor lo
 * apunta: así no hay que esperar a la siguiente pregunta para que se vea.
 */
export function anotarEnEstadoAlta(cambio: Partial<Pick<EstadoAlta, 'enlaceCompartido' | 'recorridoVisto' | 'planEnsenado'>>): void {
  if (!ultimoEstudio) return;
  const e = memoria.get(ultimoEstudio);
  if (!e?.estado) return;
  memoria.set(ultimoEstudio, { ...e, estado: { ...e.estado, ...cambio } });
  avisar();
}

/**
 * El estado del alta del estudio, o `undefined` mientras se pregunta la primera
 * vez y `null` si no se sabe. Con `activo` en falso no pregunta nada (quien no
 * es la propietaria de un estudio del alta nueva).
 */
export function useEstadoAlta(studioId: string | null | undefined, activo: boolean): EstadoAlta | null | undefined {
  const suscribir = useCallback((alCambiar: () => void) => {
    oyentes.add(alCambiar);
    return () => { oyentes.delete(alCambiar); };
  }, []);
  const leer = useCallback(() => (studioId && activo ? memoria.get(studioId)?.estado : undefined), [studioId, activo]);
  const estado = useSyncExternalStore(suscribir, leer, () => undefined);

  useEffect(() => {
    if (!studioId || !activo) return;
    ultimoEstudio = studioId;
    void preguntar(studioId);
    const alVolver = () => { if (document.visibilityState === 'visible') void preguntar(studioId); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [studioId, activo]);

  return estado;
}
