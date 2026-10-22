'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { authHeader } from '@/lib/api-client';
import type { Interruptor } from './interruptores';

// Lo que el servidor dice de los interruptores de ESTE estudio, recordado en la
// pestaña (como las puertas del asistente): sin eso, cada visita a la pantalla
// pintaba la versión apagada y medio segundo después saltaba la encendida, y la
// tabla bajaba bajo el cursor. Se pinta con lo recordado y se vuelve a
// preguntar cuando pasa `VIGENCIA_MS` (el interruptor se cambia en Vercel).
//
// Cualquier respuesta rara o un «no» del servidor = todo apagado: la pantalla
// se queda como estaba. Un fallo de red no borra lo recordado ni se recuerda.

type Valores = Partial<Record<Interruptor, boolean>>;
interface Guardado { d: Valores; t: number }

const CLAVE = (studioId: string) => `tentare-interruptores:${studioId}`;
const VIGENCIA_MS = 30 * 60_000;

const memoria = new Map<string, Guardado>();
const enCurso = new Set<string>();
/**
 * Estudios por los que ya se preguntó en esta carga de la página y la pregunta
 * terminó (con respuesta, con un «no» o sin red). Solo lo usa
 * `useInterruptorConEspera`: a partir de aquí ya no se espera, se decide.
 */
const respondidos = new Set<string>();
const oyentes = new Set<() => void>();
const avisar = () => { for (const f of oyentes) f(); };

function leerGuardado(studioId: string): Guardado | null {
  const m = memoria.get(studioId);
  if (m) return m;
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE(studioId)) ?? 'null') as Guardado | null;
    if (v && typeof v.t === 'number' && v.d && typeof v.d === 'object') {
      memoria.set(studioId, v);
      return v;
    }
  } catch { /* sin almacenamiento: se pregunta */ }
  return null;
}

function guardar(studioId: string, d: Valores | null) {
  if (d) {
    const g = { d, t: Date.now() };
    memoria.set(studioId, g);
    try { sessionStorage.setItem(CLAVE(studioId), JSON.stringify(g)); } catch { /* solo en memoria */ }
  } else {
    memoria.delete(studioId);
    try { sessionStorage.removeItem(CLAVE(studioId)); } catch { /* nada que borrar */ }
  }
  avisar();
}

function preguntar(studioId: string) {
  if (enCurso.has(studioId)) return;
  enCurso.add(studioId);
  void (async () => {
    try {
      let res: Response;
      try {
        res = await fetch(`/api/estudio/interruptores?estudio=${encodeURIComponent(studioId)}`, { headers: await authHeader() });
      } catch {
        return; // Sin red: ni se recuerda ni se borra lo que hubiera.
      }
      if (!res.ok) { guardar(studioId, null); return; }
      // Una respuesta que no se entiende es un «no», no un fallo de red.
      const d = (await res.json().catch(() => null)) as unknown;
      guardar(studioId, d && typeof d === 'object' && !Array.isArray(d) ? (d as Valores) : null);
    } finally {
      enCurso.delete(studioId);
      respondidos.add(studioId);
      avisar();
    }
  })();
}

/** Suscribirse a los interruptores de un estudio y, si no hay nada vigente, preguntar. */
function useSuscripcion(studioId: string | null | undefined) {
  // Estable por estudio: con una función nueva en cada render, React se
  // desuscribiría y volvería a suscribir en cada uno.
  return useCallback((alCambiar: () => void) => {
    oyentes.add(alCambiar);
    if (studioId) {
      const g = leerGuardado(studioId);
      if (!g || Date.now() - g.t >= VIGENCIA_MS) preguntar(studioId);
    }
    return () => { oyentes.delete(alCambiar); };
  }, [studioId]);
}

export function useInterruptor(nombre: Interruptor, studioId: string | null | undefined): boolean {
  const suscribir = useSuscripcion(studioId);
  const leer = useCallback(() => (studioId ? leerGuardado(studioId)?.d[nombre] === true : false), [studioId, nombre]);
  return useSyncExternalStore(suscribir, leer, () => false);
}

/**
 * Como `useInterruptor`, pero con TRES estados: `null` mientras todavía no se
 * sabe (la primera pregunta de esta carga va de camino y no hay nada
 * recordado), y después `true`/`false`.
 *
 * Para lo que sustituye una pantalla ENTERA por otra (la bienvenida nueva del
 * alta frente a la de siempre): con `useInterruptor`, que contesta `false`
 * mientras pregunta, se pintaría un instante la de siempre y saltaría a la
 * nueva. Quien lo use pinta un esqueleto con `null`. Una pregunta que termina
 * mal (sin red, un 401, una respuesta rara) es `false`: no se espera para
 * siempre.
 */
export function useInterruptorConEspera(nombre: Interruptor, studioId: string | null | undefined): boolean | null {
  const suscribir = useSuscripcion(studioId);
  const leer = useCallback(() => {
    if (!studioId) return null;
    const g = leerGuardado(studioId);
    if (g) return g.d[nombre] === true;
    return respondidos.has(studioId) ? false : null;
  }, [studioId, nombre]);
  return useSyncExternalStore(suscribir, leer, () => null);
}
