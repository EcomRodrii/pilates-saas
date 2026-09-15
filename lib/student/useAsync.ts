'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ViewState } from '@/lib/student/tipos';
import { useOnline } from '@/lib/student/useOnline';
import { supabasePortal } from '@/lib/db/supabase-portal';

// `hooks/useAsync.ts` del paquete: carga datos y deriva los cinco estados de
// vista (loading / ready / empty / error / offline) que usan TODAS las listas.
//
// Tres diferencias con el fichero del paquete:
//
// 1. Sin `useDemoState`. El paquete permite forzar el estado con `?state=…`
//    para revisar el diseño. El handoff (§K.8) dice que se elimine o se gatee
//    en producción, y aquí simplemente no existe: un parámetro de URL capaz de
//    fingir «error» o «vacío» en la app de una alumna es una vía para
//    confundirla, no una función.
//
// 2. `fn` va en las dependencias de verdad, no silenciada con un
//    `eslint-disable`. El del paquete depende solo de un contador, así que si
//    la función cambia —por ejemplo porque cambia el día seleccionado— NO
//    recarga. Aquí la pantalla envuelve su `fn` en `useCallback` y esto la
//    respeta; es lo que hace que cambiar de día en el horario traiga las clases
//    de ese día.
//
// 3. Sin `setState` dentro del efecto antes del `await`: el lint de este repo
//    (React Compiler) lo rechaza, y con razón — provoca un render en cascada.
//    El `loading` inicial ya es el estado de partida, y en las recargas se pone
//    justo antes de disparar la petición, fuera del cuerpo del efecto.
//
// Y una opcional, `clave` (15-sep-2026): con ella, lo último que se cargó para
// esa clave se pinta AL MOMENTO al volver a la pantalla y se refresca por detrás
// (stale-while-revalidate). Sin ella, todo como antes. Medido en producción:
// cambiar de pestaña en la app de la instructora volvía a enseñar el esqueleto
// y a pedirlo todo, 1-2 s por pantalla ya vista. Solo para pantallas de LECTURA:
// una que edita sobre sus datos no debe arrancar de una copia.
// ⚠️ Lo guardado vive en memoria (se va al recargar) y se vacía al cerrar sesión,
// para que otra cuenta en la misma pestaña no vea ni un instante lo de la anterior.

const vistasGuardadas = new Map<string, unknown>();
let escuchandoSalida = false;

function guardarVista(clave: string, d: unknown): void {
  vistasGuardadas.set(clave, d);
  if (escuchandoSalida) return;
  escuchandoSalida = true;
  supabasePortal.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') vistasGuardadas.clear();
  });
}

/** Lo último cargado con esa clave, sin pedir nada (p. ej. el nombre de una alumna ya visto en la bandeja). */
export function vistaGuardada<T>(clave: string): T | null {
  return vistasGuardadas.has(clave) ? vistasGuardadas.get(clave) as T : null;
}

/** Para `logout` y los tests: nada de lo guardado vale ya. */
export function olvidarVistasGuardadas(): void {
  vistasGuardadas.clear();
}

export interface ResultadoAsync<T> {
  data: T | null;
  estado: ViewState;
  reintentar: () => void;
  /** Relanza `fn` SIN pasar por `loading`: si va bien sustituye los datos; si falla, conserva los que había. */
  refrescar: () => Promise<void>;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  vacio: (d: T) => boolean = (d) => Array.isArray(d) && d.length === 0,
  clave?: string,
): ResultadoAsync<T> {
  const [data, setData] = useState<T | null>(() => (clave && vistasGuardadas.has(clave) ? vistasGuardadas.get(clave) as T : null));
  const [estado, setEstado] = useState<ViewState>(() => {
    if (!clave || !vistasGuardadas.has(clave)) return 'loading';
    return vacio(vistasGuardadas.get(clave) as T) ? 'empty' : 'ready';
  });
  const [tick, setTick] = useState(0);
  const { online } = useOnline();

  useEffect(() => {
    let vivo = true;
    fn()
      .then((d) => {
        if (!vivo) return;
        if (clave) guardarVista(clave, d);
        setData(d);
        setEstado(vacio(d) ? 'empty' : 'ready');
      })
      .catch(() => {
        // Con una copia en pantalla, un refresco fallido no la tapa con un error.
        if (vivo) setEstado((e) => (clave && vistasGuardadas.has(clave) && e !== 'loading' ? e : 'error'));
      });
    return () => { vivo = false; };
    // `vacio` fuera a propósito: casi siempre es una lambda en línea, así que
    // incluirla recargaría en cada render. `fn` sí entra: es lo que cambia
    // cuando cambia el día o el filtro, y es lo que tiene que recargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, tick]);

  const reintentar = useCallback(() => {
    setEstado('loading');
    setTick((t) => t + 1);
  }, []);

  // Para «al volver a la pestaña»: nada de esqueleto ni de re-animación sobre
  // una lista que ya se ve. `vacio` fuera de las deps por el mismo motivo que
  // en el efecto.
  const refrescar = useCallback(async () => {
    try {
      const d = await fn();
      if (clave) guardarVista(clave, d);
      setData(d);
      setEstado(vacio(d) ? 'empty' : 'ready');
    } catch {
      // Se conserva lo que había: un refresco fallido no borra la pantalla.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, clave]);

  // ⚠️ El orden importa. Sin red pero CON datos ya cargados, el estado sigue
  // siendo 'ready' y quien avisa es el banner de la cabecera: el diseño (§H)
  // pide que offline se pueda CONSULTAR lo último visto. Solo cuando no hay
  // nada que enseñar se cae a la pantalla de offline.
  const final: ViewState = !online && estado !== 'ready' ? 'offline' : estado;

  return { data, estado: final, reintentar, refrescar };
}
