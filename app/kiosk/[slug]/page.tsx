'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStudio } from '@/lib/studio-context';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Users, Wifi, X } from 'lucide-react';

function pad2(n: number) { return String(n).padStart(2, '0'); }

function isDark(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function initials(nombre: string, apellidos: string) {
  return `${nombre[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

function avatarColor(id: string) {
  const colors = [
    { bg: '#FFF2F7', text: '#2563EB' },
    { bg: '#F0FDF4', text: '#059669' },
    { bg: '#FEF3C7', text: '#D97706' },
    { bg: '#EDE9FE', text: '#7C3AED' },
    { bg: '#FEE2E2', text: '#DC2626' },
    { bg: '#E0F2FE', text: '#0369A1' },
  ];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % colors.length;
  return colors[h];
}

export default function KioskPage() {
  const { sesiones, reservas, socios, tiposClase, salas, checkin } = useStudio();
  const now = useNow();
  const [selectedSesionId, setSelectedSesionId] = useState<string | null>(null);
  const [checkedInNow, setCheckedInNow] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccess, setShowSuccess] = useState<{ nombre: string } | null>(null);
  // C-2: el check-in exige el token del kiosko. Se guarda en el dispositivo
  // (localStorage) y postPublico lo envía en x-kiosk-token.
  const [kioskToken, setKioskToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  useEffect(() => {
    setKioskToken(typeof window !== 'undefined' ? window.localStorage.getItem('kioskToken') : null);
  }, []);

  // Today's sessions sorted by start time.
  const hoy = now ? localDate(now) : '';
  // P0-31: la parte cara (recorrer todas las sesiones + agregar todas las
  // reservas) solo depende de los datos y del DÍA (string estable), NO del reloj
  // que cambia cada segundo — así no se recalcula 60 veces por minuto para
  // siempre en un dispositivo encendido 24/7.
  const sesionesHoyBase = useMemo(() => {
    if (!hoy) return [];
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const salasById = new Map(salas.map(x => [x.id, x]));
    const ocupadas = new Map<string, number>();
    for (const r of reservas) {
      if (r.estado === 'CANCELADA') continue;
      ocupadas.set(r.sesionId, (ocupadas.get(r.sesionId) ?? 0) + 1);
    }
    return sesiones
      .filter(s => s.inicio.startsWith(hoy))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .map(s => {
        const inicio = new Date(s.inicio);
        const fin = new Date(s.fin);
        return {
          ...s,
          tipo: tiposById.get(s.tipoClaseId),
          sala: salasById.get(s.salaId),
          confirmadas: ocupadas.get(s.id) ?? 0,
          inicioDate: inicio,
          finDate: fin,
          inicioFmt: `${pad2(inicio.getHours())}:${pad2(inicio.getMinutes())}`,
          finFmt: `${pad2(fin.getHours())}:${pad2(fin.getMinutes())}`,
        };
      });
  }, [sesiones, hoy, tiposClase, salas, reservas]);

  // El tick por segundo solo recalcula isNow/isPast — O(clases del día), trivial.
  const sesionesHoy = useMemo(() =>
    sesionesHoyBase.map(s => ({
      ...s,
      isNow: now ? now >= s.inicioDate && now <= s.finDate : false,
      isPast: now ? now > s.finDate : false,
    })),
    [sesionesHoyBase, now]
  );

  // Auto-select first active/upcoming class
  useEffect(() => {
    if (!selectedSesionId && sesionesHoy.length > 0) {
      const active = sesionesHoy.find(s => s.isNow) ?? sesionesHoy.find(s => !s.isPast) ?? sesionesHoy[0];
      setSelectedSesionId(active.id);
    }
  }, [sesionesHoy, selectedSesionId]);

  const selectedSesion = sesionesHoy.find(s => s.id === selectedSesionId) ?? null;

  // Attendees for selected session
  const asistentes = useMemo(() => {
    if (!selectedSesionId) return [];
    return reservas
      .filter(r => r.sesionId === selectedSesionId && r.estado !== 'CANCELADA')
      .map(r => {
        const socio = socios.find(s => s.id === r.socioId);
        if (!socio) return null;
        return { reservaId: r.id, socioId: r.socioId, nombre: socio.nombre, apellidos: socio.apellidos, estado: r.estado };
      })
      .filter(Boolean) as { reservaId: string; socioId: string; nombre: string; apellidos: string; estado: string }[];
  }, [reservas, socios, selectedSesionId]);

  // Search among socias not yet in this session (walk-in)
  const allSocias = useMemo(() => {
    const inSession = new Set(asistentes.map(a => a.socioId));
    return socios.filter(s => s.activo && !inSession.has(s.id)).filter(s => {
      if (!searchQuery.trim()) return false;
      const q = searchQuery.toLowerCase();
      return s.nombre.toLowerCase().includes(q) || s.apellidos.toLowerCase().includes(q);
    }).slice(0, 6);
  }, [socios, asistentes, searchQuery]);

  const handleCheckin = useCallback((reservaId: string, socioId: string, nombre: string) => {
    checkin(reservaId);
    setCheckedInNow(prev => new Set([...prev, reservaId]));
    setShowSuccess({ nombre });
    setTimeout(() => setShowSuccess(null), 2500);
  }, [checkin]);

  const idx = sesionesHoy.findIndex(s => s.id === selectedSesionId);

  if (!now) return null;

  // Setup del dispositivo: sin token guardado, se pide una vez (C-2).
  if (!kioskToken) {
    return (
      <div className="fixed inset-0 bg-[#0A0A0A] text-white flex items-center justify-center p-6" style={{ fontFamily: 'var(--font-jakarta, system-ui)' }}>
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-bold mb-1">Configurar kiosko</h1>
          <p className="text-sm text-white/50 mb-4">Pega el token del kiosko (Configuración → Integraciones → Kiosko) para activar el check-in en este dispositivo.</p>
          <input
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            placeholder="Token del kiosko"
            className="w-full bg-white/10 rounded-lg px-3 py-2.5 text-sm mb-3 outline-none"
          />
          <button
            onClick={() => {
              const t = tokenInput.trim();
              if (!t) return;
              window.localStorage.setItem('kioskToken', t);
              setKioskToken(t);
            }}
            className="w-full bg-white text-black rounded-lg py-2.5 text-sm font-bold"
          >
            Activar kiosko
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] text-white flex flex-col overflow-hidden select-none" style={{ fontFamily: 'var(--font-jakarta, system-ui)' }}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
        <div>
          <div className="text-5xl font-extrabold tabular-nums tracking-tight leading-none">
            {pad2(now.getHours())}:{pad2(now.getMinutes())}
            <span className="text-3xl text-white/40 ml-1">:{pad2(now.getSeconds())}</span>
          </div>
          <div className="text-base font-medium text-white/50 mt-1">{DIAS[now.getDay()]}, {now.getDate()} de {MESES[now.getMonth()]} de {now.getFullYear()}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-white/40">
            <Wifi size={14} />
            <span>Tentare</span>
          </div>
          <a href="/dashboard" className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white/70">
            Admin →
          </a>
        </div>
      </div>

      {/* Class tabs */}
      <div className="px-8 pb-2 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {sesionesHoy.length === 0 ? (
            <p className="text-white/40 text-sm font-medium">No hay clases programadas hoy.</p>
          ) : (
            sesionesHoy.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSesionId(s.id)}
                className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={s.id === selectedSesionId
                  ? { backgroundColor: s.tipo?.color ?? '#FFC8E2', color: isDark(s.tipo?.color ?? '#FFC8E2') ? '#fff' : '#171717' }
                  : { backgroundColor: 'rgba(255,255,255,0.07)', color: s.isPast ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)' }
                }
              >
                {s.isNow && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                <span>{s.tipo?.nombre ?? 'Clase'}</span>
                <span className="opacity-60">{s.inicioFmt}</span>
                <span className="text-xs opacity-50">({s.confirmadas})</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 overflow-hidden flex flex-col px-8 pb-8 gap-4">
        {selectedSesion ? (
          <>
            {/* Session info bar */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedSesion.tipo?.color ?? '#FFC8E2' }} />
                <span className="text-xl font-bold">{selectedSesion.tipo?.nombre ?? 'Clase'}</span>
              </div>
              <span className="text-white/40">·</span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-white/60">
                <Clock size={13} />{selectedSesion.inicioFmt} – {selectedSesion.finFmt}
              </span>
              {selectedSesion.sala && (
                <>
                  <span className="text-white/40">·</span>
                  <span className="text-sm font-medium text-white/60">{selectedSesion.sala.nombre}</span>
                </>
              )}
              <span className="ml-auto flex items-center gap-1.5 text-sm font-bold" style={{ color: selectedSesion.isNow ? '#34D399' : 'rgba(255,255,255,0.5)' }}>
                <Users size={14} />{selectedSesion.confirmadas} apuntadas
                {selectedSesion.aforoMaximo && <span className="font-normal text-white/40"> / {selectedSesion.aforoMaximo}</span>}
              </span>
            </div>

            {/* Attendee grid */}
            <div className="flex-1 overflow-y-auto">
              {asistentes.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-white/30 text-lg font-medium">Nadie apuntado aún.</p>
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                  {asistentes.map(a => {
                    const asistida = a.estado === 'ASISTIDA' || checkedInNow.has(a.reservaId);
                    const av = avatarColor(a.socioId);
                    return (
                      <button
                        key={a.reservaId}
                        onClick={() => !asistida && handleCheckin(a.reservaId, a.socioId, a.nombre)}
                        disabled={asistida}
                        className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all active:scale-95"
                        style={asistida
                          ? { backgroundColor: 'rgba(52,211,153,0.12)', border: '2px solid rgba(52,211,153,0.4)', cursor: 'default' }
                          : { backgroundColor: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.08)' }
                        }
                      >
                        <div className="relative">
                          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                            style={asistida ? { backgroundColor: 'rgba(52,211,153,0.2)', color: '#34D399' } : { backgroundColor: av.bg, color: av.text }}>
                            {asistida ? <CheckCircle2 size={28} className="text-emerald-400" /> : initials(a.nombre, a.apellidos)}
                          </div>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold leading-tight" style={asistida ? { color: '#34D399' } : { color: 'white' }}>{a.nombre}</p>
                          <p className="text-xs font-medium mt-0.5" style={asistida ? { color: 'rgba(52,211,153,0.6)' } : { color: 'rgba(255,255,255,0.4)' }}>{a.apellidos}</p>
                        </div>
                        {asistida ? (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-400/20 text-emerald-400">Asistida ✓</span>
                        ) : (
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 text-white/60">Tap para confirmar</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Walk-in search */}
            <div className="shrink-0 mt-2">
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  type="text"
                  placeholder="Buscar socia para walk-in…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm font-medium text-white placeholder:text-white/30 outline-none"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white/60"><X size={14} /></button>
                )}
              </div>
              {allSocias.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {allSocias.map(s => {
                    const av = avatarColor(s.id);
                    return (
                      <button key={s.id} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/8 border border-white/10 hover:bg-white/15 transition-colors">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: av.bg, color: av.text }}>
                          {initials(s.nombre, s.apellidos)}
                        </div>
                        <span className="text-sm font-semibold text-white">{s.nombre} {s.apellidos}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white/30 text-xl font-medium">Selecciona una clase</p>
          </div>
        )}
      </div>

      {/* Success overlay */}
      {showSuccess && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="flex flex-col items-center gap-4 animate-bounce-in">
            <div className="w-28 h-28 rounded-full flex items-center justify-center bg-emerald-400/20">
              <CheckCircle2 size={56} className="text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-4xl font-extrabold text-emerald-400">¡Check-in!</p>
              <p className="text-xl font-semibold text-white/70 mt-1">{showSuccess.nombre}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
