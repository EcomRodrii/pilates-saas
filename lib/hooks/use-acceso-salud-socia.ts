'use client';

import { useEffect, useState } from 'react';
import { dbInstructoraAtiendeSocia } from '@/lib/supabase-data';
import type { Rol } from '@/lib/types';

// ¿Ve esta INSTRUCTORA la salud de esta socia? (migr 20260913173000: solo sus
// alumnas, reserva o cita con ella en ±30 días).
//
// No es la cerradura —esa es la RLS, que ya devuelve vacío—, es para no pintar
// «Ficha de salud vacía» y un botón «Añadir condición» que la base de datos va a
// rechazar: vacío y «no puedes verla» son cosas distintas y la pantalla tiene
// que decir cuál. Pregunta a la MISMA función que usa la RLS, así que no hay
// una segunda versión de la regla en el navegador.
//
// Para la propietaria no hace ninguna llamada. Si la RPC falla (p. ej. la
// migración aún no está aplicada) devuelve 'ERROR' y la pantalla se comporta
// como antes: lo que llegue lo decide la RLS.

export type EstadoAccesoSalud = 'CARGANDO' | 'PERMITIDO' | 'NO_ES_SU_ALUMNA' | 'ERROR';

export function useAccesoSaludSocia(rol: Rol, socioId: string): EstadoAccesoSalud {
  const esInstructora = rol === 'INSTRUCTOR';
  const [resultado, setResultado] = useState<{ socioId: string; valor: EstadoAccesoSalud } | null>(null);

  useEffect(() => {
    if (!esInstructora) return;
    let cancelado = false;
    dbInstructoraAtiendeSocia(socioId).then(atiende => {
      if (cancelado) return;
      setResultado({ socioId, valor: atiende === null ? 'ERROR' : atiende ? 'PERMITIDO' : 'NO_ES_SU_ALUMNA' });
    });
    return () => { cancelado = true; };
  }, [esInstructora, socioId]);

  if (!esInstructora) return 'PERMITIDO';
  // Al cambiar de socia, lo guardado es de la anterior: se espera la nueva.
  return resultado?.socioId === socioId ? resultado.valor : 'CARGANDO';
}
