'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Briefcase, Heart, Check } from 'lucide-react';
import { fetchVacantesPublicadasNetwork, fetchMisCandidaturasNetwork } from '@/lib/api-client';
import { TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, type TipoTrabajoNetwork } from '@/lib/network/catalogo';
import type { VacanteNetwork } from '@/lib/network/tipos';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO } from '@/components/network-v2/tokens';
import { cn } from '@/lib/utils';

// Rediseño 2026-09 (Fase 3 del mockup del fundador) — de lista de una
// columna a grid de tarjetas con filtro por tipo, mismo principio de las
// fases 1/2: tokens NW_*, cero dato inventado.
//
// El mockup mostraba 4 filtros ("Todas/Sustitución/Vacante/Temporal") y una
// insignia de urgencia por tarjeta — `red_vacantes.tipo_trabajo` tiene 5
// valores reales (jornada_completa/media_jornada/freelance/sustituciones/
// clases_puntuales), no 3. Se agrupan en los 3 cubos del mockup (Sustitución
// = sustituciones; Vacante = jornada_completa/media_jornada/freelance, un
// puesto abierto de verdad; Temporal = clases_puntuales) — agrupa datos
// reales que YA existen, no inventa una taxonomía nueva; el tipo exacto
// sigue viéndose en la propia tarjeta vía TIPO_TRABAJO_LABEL.
//
// La insignia de la tarjeta dice el GRUPO real ("Sustitución"/"Vacante"/
// "Temporal"), no "Urgente" como el mockup — no hay ninguna señal de
// urgencia real detrás (fecha límite, aforo mínimo…) para respaldar esa
// palabra; etiquetarlo así sería fabricar una prisa que no existe.
//
// Sin foto de estudio (`red_vacantes` no guarda ninguna) ni valoración
// (no existe ningún concepto de "rating de estudio" visible a instructoras
// en el modelo) ni distancia (`red_vacantes` no tiene lat/lng) — el mockup
// las mostraba, pero fabricarlas sería inventar datos.
const GRUPOS = [
  { id: 'todas' as const, label: 'Todas', tipos: null },
  { id: 'sustitucion' as const, label: 'Sustitución', tipos: ['sustituciones'] as TipoTrabajoNetwork[] },
  { id: 'vacante' as const, label: 'Vacante', tipos: ['jornada_completa', 'media_jornada', 'freelance'] as TipoTrabajoNetwork[] },
  { id: 'temporal' as const, label: 'Temporal', tipos: ['clases_puntuales'] as TipoTrabajoNetwork[] },
];

function grupoDe(tipoTrabajo: TipoTrabajoNetwork): (typeof GRUPOS)[number]['id'] {
  return GRUPOS.find(g => g.tipos?.includes(tipoTrabajo))?.id ?? 'vacante';
}

const BADGE_ESTILO: Record<string, { fondo: string; color: string }> = {
  sustitucion: { fondo: '#FBEFE3', color: '#9A5B23' },
  vacante: { fondo: '#EAF0E7', color: '#2E5A3A' },
  temporal: { fondo: '#F1F2EA', color: NW_MUTED_2 },
};

export default function OportunidadesNetworkPage() {
  const [vacantes, setVacantes] = useState<VacanteNetwork[] | null>(null);
  const [candidaturas, setCandidaturas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<(typeof GRUPOS)[number]['id']>('todas');

  useEffect(() => {
    let vivo = true;
    fetchVacantesPublicadasNetwork().then(v => { if (vivo) setVacantes(v); });
    fetchMisCandidaturasNetwork().then(cs => { if (vivo) setCandidaturas(new Set(cs.map(c => c.vacanteId))); });
    return () => { vivo = false; };
  }, []);

  const filtradas = useMemo(
    () => (vacantes ?? []).filter(v => filtro === 'todas' || grupoDe(v.tipoTrabajo) === filtro),
    [vacantes, filtro],
  );

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold" style={{ color: NW_TINTA }}>Oportunidades</h1>
        <p className="text-[13px] mt-0.5" style={{ color: NW_MUTED }}>
          {vacantes ? `${filtradas.length} activa${filtradas.length === 1 ? '' : 's'}${vacantes.length ? ' que encajan con tu perfil' : ''}` : 'Vacantes publicadas por estudios que usan Tentare.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {GRUPOS.map(g => {
          const activo = filtro === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setFiltro(g.id)}
              className="px-3.5 py-1.5 rounded-full text-[12.5px] font-bold transition-colors"
              style={activo
                ? { background: NW_PRODUCTO, color: '#fff' }
                : { background: '#fff', color: NW_TINTA, border: `1px solid ${NW_BORDE}` }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {!vacantes ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin" style={{ color: NW_MUTED }} />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: NW_SAND }}>
          <Briefcase size={22} style={{ color: NW_MUTED_2 }} className="mx-auto mb-2" />
          <p className="text-[13px]" style={{ color: NW_MUTED }}>
            {vacantes.length === 0 ? 'No hay ninguna vacante publicada ahora mismo.' : 'Nada en esta categoría ahora mismo.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtradas.map(v => {
            const grupo = grupoDe(v.tipoTrabajo);
            const estilo = BADGE_ESTILO[grupo];
            const yaAplico = candidaturas.has(v.id);
            return (
              <Link
                key={v.id}
                href={`/network/oportunidades/${v.id}`}
                className="rounded-2xl p-4 bg-white flex flex-col hover:opacity-90 transition-opacity"
                style={{ border: `1px solid ${NW_BORDE}` }}
              >
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: estilo.fondo, color: estilo.color }}>
                    {GRUPOS.find(g => g.id === grupo)?.label}
                  </span>
                  {yaAplico ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: NW_PRODUCTO }}>
                      <Check size={12} /> Aplicado
                    </span>
                  ) : (
                    <Heart size={15} style={{ color: NW_MUTED_2 }} />
                  )}
                </div>
                <p className="text-[14px] font-bold leading-snug mb-1" style={{ color: NW_TINTA }}>{v.titulo}</p>
                <p className="text-[12.5px] mb-3" style={{ color: NW_MUTED_2 }}>
                  {v.estudioNombre}{v.estudioCiudad ? ` · ${v.estudioCiudad}` : ''}
                </p>
                <p className="text-[12.5px] mt-auto" style={{ color: NW_MUTED }}>
                  {TIPO_TRABAJO_LABEL[v.tipoTrabajo]} · {TARIFA_RANGO_LABEL[v.tarifaRango]}
                </p>
                <span
                  className={cn(
                    'mt-3 inline-flex items-center justify-center px-3.5 py-2 rounded-full text-[12.5px] font-bold text-white',
                  )}
                  style={{ background: yaAplico ? NW_MUTED_2 : NW_PRODUCTO }}
                >
                  {yaAplico ? 'Ver candidatura' : 'Me interesa'}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
