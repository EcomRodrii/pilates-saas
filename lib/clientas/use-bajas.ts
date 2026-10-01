'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/db/supabase';

// El MOTIVO de las bajas (tabla `bajas_clienta`), leído con la sesión de quien
// mira: su RLS solo deja a quien gestiona clientas. Si no se puede leer (o es
// una baja de antes de guardar el motivo), no se enseña nada: «De baja» sigue
// saliendo de `socios.activo`.

export interface BajaClienta {
  id: string;
  socioId: string;
  motivo: string;
  /** ISO. */
  bajaEn: string;
  /** ISO; null = sigue de baja. */
  altaEn: string | null;
}

type Fila = { id: string; socio_id: string; motivo: string; baja_en: string; alta_en: string | null };
const aBaja = (f: Fila): BajaClienta => ({ id: f.id, socioId: f.socio_id, motivo: f.motivo, bajaEn: f.baja_en, altaEn: f.alta_en });

/** Las bajas abiertas del estudio, por clienta (para la lista). */
export function useBajasAbiertas(activo: boolean): Map<string, BajaClienta> {
  const [porSocia, setPorSocia] = useState<Map<string, BajaClienta>>(() => new Map());
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void supabase.from('bajas_clienta').select('id, socio_id, motivo, baja_en, alta_en')
      .is('alta_en', null).limit(5000)
      .then(({ data, error }) => {
        if (!vivo || error || !Array.isArray(data)) return;
        setPorSocia(new Map((data as Fila[]).map(f => [f.socio_id, aBaja(f)])));
      });
    return () => { vivo = false; };
  }, [activo]);
  return porSocia;
}

/** Todas las de una clienta, de la más reciente a la más antigua (para su ficha e historia). */
export function useBajasDe(socioId: string | null, activo: boolean, clave: unknown = null): BajaClienta[] {
  const [bajas, setBajas] = useState<BajaClienta[]>([]);
  useEffect(() => {
    if (!socioId || !activo) return;
    let vivo = true;
    void supabase.from('bajas_clienta').select('id, socio_id, motivo, baja_en, alta_en')
      .eq('socio_id', socioId).order('baja_en', { ascending: false }).limit(50)
      .then(({ data, error }) => {
        if (!vivo || error || !Array.isArray(data)) return;
        setBajas((data as Fila[]).map(aBaja));
      });
    return () => { vivo = false; };
  }, [socioId, activo, clave]);
  return bajas;
}
