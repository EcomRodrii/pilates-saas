'use client';

import { useEffect, useRef, useState } from 'react';
import { GuardadoDiferido, type EstadoGuardado, type Resultado } from '@/lib/configuracion/guardado-diferido';

/**
 * Guardar mientras se escribe (`lib/configuracion/guardado-diferido.ts`): el campo
 * enseña lo tecleado y esto lo manda cuando se deja de escribir, de uno en uno y
 * diciendo de verdad cómo ha ido. Al desmontar (cambiar de ficha, salir de la
 * pantalla) lo pendiente sale ya: no se pierde lo último que se tecleó.
 */
export function useGuardadoDiferido<T extends object>(guardar: (cambios: Partial<T>) => Promise<Resultado>, esperaMs = 600) {
  const [estado, setEstado] = useState<EstadoGuardado>({ e: 'quieto' });
  // La última versión de `guardar`, y la cola, que nace con el primer cambio (en un
  // evento, nunca durante el render).
  const guardarRef = useRef(guardar);
  useEffect(() => { guardarRef.current = guardar; });
  const colaRef = useRef<GuardadoDiferido<T> | null>(null);
  useEffect(() => {
    const cola = colaRef;
    return () => { void cola.current?.vaciar(); };
  }, []);
  function laCola(): GuardadoDiferido<T> {
    colaRef.current ??= new GuardadoDiferido<T>((cambios) => guardarRef.current(cambios), setEstado, esperaMs);
    return colaRef.current;
  }
  return {
    estado,
    cambiar: (cambios: Partial<T>, inmediato = false) => laCola().cambiar(cambios, inmediato),
    vaciar: () => { void colaRef.current?.vaciar(); },
    /** Que no quede nada por mandar (antes de borrar la ficha, por ejemplo). */
    esperar: (): Promise<void> => colaRef.current?.vaciar() ?? Promise.resolve(),
  };
}
