'use client';

import { useEffect, useState } from 'react';
import { dbSemaforoSaludEstudio, getCurrentStudioId } from '@/lib/supabase-data';
import type { NivelSemaforo, Rol } from '@/lib/types';

// RECEPCIÓN ve el semáforo de salud (solo el color), pero la RLS de
// condiciones_salud no le deja leer las filas — `condicionesSalud` en el
// contexto le llega SIEMPRE vacío, así que ningún cálculo LOCAL puede
// producir un color para ese rol. La RPC semaforo_salud_estudio (SECURITY
// DEFINER) expone el mínimo necesario: el nivel ya calculado por socia, sin
// condiciones ni motivo.
//
// Este hook era código idéntico copiado en clientas/page.tsx,
// clientas/[id]/page.tsx y calendario/page.tsx — factorizado aquí para que
// un futuro fix (p. ej. invalidar cuando cambian las condiciones de salud,
// hallazgo pendiente) se aplique una sola vez.
//
// PROPIETARIO/INSTRUCTOR NO deben usar este hook: ya tienen `condicionesSalud`
// cargado y su propio cálculo local (useMemo sobre lib/ficha-clinica.ts) es
// más barato — este hook solo hace la llamada de red cuando rol==='RECEPCION'.
export function useSemaforoRecepcion(rol: Rol): Map<string, NivelSemaforo> {
  const [mapa, setMapa] = useState<Map<string, NivelSemaforo>>(() => new Map());
  useEffect(() => {
    if (rol !== 'RECEPCION') return;
    let cancel = false;
    dbSemaforoSaludEstudio(getCurrentStudioId()).then(m => { if (!cancel) setMapa(m); });
    return () => { cancel = true; };
  }, [rol]);
  return mapa;
}
