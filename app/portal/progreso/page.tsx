'use client';

import { useMemo } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';

const BADGES = [
  { key: 'primer_paso', emoji: '🎯', nombre: 'Primer paso', sub: '1 clase', req: (t: number) => t >= 1 },
  { key: 'arrancando', emoji: '⚡', nombre: 'Arrancando', sub: '5 clases', req: (t: number) => t >= 5 },
  { key: 'comprometida', emoji: '💪', nombre: 'Comprometida', sub: '10 clases', req: (t: number) => t >= 10 },
  { key: 'racha_2', emoji: '🔥', nombre: 'En racha', sub: '2 semanas', req: (_: number, r: number) => r >= 2 },
  { key: 'un_mes', emoji: '🏆', nombre: 'Un mes', sub: '4 semanas', req: (_: number, r: number) => r >= 4 },
  { key: 'constante', emoji: '⭐', nombre: 'Constante', sub: '≥80% asistencia', req: (_: number, __: number, ta: number) => ta >= 80 },
  { key: 'veterana', emoji: '🌟', nombre: 'Veterana', sub: '25 clases', req: (t: number) => t >= 25 },
  { key: 'centenaria', emoji: '💎', nombre: 'Centenaria', sub: '50 clases', req: (t: number) => t >= 50 },
];

export default function ProgresoPage() {
  const { session } = usePortalAuth();
  const { socios, sesiones, reservas } = useStudio();
  const socioId = session?.socioId;
  const now = new Date();

  const socio = useMemo(() => socios.find(s => s.id === socioId) ?? null, [socios, socioId]);
  const misReservas = useMemo(() => reservas.filter(r => r.socioId === socioId), [reservas, socioId]);
  const asistidas = useMemo(() => misReservas.filter(r => r.estado === 'ASISTIDA'), [misReservas]);
  const noAsistidas = useMemo(() => misReservas.filter(r => r.estado === 'NO_ASISTIO'), [misReservas]);

  const totalAsistidas = asistidas.length;
  const tasaAsistencia = useMemo(() => {
    const total = asistidas.length + noAsistidas.length;
    return total === 0 ? 0 : Math.round((asistidas.length / total) * 100);
  }, [asistidas, noAsistidas]);

  const clasesEsteMes = useMemo(() => {
    const mes = now.getMonth(); const año = now.getFullYear();
    return asistidas.filter(r => {
      const s = sesiones.find(x => x.id === r.sesionId);
      if (!s) return false;
      const d = new Date(s.inicio);
      return d.getMonth() === mes && d.getFullYear() === año;
    }).length;
  }, [asistidas, sesiones]);

  const getWeekKey = (d: Date) => {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const w = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-${String(w).padStart(2, '0')}`;
  };

  const racha = useMemo(() => {
    const dates = asistidas.map(r => sesiones.find(s => s.id === r.sesionId)).filter(Boolean).map(s => new Date(s!.inicio));
    if (!dates.length) return 0;
    const weeks = [...new Set(dates.map(getWeekKey))].sort().reverse();
    let count = 0; let expected = getWeekKey(now);
    for (const w of weeks) {
      if (w !== expected) break;
      count++;
      const [yr, wk] = expected.split('-').map(Number);
      expected = wk > 1 ? `${yr}-${String(wk - 1).padStart(2, '0')}` : `${yr - 1}-52`;
    }
    return count;
  }, [asistidas, sesiones]);

  const semanas = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay() + 1 - (3 - i) * 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      const count = asistidas.filter(r => {
        const s = sesiones.find(x => x.id === r.sesionId);
        if (!s) return false;
        const d = new Date(s.inicio);
        return d >= start && d <= end;
      }).length;
      return { label: start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), count };
    });
  }, [asistidas, sesiones]);

  const maxSem = Math.max(...semanas.map(s => s.count), 1);
  const earnedCount = BADGES.filter(b => b.req(totalAsistidas, racha, tasaAsistencia)).length;
  const initials = socio ? `${socio.nombre[0]}${socio.apellidos[0]}`.toUpperCase() : '?';

  if (!socio) return null;

  return (
    <div className="bg-white min-h-full">

      {/* Header */}
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 60%, #A9DE20 100%)' }}>
        {/* Profile */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white font-extrabold text-[16px]">
            {initials}
          </div>
          <div>
            <p className="text-white font-extrabold text-[16px] leading-tight">{socio.nombre} {socio.apellidos}</p>
            <p className="text-indigo-300 text-[12px]">
              Socia desde {new Date(socio.fechaAlta).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { v: totalAsistidas, l: 'Clases' },
            { v: clasesEsteMes, l: 'Este mes' },
            { v: `${racha}w`, l: 'Racha' },
            { v: `${tasaAsistencia}%`, l: 'Asist.' },
          ].map(({ v, l }) => (
            <div key={l} className="bg-white/10 rounded-2xl px-2 py-3 text-center">
              <p className="text-white text-[20px] font-extrabold leading-none">{v}</p>
              <p className="text-indigo-300 text-[9px] font-bold mt-1 uppercase tracking-wider">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-5 pb-6 space-y-6">

        {/* Bar chart */}
        <div>
          <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest mb-3">Últimas 4 semanas</p>
          <div className="bg-white rounded-2xl p-4" style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.07)' }}>
            <div className="flex items-end gap-3" style={{ height: 80 }}>
              {semanas.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[12px] font-bold text-[#171717]">{s.count}</span>
                  <div className="w-full flex items-end" style={{ height: 52 }}>
                    <div
                      className="w-full rounded-t-xl transition-all"
                      style={{
                        height: s.count === 0 ? 4 : Math.max(8, Math.round((s.count / maxSem) * 52)),
                        backgroundColor: s.count === 0 ? '#F1F1EC' : '#4F46E5',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[#8E8E93] text-center leading-tight">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">Logros</p>
            <p className="text-[12px] font-bold text-[#6B8E00]">{earnedCount}/{BADGES.length}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {BADGES.map(b => {
              const earned = b.req(totalAsistidas, racha, tasaAsistencia);
              return (
                <div
                  key={b.key}
                  className="rounded-2xl p-3.5 flex items-center gap-3 transition-all"
                  style={{
                    backgroundColor: earned ? '#EDF9C8' : '#F5F5F1',
                    opacity: earned ? 1 : 0.45,
                  }}
                >
                  <span className="text-[26px] leading-none shrink-0">{b.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-extrabold text-[#171717] leading-tight truncate">{b.nombre}</p>
                    <p className="text-[11px] text-[#8E8E86] mt-0.5">{b.sub}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
