'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { useRol, puedeVer, puedeVerFinanzas } from '@/lib/permisos';
import { avisoDeClienta, avisosDeCobro, avisosDelCentroDeControl, type AvisoClienta, type RecomendacionSobreClienta } from './avisos';
import { contactoTrasElAviso } from './contactos';
import { supabase } from '@/lib/db/supabase';

// Los avisos de cada clienta para la lista y la ficha.
//
// · Los del Centro de Control salen de /api/decisiones —las mismas
//   recomendaciones, con las mismas palabras—, y solo para quien entra en el
//   Centro de Control (hoy, la propietaria): nadie ve aquí lo que no vería allí.
// · Los de cobro salen de sus recibos, ya cargados en el panel, y solo para
//   quien ve la facturación.
//
// Si /api/decisiones falla o tarda, la lista se pinta igual, sin esos avisos:
// nunca se bloquea por ellos ni se inventa que «no hay nada».

/** `hoyISO`: el día del estudio con el que se calcula la pantalla (null mientras no se sabe). */
export function useAvisosClientas(hoyISO: string | null): {
  avisoDe: (socioId: string) => AvisoClienta | null;
  /** Se habló con ella (contacto apuntado) después de que saltara su aviso: está atendido. */
  atendido: (socioId: string) => boolean;
  cargados: boolean;
} {
  const { recibos, studio } = useStudio();
  const rol = useRol();
  const veCentro = puedeVer(rol, '/centro-de-control');
  const veDinero = puedeVerFinanzas(rol);
  const [recomendaciones, setRecomendaciones] = useState<RecomendacionSobreClienta[] | null>(null);

  useEffect(() => {
    if (!veCentro) return;
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/decisiones', { headers: { ...(await authHeader()) } });
        const cuerpo = res.ok ? await res.json().catch(() => null) : null;
        // Un 200 no garantiza la forma (mismo cuidado que useDecisiones).
        const listas = cuerpo && Array.isArray(cuerpo.prioridades) && Array.isArray(cuerpo.masSituaciones)
          ? [...cuerpo.prioridades, ...cuerpo.masSituaciones] as RecomendacionSobreClienta[]
          : [];
        if (vivo) setRecomendaciones(listas);
      } catch {
        if (vivo) setRecomendaciones([]);
      }
    })();
    return () => { vivo = false; };
  }, [veCentro]);

  // Los contactos apuntados de los últimos 30 días, para dar por atendido el
  // aviso de quien ya se llamó (el Centro de Control lo retira en su siguiente
  // pasada; hasta entonces, la fila no lo pinta como pendiente). Solo hacen falta
  // con los avisos del Centro: los de dinero siguen hasta que se cobra.
  const [ultimoContacto, setUltimoContacto] = useState<Map<string, string>>(() => new Map());
  // La hora con la que se compara, fijada al montar (no se puede leer el reloj al pintar).
  const [ahoraMs] = useState(() => Date.now());
  const studioId = studio?.id ?? null;
  useEffect(() => {
    if (!veCentro || !studioId) return;
    let vivo = true;
    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    void supabase.from('comunicaciones_socio')
      .select('socio_id, creado_en')
      .eq('studio_id', studioId).eq('tipo', 'contacto').gte('creado_en', desde)
      .order('creado_en', { ascending: false }).limit(2000)
      .then(({ data, error }) => {
        // Si no se puede leer, no se da nada por atendido: el aviso se ve como siempre.
        if (!vivo || error || !Array.isArray(data)) return;
        const m = new Map<string, string>();
        for (const f of data as { socio_id: string; creado_en: string }[]) if (!m.has(f.socio_id)) m.set(f.socio_id, f.creado_en);
        setUltimoContacto(m);
      });
    return () => { vivo = false; };
  }, [veCentro, studioId]);

  const delCentro = useMemo(() => avisosDelCentroDeControl(recomendaciones ?? []), [recomendaciones]);
  const deCobro = useMemo(
    () => (veDinero && hoyISO ? avisosDeCobro(recibos, hoyISO) : new Map<string, AvisoClienta>()),
    [recibos, veDinero, hoyISO],
  );

  return {
    avisoDe: (socioId: string) => avisoDeClienta(socioId, delCentro, deCobro, veDinero),
    atendido: (socioId: string) => {
      const aviso = avisoDeClienta(socioId, delCentro, deCobro, veDinero);
      const contacto = ultimoContacto.get(socioId);
      return !!aviso && !aviso.dinero && !!contacto && contactoTrasElAviso([{ en: contacto }], aviso.desde, new Date(ahoraMs));
    },
    cargados: !veCentro || recomendaciones !== null,
  };
}
