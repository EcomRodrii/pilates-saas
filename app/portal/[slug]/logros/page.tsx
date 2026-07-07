'use client';

import { useEffect, useMemo } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { Trophy } from 'lucide-react';

export default function LogrosPage() {
  const { session } = usePortalAuth();
  const { achievementDefinitions, achievementProgress, achievementHistory, evaluarLogrosSocio } = useStudio();
  const socioId = session?.socioId;

  // Reevalúa por si se han configurado/editado logros desde la última visita
  // (ej. la propietaria añadió uno nuevo y la socia ya cumple el umbral).
  useEffect(() => {
    if (socioId) evaluarLogrosSocio(socioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socioId]);

  const misLogros = useMemo(() => {
    if (!socioId) return [];
    return achievementDefinitions
      .filter(a => a.activo)
      .map(def => ({
        def,
        progreso: achievementProgress.find(p => p.socioId === socioId && p.achievementId === def.id) ?? null,
      }))
      .sort((a, b) => {
        const aDone = a.progreso?.completado ? 1 : 0;
        const bDone = b.progreso?.completado ? 1 : 0;
        if (aDone !== bDone) return bDone - aDone;
        return (a.progreso?.progresoActual ?? 0) / a.def.umbral < (b.progreso?.progresoActual ?? 0) / b.def.umbral ? 1 : -1;
      });
  }, [achievementDefinitions, achievementProgress, socioId]);

  const misilogrosHistorial = useMemo(() =>
    achievementHistory.filter(h => h.socioId === socioId).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
  [achievementHistory, socioId]);

  const desbloqueados = misLogros.filter(l => l.progreso?.completado).length;

  const formatFecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  return (
    <div className="bg-white min-h-full">
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #131313 0%, #1A1A1A 55%, #F7A6C4 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight">Logros</h1>
        <p className="text-white/50 text-[13px] mt-0.5">{desbloqueados} de {misLogros.length} desbloqueados</p>
      </div>

      <div className="px-4 pt-5 pb-6 space-y-5">
        {misLogros.length === 0 ? (
          <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
            <Trophy size={28} className="text-[#C7C7CC] mx-auto mb-2" />
            <p className="text-[14px] text-[#8E8E93]">Tu estudio todavía no ha configurado logros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {misLogros.map(({ def, progreso }) => {
              const completado = progreso?.completado ?? false;
              const actual = progreso?.progresoActual ?? 0;
              const porcentaje = Math.min(100, Math.round((actual / def.umbral) * 100));
              return (
                <div
                  key={def.id}
                  className="bg-white rounded-2xl border border-black/[0.06] p-4 flex flex-col items-center text-center gap-2"
                  style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)', opacity: completado ? 1 : 0.7 }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-[26px]"
                    style={{ backgroundColor: completado ? '#FFF2F7' : '#F5F5F1', filter: completado ? 'none' : 'grayscale(0.6)' }}
                  >
                    {def.icono}
                  </div>
                  <p className="text-[13px] font-bold text-[#171717] leading-tight">{def.nombre}</p>
                  {!completado && (
                    <div className="w-full">
                      <div className="h-1.5 bg-[#F1F1EC] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#FFC8E2]" style={{ width: `${porcentaje}%` }} />
                      </div>
                      <p className="text-[10px] text-[#A8A89E] mt-1">{actual}/{def.umbral}</p>
                    </div>
                  )}
                  {completado && <p className="text-[10px] font-bold text-[#059669] uppercase tracking-wide">Conseguido</p>}
                </div>
              );
            })}
          </div>
        )}

        {misilogrosHistorial.length > 0 && (
          <div>
            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Historial</p>
            <div className="space-y-2">
              {misilogrosHistorial.map(h => (
                <div key={h.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div className="w-9 h-9 rounded-xl bg-[#FFF2F7] flex items-center justify-center text-[16px] shrink-0">
                    {h.icono}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#171717] truncate">{h.nombre}</p>
                  </div>
                  <p className="text-[11px] text-[#8E8E93] shrink-0">{formatFecha(h.creadoEn)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
