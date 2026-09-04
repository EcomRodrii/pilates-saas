'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ViewState } from '@/lib/student/tipos';
import { useOnline } from '@/lib/student/useOnline';

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
): ResultadoAsync<T> {
  const [data, setData] = useState<T | null>(null);
  const [estado, setEstado] = useState<ViewState>('loading');
  const [tick, setTick] = useState(0);
  const { online } = useOnline();

  useEffect(() => {
    let vivo = true;
    fn()
      .then((d) => {
        if (!vivo) return;
        setData(d);
        setEstado(vacio(d) ? 'empty' : 'ready');
      })
      .catch(() => {
        if (vivo) setEstado('error');
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
      setData(d);
      setEstado(vacio(d) ? 'empty' : 'ready');
    } catch {
      // Se conserva lo que había: un refresco fallido no borra la pantalla.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);

  // ⚠️ El orden importa. Sin red pero CON datos ya cargados, el estado sigue
  // siendo 'ready' y quien avisa es el banner de la cabecera: el diseño (§H)
  // pide que offline se pueda CONSULTAR lo último visto. Solo cuando no hay
  // nada que enseñar se cae a la pantalla de offline.
  const final: ViewState = !online && estado !== 'ready' ? 'offline' : estado;

  return { data, estado: final, reintentar, refrescar };
}
