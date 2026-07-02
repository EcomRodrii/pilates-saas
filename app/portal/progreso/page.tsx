'use client';

import { useMemo } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';

interface Badge {
  key: string;
  emoji: string;
  nombre: string;
  subtitulo: string;
  earned: boolean;
}

export default function ProgresoPage() {
  const { session } = usePortalAuth();
  const { socios, sesiones, reservas } = useStudio();

  const socioId = session?.socioId;

  const socio = useMemo(() => socios.find(s => s.id === socioId) ?? null, [socios, socioId]);

  const misReservas = useMemo(
    () => reservas.filter(r => r.socioId === socioId),
    [reservas, socioId]
  );

  const asistidas = useMemo(
    () => misReservas.filter(r => r.estado === 'ASISTIDA'),
    [misReservas]
  );

  const noAsistidas = useMemo(
    () => misReservas.filter(r => r.estado === 'NO_ASISTIO'),
    [misReservas]
  );

  const totalAsistidas = asistidas.length;

  const tasaAsistencia = useMemo(() => {
    const total = asistidas.length + noAsistidas.length;
    if (total === 0) return 0;
    return Math.round((asistidas.length / total) * 100);
  }, [asistidas, noAsistidas]);

  const now = new Date();

  const clasesEsteMes = useMemo(() => {
    const mes = now.getMonth();
    const año = now.getFullYear();
    return asistidas.filter(r => {
      const ses = sesiones.find(s => s.id === r.sesionId);
      if (!ses) return false;
      const d = new Date(ses.inicio);
      return d.getMonth() === mes && d.getFullYear() === año;
    }).length;
  }, [asistidas, sesiones, now]);

  const getWeekKey = (d: Date) => {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-${String(week).padStart(2, '0')}`;
  };

  const rachaActual = useMemo(() => {
    const asistidasDates = asistidas
      .map(r => sesiones.find(s => s.id === r.sesionId))
      .filter(Boolean)
      .map(s => new Date(s!.inicio));

    if (!asistidasDates.length) return 0;

    const weeks = [...new Set(asistidasDates.map(getWeekKey))].sort().reverse();
    const currentWeekKey = getWeekKey(now);

    let count = 0;
    let expected = currentWeekKey;

    for (const w of weeks) {
      if (w === expected) {
        count++;
        const [yr, wk] = expected.split('-').map(Number);
        expected = wk > 1
          ? `${yr}-${String(wk - 1).padStart(2, '0')}`
          : `${yr - 1}-52`;
      } else break;
    }
    return count;
  }, [asistidas, sesiones, now]);

  const ultimas4Semanas = useMemo(() => {
    const weeks: { label: string; count: number; startDate: Date }[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1 - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const count = asistidas.filter(r => {
        const ses = sesiones.find(s => s.id === r.sesionId);
        if (!ses) return false;
        const d = new Date(ses.inicio);
        return d >= weekStart && d <= weekEnd;
      }).length;

      const label = weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      weeks.push({ label, count, startDate: weekStart });
    }
    return weeks;
  }, [asistidas, sesiones, now]);

  const maxWeekCount = Math.max(...ultimas4Semanas.map(w => w.count), 1);

  const badges: Badge[] = useMemo(() => [
    {
      key: 'primer_paso',
      emoji: '🎯',
      nombre: 'Primer paso',
      subtitulo: '1 clase asistida',
      earned: totalAsistidas >= 1,
    },
    {
      key: 'arrancando',
      emoji: '⚡',
      nombre: 'Arrancando',
      subtitulo: '5 clases asistidas',
      earned: totalAsistidas >= 5,
    },
    {
      key: 'comprometido',
      emoji: '💪',
      nombre: 'Comprometido',
      subtitulo: '10 clases asistidas',
      earned: totalAsistidas >= 10,
    },
    {
      key: 'racha_doble',
      emoji: '🔥',
      nombre: 'Racha doble',
      subtitulo: '2 semanas seguidas',
      earned: rachaActual >= 2,
    },
    {
      key: 'un_mes',
      emoji: '🏆',
      nombre: 'Un mes seguido',
      subtitulo: '4 semanas seguidas',
      earned: rachaActual >= 4,
    },
    {
      key: 'constante',
      emoji: '⭐',
      nombre: 'Constante',
      subtitulo: 'Tasa asistencia ≥ 80%',
      earned: tasaAsistencia >= 80,
    },
    {
      key: 'veterano',
      emoji: '🌟',
      nombre: 'Veterano',
      subtitulo: '25 clases asistidas',
      earned: totalAsistidas >= 25,
    },
  ], [totalAsistidas, rachaActual, tasaAsistencia]);

  const initials = socio
    ? `${socio.nombre.charAt(0)}${socio.apellidos.charAt(0)}`.toUpperCase()
    : '?';

  const fechaAlta = socio
    ? new Date(socio.fechaAlta).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const stats = [
    { label: 'Clases asistidas', value: totalAsistidas },
    { label: 'Racha actual', value: `${rachaActual} sem.` },
    { label: 'Este mes', value: clasesEsteMes },
    { label: 'Tasa asistencia', value: `${tasaAsistencia}%` },
  ];

  if (!socio) return null;

  return (
    <div className="space-y-6 px-4 pt-5 pb-8">
      <div>
        <h1 className="text-2xl font-extrabold text-[#111827]">Mi progreso</h1>
        <p className="text-sm text-[#9CA3AF] mt-0.5">Seguimiento y logros</p>
      </div>

      <div className="bg-white border border-[#E8EAED] rounded-2xl p-5 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 text-white text-lg font-extrabold"
          style={{ backgroundColor: '#4F46E5' }}
        >
          {initials}
        </div>
        <div>
          <p className="text-base font-extrabold text-[#111827]">{socio.nombre} {socio.apellidos}</p>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Socia desde {fechaAlta}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white border border-[#E8EAED] rounded-2xl p-4 text-center">
            <p className="text-2xl font-extrabold text-[#111827]">{s.value}</p>
            <p className="text-xs text-[#9CA3AF] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF]">Logros</p>
        <div className="grid grid-cols-2 gap-3">
          {badges.map(b => (
            <div
              key={b.key}
              className="border rounded-2xl p-3.5 flex items-center gap-3 transition-all"
              style={{
                backgroundColor: b.earned ? '#EEF2FF' : '#F9FAFB',
                borderColor: b.earned ? '#C7D2FE' : '#E8EAED',
                opacity: b.earned ? 1 : 0.5,
              }}
            >
              <span className="text-2xl leading-none shrink-0">{b.emoji}</span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#111827] truncate">{b.nombre}</p>
                <p className="text-[10px] text-[#6B7280] mt-0.5 leading-tight">{b.subtitulo}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF]">Últimas 4 semanas</p>
        <div className="bg-white border border-[#E8EAED] rounded-2xl p-4">
          <div className="flex items-end gap-3 h-24">
            {ultimas4Semanas.map((w, i) => {
              const heightPct = w.count === 0 ? 0 : Math.max(8, Math.round((w.count / maxWeekCount) * 100));
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <p className="text-xs font-bold text-[#111827]">{w.count}</p>
                  <div className="w-full flex items-end" style={{ height: '64px' }}>
                    <div
                      className="w-full rounded-t-lg transition-all"
                      style={{
                        height: w.count === 0 ? '4px' : `${heightPct}%`,
                        backgroundColor: w.count === 0 ? '#F3F4F6' : '#4F46E5',
                        minHeight: '4px',
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-[#9CA3AF] text-center leading-tight">{w.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
