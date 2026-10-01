'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/db/supabase';

// Los seguimientos («Recuérdamelo») se LEEN con la sesión de quien mira: la RLS
// de `tareas` solo deja a quien gestiona clientas, y solo los de su estudio.
// Escribir va por app/api/seguimientos.

export interface Seguimiento {
  id: string;
  socioId: string;
  titulo: string;
  estado: 'PENDIENTE' | 'HECHA';
  /** 'YYYY-MM-DD'. */
  venceEl: string | null;
  asignadaA: string | null;
  creadaPor: string | null;
  hechaPor: string | null;
  completadoEn: string | null;
  creadoEn: string;
  recomendacionId: string | null;
}

const COLUMNAS = 'id, socio_id, titulo, estado, vence_el, asignada_a, creada_por, hecha_por, completado_en, creado_en, recomendacion_id';

type Fila = {
  id: string; socio_id: string; titulo: string; estado: string; vence_el: string | null; asignada_a: string | null;
  creada_por: string | null; hecha_por: string | null; completado_en: string | null; creado_en: string; recomendacion_id: string | null;
};

function aSeguimiento(f: Fila): Seguimiento {
  return {
    id: f.id, socioId: f.socio_id, titulo: f.titulo, estado: f.estado === 'HECHA' ? 'HECHA' : 'PENDIENTE',
    venceEl: f.vence_el, asignadaA: f.asignada_a, creadaPor: f.creada_por, hechaPor: f.hecha_por,
    completadoEn: f.completado_en, creadoEn: f.creado_en, recomendacionId: f.recomendacion_id,
  };
}

/**
 * Los de UNA clienta (pendientes y hechos). `seguimientos` es null mientras
 * carga; `error` dice si no se pudo leer (no es lo mismo que «no tiene»).
 */
export function useSeguimientosDe(socioId: string | null, activo: boolean) {
  const [seguimientos, setSeguimientos] = useState<Seguimiento[] | null>(null);
  const [error, setError] = useState(false);

  const recargar = useCallback(async () => {
    if (!socioId || !activo) return;
    const { data, error: e } = await supabase.from('tareas').select(COLUMNAS)
      .eq('socio_id', socioId).order('creado_en', { ascending: false }).limit(100);
    if (e || !Array.isArray(data)) { setError(true); return; }
    setError(false);
    setSeguimientos((data as Fila[]).map(aSeguimiento));
  }, [socioId, activo]);

  useEffect(() => {
    // setState tras await, no en cascada (mismo patrón que el resto de cargas de la ficha).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar();
  }, [recargar]);

  return { seguimientos, error, recargar };
}

/**
 * Los que tocan hoy o están atrasados, de quien mira o de nadie, por clienta:
 * el filtro «Seguimientos para hoy» de la lista (mismo criterio que la línea de
 * «Por decidir»).
 */
export function useSeguimientosParaHoy(activo: boolean, hoyISO: string | null, uid: string | null) {
  const [porSocia, setPorSocia] = useState<Map<string, Seguimiento[]> | null>(null);
  useEffect(() => {
    if (!activo || !hoyISO || !uid) return;
    let vivo = true;
    void supabase.from('tareas').select(COLUMNAS)
      .eq('estado', 'PENDIENTE').not('socio_id', 'is', null).lte('vence_el', hoyISO)
      .or(`asignada_a.is.null,asignada_a.eq.${uid}`)
      .order('vence_el', { ascending: true }).limit(500)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !Array.isArray(data)) { setPorSocia(new Map()); return; }
        const m = new Map<string, Seguimiento[]>();
        for (const f of data as Fila[]) {
          const s = aSeguimiento(f);
          m.set(s.socioId, [...(m.get(s.socioId) ?? []), s]);
        }
        setPorSocia(m);
      });
    return () => { vivo = false; };
  }, [activo, hoyISO, uid]);
  return porSocia;
}
