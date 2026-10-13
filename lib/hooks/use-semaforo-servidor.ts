'use client';

import { useEffect, useState } from 'react';
import { dbSemaforoSaludEstudio, getCurrentStudioId } from '@/lib/supabase-data';
import { semaforoDesdeServidor } from '@/lib/permisos-reglas';
import type { NivelSemaforo, Rol } from '@/lib/types';

// RECEPCIÓN y la gerencia ven el semáforo de salud (solo el color), pero la RLS
// de condiciones_salud no les deja leer las filas — `condicionesSalud` en el
// contexto les llega SIEMPRE vacío, así que ningún cálculo LOCAL puede
// producir un color para esos roles. La RPC semaforo_salud_estudio (SECURITY
// DEFINER) expone el mínimo necesario: el nivel ya calculado por socia, sin
// condiciones ni motivo. Qué rol va por aquí lo decide `semaforoDesdeServidor`
// (lib/permisos-reglas.ts), y las pantallas usan esa misma regla para elegir
// qué mapa pintan.
//
// Este hook era código idéntico copiado en clientas/page.tsx,
// clientas/[id]/page.tsx y calendario/page.tsx — factorizado aquí para que
// un futuro fix (p. ej. invalidar cuando cambian las condiciones de salud,
// hallazgo pendiente) se aplique una sola vez.
//
// La PROPIETARIA no pasa por aquí: tiene `condicionesSalud` cargado y su propio
// cálculo local (useMemo sobre lib/ficha-clinica.ts) es más barato — para ella
// el hook no hace ninguna llamada de red.
export function useSemaforoServidor(rol: Rol): Map<string, NivelSemaforo> {
  const [mapa, setMapa] = useState<Map<string, NivelSemaforo>>(() => new Map());
  useEffect(() => {
    if (!semaforoDesdeServidor(rol)) return;
    let cancel = false;
    dbSemaforoSaludEstudio(getCurrentStudioId()).then(m => { if (!cancel) setMapa(m); });
    return () => { cancel = true; };
  }, [rol]);
  return mapa;
}
