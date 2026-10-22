'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { StudentProvider } from '@/components/student/contexto';
import { MUESTRA_LISTA, estudioDeMuestra, nombreDeMensajeMuestra } from '@/lib/student/muestra';

// La app de muestra (lib/student/muestra.ts) con el nombre que se escribe en el
// alta: lo manda la ventana que la enmarca por `postMessage` y aquí se vuelve a
// montar el estudio de muestra con él. Fuera de un marco, o de otro origen, se
// queda «Tu estudio» (el nombre nunca sale de la URL).
//
// Es el único `estudio` que cambia mientras se mira: `StudentProvider` sigue
// sin estado; esto le pasa otro objeto. El color de fábrica llega del layout
// (servidor), para no traer aquí el esquema del tema.
export function ProveedorMuestra({ colorPrimario, children }: { colorPrimario: string; children: ReactNode }) {
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    if (window.self === window.top) return;
    const escuchar = (e: MessageEvent) => {
      const n = nombreDeMensajeMuestra(e, { origin: window.location.origin, padre: window.parent });
      if (n !== null) setNombre(n);
    };
    window.addEventListener('message', escuchar);
    // Ya escucha: que le manden el nombre de ahora (el `load` del marco puede
    // llegar antes de que la app esté montada).
    window.parent.postMessage({ tipo: MUESTRA_LISTA }, window.location.origin);
    return () => window.removeEventListener('message', escuchar);
  }, []);

  return <StudentProvider estudio={estudioDeMuestra(nombre, colorPrimario)}>{children}</StudentProvider>;
}
