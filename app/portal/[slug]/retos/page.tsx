'use client';

import { useEffect, useMemo } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { estadoReto, calcularProgresoReto } from '@/lib/challenge-engine';
import { ACHIEVEMENT_METRICS } from '@/lib/achievement-engine';
import type { ChallengeDefinition, EstadoReto } from '@/lib/types';
import { Target } from 'lucide-react';

const ESTADO_STYLE: Record<EstadoReto, { label: string; bg: string; text: string }> = {
  ACTIVO: { label: 'En curso', bg: '#DBEAFE', text: '#1D4ED8' },
  COMPLETADO: { label: 'Completado', bg: '#DCFCE7', text: '#059669' },
  CADUCADO: { label: 'Caducado', bg: '#F1F1EC', text: '#8E8E86' },
};

export default function RetosPage() {
  const { session } = usePortalAuth();
  const { socios, sesiones, reservas, challengeDefinitions, challengeProgress, evaluarRetosSocio } = useStudio();
  const socioId = session?.socioId;
  const now = new Date();

  useEffect(() => {
    if (socioId) evaluarRetosSocio(socioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socioId]);

  const socio = useMemo(() => socios.find(s => s.id === socioId) ?? null, [socios, socioId]);
  const misReservas = useMemo(() => reservas.filter(r => r.socioId === socioId), [reservas, socioId]);

  const retos = useMemo(() => {
    if (!socioId) return [];
    return challengeDefinitions
      .filter(c => c.activo)
      .map(c => {
        const progreso = challengeProgress.find(p => p.socioId === socioId && p.challengeId === c.id);
        const completado = progreso?.completado ?? false;
        const valor = completado
          ? progreso!.progresoActual
          : calcularProgresoReto(c, misReservas, sesiones, socio ?? undefined, socios, now);
        return { def: c, valor, completado, estado: estadoReto(c, completado, now) };
      })
      .sort((a, b) => {
        const orden: Record<EstadoReto, number> = { ACTIVO: 0, COMPLETADO: 1, CADUCADO: 2 };
        return orden[a.estado] - orden[b.estado] || b.def.fechaInicio.localeCompare(a.def.fechaInicio);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socioId, challengeDefinitions, challengeProgress, misReservas, sesiones, socio]);

  const metricLabel = (m: string) => ACHIEVEMENT_METRICS.find(x => x.metric === m)?.nombre ?? m;

  if (!socioId) return null;

  return (
    <div className="bg-white min-h-full">
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}>
        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center mb-3">
          <Target size={22} className="text-white" />
        </div>
        <h1 className="text-white text-[22px] font-extrabold tracking-tight">Retos</h1>
        <p className="text-white/50 text-[13px] mt-1">Desafíos por tiempo limitado — supéralos antes de que acaben.</p>
      </div>

      <div className="px-4 pt-5 pb-6">
        {retos.length === 0 ? (
          <div className="rounded-2xl p-8 text-center bg-[#F5F5F1]">
            <p className="text-[13px] text-[#8E8E86]">Todavía no hay retos activos. Vuelve pronto.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {retos.map(({ def, valor, estado }) => {
              const style = ESTADO_STYLE[estado];
              const pct = Math.min(100, Math.round((valor / def.objetivo) * 100));
              return (
                <div
                  key={def.id}
                  className="rounded-2xl p-4 border border-[#EDEDE6]"
                  style={{ opacity: estado === 'CADUCADO' ? 0.6 : 1, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#FFF2F7] flex items-center justify-center text-[20px] shrink-0">
                      {def.icono}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-bold text-[#171717]">{def.nombre}</p>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ backgroundColor: style.bg, color: style.text }}>
                          {style.label}
                        </span>
                      </div>
                      {def.descripcion && <p className="text-[12px] text-[#8E8E86] mt-0.5">{def.descripcion}</p>}
                      <p className="text-[11px] text-[#A8A89F] mt-1">
                        {metricLabel(def.metric)} · hasta el {new Date(def.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {def.creditosRecompensa > 0 ? ` · +${def.creditosRecompensa} créditos` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-[#5A5A52]">{Math.min(valor, def.objetivo)} / {def.objetivo}</span>
                      <span className="text-[11px] font-bold text-[#B57A8E]">{pct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#F1F1EC] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: estado === 'COMPLETADO' ? '#059669' : '#F7A6C4' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
