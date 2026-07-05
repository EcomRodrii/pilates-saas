'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useStudio } from '@/lib/studio-context';
import { PlanTarifa } from '@/lib/types';
import {
  ChevronLeft, ChevronRight, Clock, Users, MapPin,
  CheckCircle2, X, Calendar, Search, Zap, Award, Heart, Star,
  CreditCard, Pen, FileText, Download, ExternalLink,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0'); }
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monday(d: Date): Date {
  const r = new Date(d); const day = r.getDay();
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); r.setHours(0, 0, 0, 0); return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function fmtTime(iso: string) {
  const d = new Date(iso); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtLong(d: Date) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
function fmtShort(d: Date) {
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
}

const NIVEL_LABEL: Record<string, string> = {
  PRINCIPIANTE: 'Principiante', MEDIO: 'Intermedio',
  AVANZADO: 'Avanzado', TODOS: 'Todos los niveles',
};
const NIVEL_COLOR: Record<string, { bg: string; text: string }> = {
  PRINCIPIANTE: { bg: '#D1FAE5', text: '#065F46' },
  MEDIO: { bg: '#FEF3C7', text: '#92400E' },
  AVANZADO: { bg: '#FEE2E2', text: '#B91C1C' },
  TODOS: { bg: '#EFF6FF', text: '#1D4ED8' },
};

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function toCalDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').slice(0, 15) + 'Z';
}

type SesionRich = {
  id: string; inicio: string; fin: string; aforoMaximo: number; cancelada: boolean;
  tipoClaseId: string; salaId: string | null; instructorId: string | null;
  tipo?: { nombre: string; color: string; duracionMinutos: number; descripcion?: string | null; nivel?: string };
  sala?: { nombre: string };
  instructor?: { nombre: string };
  ocupadas: number;
};

function makeGoogleCalUrl(s: SesionRich): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: s.tipo?.nombre ?? 'Clase Pilates',
    dates: `${toCalDate(s.inicio)}/${toCalDate(s.fin)}`,
    details: `Instructora: ${s.instructor?.nombre ?? ''} · Sala: ${s.sala?.nombre ?? ''}`,
    location: 'Tentare · Calle Larios 12, Málaga',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadICS(s: SesionRich) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tentare//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTART:${toCalDate(s.inicio)}`,
    `DTEND:${toCalDate(s.fin)}`,
    `SUMMARY:${s.tipo?.nombre ?? 'Clase Pilates'}`,
    'LOCATION:Tentare · Calle Larios 12\\, Málaga',
    `DESCRIPTION:Instructora: ${s.instructor?.nombre ?? ''} · Sala: ${s.sala?.nombre ?? ''}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'clase-pilates.ics'; a.click();
  URL.revokeObjectURL(url);
}

// ─── Canvas Signature ─────────────────────────────────────────────────────────

function CanvasSignature({ onHasDrawing }: { onHasDrawing: (v: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    const me = e as React.MouseEvent;
    return { x: (me.clientX - rect.left) * scaleX, y: (me.clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const pos = getPos(e);
    if (lastPos.current) {
      ctx.beginPath();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPos.current = pos;
    onHasDrawing(true);
  }

  function endDraw() { drawing.current = false; lastPos.current = null; }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    onHasDrawing(false);
  }

  return (
    <div>
      <canvas ref={canvasRef} width={560} height={140}
        className="w-full rounded-xl touch-none cursor-crosshair"
        style={{ backgroundColor: '#fff', border: '1.5px solid rgba(255,255,255,0.15)', height: '100px' }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <button onClick={clear} className="text-[11px] text-white/35 hover:text-white/60 mt-1.5 transition-colors">
        Limpiar firma
      </button>
    </div>
  );
}

// ─── Local socia session ──────────────────────────────────────────────────────

interface LocalSocia { nombre: string; email: string; socioId?: string }

function useLocalSocia() {
  const [socia, setSocia] = useState<LocalSocia | null>(null);
  useEffect(() => {
    try { const r = localStorage.getItem('ps_portal_socia'); if (r) setSocia(JSON.parse(r)); } catch { /* */ }
  }, []);
  function login(data: LocalSocia) { setSocia(data); localStorage.setItem('ps_portal_socia', JSON.stringify(data)); }
  function logout() { setSocia(null); localStorage.removeItem('ps_portal_socia'); }
  return { socia, login, logout };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LevelBadge({ nivel }: { nivel?: string }) {
  if (!nivel || nivel === 'TODOS') return (
    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: 'rgba(129,140,248,0.2)', color: '#a5b4fc' }}>
      Todos los niveles
    </span>
  );
  const c = NIVEL_COLOR[nivel] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const emoji = nivel === 'PRINCIPIANTE' ? '🟢' : nivel === 'MEDIO' ? '🟡' : '🔴';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: c.bg, color: c.text }}>
      {emoji} {NIVEL_LABEL[nivel] ?? nivel}
    </span>
  );
}

function PlazasDots({ taken, total }: { taken: number; total: number }) {
  const left = Math.max(0, total - taken);
  const color = left === 0 ? '#EF4444' : left <= 2 ? '#F59E0B' : '#10B981';
  const label = left === 0 ? 'Clase llena' : left === 1 ? '1 plaza libre' : `${left} plazas libres`;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: Math.min(total, 8) }).map((_, i) => (
          <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: i < taken ? 'rgba(255,255,255,0.15)' : color }} />
        ))}
        {total > 8 && <span className="text-[10px] text-white/30 ml-1">+{total - 8}</span>}
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'clases' | 'misreservas' | 'estudio';
type Step = 'login' | 'contrato' | 'confirm' | 'done' | 'espera';

export default function ReservarPage() {
  const {
    sesiones, reservas, socios, tiposClase, salas, instructores,
    planesTarifa, studioConfig,
    addReserva, updateSocio, cancelarReserva, addSocioFromPortal,
  } = useStudio();
  const { socia, login, logout } = useLocalSocia();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<Tab>('clases');

  // Booking flow
  const [bookingSesionId, setBookingSesionId] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ nombre: '', email: '' });
  const [loginStep, setLoginStep] = useState<Step>('login');

  // Contract
  const [canvasSigned, setCanvasSigned] = useState(false);

  // Stripe
  const [stripeLoading, setStripeLoading] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const now = mounted ? new Date() : new Date('2026-06-29');
  const weekStart = useMemo(() => addDays(monday(now), weekOffset * 7), [weekOffset, mounted]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  useEffect(() => {
    if (mounted && !selectedDay) setSelectedDay(localDate(now));
  }, [mounted]);

  const sesionesRich = useMemo(() => sesiones.map(s => {
    const tipo = tiposClase.find(t => t.id === s.tipoClaseId);
    const sala = salas.find(x => x.id === s.salaId);
    const instructor = instructores.find(i => i.id === s.instructorId);
    const ocupadas = reservas.filter(r => r.sesionId === s.id && r.estado !== 'CANCELADA').length;
    return { ...s, tipo, sala, instructor, ocupadas };
  }), [sesiones, tiposClase, salas, instructores, reservas]);

  const sesionesDelDia = useMemo(() => {
    if (!selectedDay) return [];
    return sesionesRich
      .filter(s => s.inicio.startsWith(selectedDay) && !s.cancelada)
      .filter(s => !filtroTipo || s.tipoClaseId === filtroTipo)
      .filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (s.tipo?.nombre ?? '').toLowerCase().includes(q) || (s.instructor?.nombre ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [sesionesRich, selectedDay, filtroTipo, searchQuery]);

  const misReservas = useMemo(() => {
    if (!socia?.socioId) return [];
    return reservas
      .filter(r => r.socioId === socia.socioId && r.estado !== 'CANCELADA')
      .map(r => ({ ...r, sesion: sesionesRich.find(s => s.id === r.sesionId) }))
      .filter(r => r.sesion)
      .sort((a, b) => (a.sesion!.inicio ?? '').localeCompare(b.sesion!.inicio ?? ''));
  }, [reservas, socia, sesionesRich]);

  const yaReservado = useCallback((sesionId: string) => {
    if (!socia?.socioId) return false;
    return reservas.some(r => r.sesionId === sesionId && r.socioId === socia.socioId && r.estado !== 'CANCELADA');
  }, [reservas, socia]);

  function openBooking(sesionId: string) {
    setBookingSesionId(sesionId);
    setCanvasSigned(false);
    if (!socia) {
      setLoginStep('login');
    } else {
      const found = socia.socioId ? socios.find(s => s.id === socia.socioId) : null;
      const needsContract = !found?.aceptacionContrato;
      setLoginStep(needsContract ? 'contrato' : 'confirm');
    }
  }

  function closeBooking() { setBookingSesionId(null); setLoginStep('login'); setCanvasSigned(false); }

  function handleLogin() {
    if (!loginForm.nombre.trim() || !loginForm.email.trim()) return;
    const found = socios.find(s => s.email?.toLowerCase() === loginForm.email.trim().toLowerCase());
    login({ nombre: loginForm.nombre.trim(), email: loginForm.email.trim(), socioId: found?.id });
    // New guests and existing socias without a signed contract go to contrato step
    const needsContract = !found || !found.aceptacionContrato;
    setLoginStep(needsContract ? 'contrato' : 'confirm');
  }

  function handleSignContract() {
    if (socia?.socioId) {
      updateSocio(socia.socioId, {
        aceptacionContrato: {
          fecha: new Date().toISOString(),
          firma: socia.nombre,
          versionTexto: 'v1.1',
        },
      });
    }
    setLoginStep('confirm');
  }

  function handleConfirm() {
    if (!bookingSesionId || !socia) return;
    const sesion = sesionesRich.find(s => s.id === bookingSesionId);
    if (!sesion) return;
    const isFull = sesion.ocupadas >= sesion.aforoMaximo;

    let socioId = socia.socioId;
    if (!socioId) {
      // First-time booking: register guest as a real socia with contract accepted
      socioId = `soc-${Date.now()}`;
      addSocioFromPortal({
        id: socioId,
        nombre: socia.nombre,
        email: socia.email,
        aceptacionContrato: {
          fecha: new Date().toISOString(),
          firma: socia.nombre,
          versionTexto: 'v1.1',
        },
      });
      login({ nombre: socia.nombre, email: socia.email, socioId });
    }

    addReserva(bookingSesionId, socioId);
    setLoginStep(isFull ? 'espera' : 'done');
  }

  async function handleContratarPlan(plan: PlanTarifa) {
    setStripeError(null);
    setStripeLoading(plan.id);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reciboId: `portal-${plan.id}-${Date.now()}`,
          concepto: plan.nombre,
          importe: plan.precio,
          socioEmail: socia?.email ?? null,
          socioNombre: socia?.nombre ?? 'Socia',
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setStripeError(data.error ?? 'Error al procesar el pago');
      }
    } catch {
      setStripeError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setStripeLoading(null);
    }
  }

  if (!mounted) return null;

  const bookingSesion = bookingSesionId ? sesionesRich.find(s => s.id === bookingSesionId) : null;

  const PRIMARY = '#4F46E5'; // indigo brand color

  return (
    <div className="min-h-screen bg-[#F4F6F9]">

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="max-w-2xl mx-auto px-4">
          {/* Studio identity */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0"
                style={{ backgroundColor: PRIMARY }}>T</div>
              <div>
                <p className="font-bold text-gray-900 text-sm leading-tight">Tentare</p>
                <p className="text-gray-400 text-[11px]">Málaga · Calle Larios 12</p>
              </div>
            </div>
            {socia ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                    style={{ backgroundColor: PRIMARY }}>
                    {socia.nombre[0]}
                  </div>
                  <span className="text-gray-700 text-sm font-medium">{socia.nombre.split(' ')[0]}</span>
                  <button onClick={logout} className="text-gray-400 hover:text-gray-600 ml-0.5"><X size={12} /></button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setBookingSesionId(''); setLoginStep('login'); openBooking(''); }}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors"
                style={{ backgroundColor: PRIMARY }}>
                Acceder
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0">
            {([['clases', 'Clases'], ['misreservas', 'Mis reservas'], ['estudio', 'El estudio']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-2.5 text-sm font-semibold border-b-2 transition-all"
                style={tab === t
                  ? { color: PRIMARY, borderColor: PRIMARY }
                  : { color: '#9CA3AF', borderColor: 'transparent' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── CONTENT ─────────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* ── TAB: CLASES ─────────────────────────────────────────────────── */}
        {tab === 'clases' && (
          <div className="space-y-4">

            {/* Date selector */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setWeekOffset(o => o - 1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                  <ChevronLeft size={18} />
                </button>
                <div className="flex-1 flex gap-1 overflow-x-auto">
                  {weekDays.map(d => {
                    const key = localDate(d);
                    const isToday = key === localDate(now);
                    const isSel = key === selectedDay;
                    const hasSess = sesionesRich.some(s => s.inicio.startsWith(key) && !s.cancelada);
                    return (
                      <button key={key} onClick={() => setSelectedDay(key)}
                        className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all shrink-0 min-w-[42px]"
                        style={isSel
                          ? { backgroundColor: PRIMARY, color: '#fff' }
                          : { color: isToday ? '#111827' : '#9CA3AF' }}>
                        <span className="text-[9px] font-semibold uppercase">{fmtShort(d).split(' ')[0]}</span>
                        <span className={`text-base font-bold leading-none ${isToday && !isSel ? 'underline decoration-dotted' : ''}`}>{d.getDate()}</span>
                        {hasSess && <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: isSel ? 'rgba(255,255,255,0.7)' : PRIMARY }} />}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setWeekOffset(o => o + 1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Class type filters */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['', ...tiposClase.map(t => t.id)].map(id => {
                const tipo = tiposClase.find(t => t.id === id);
                const active = filtroTipo === id;
                return (
                  <button key={id || 'all'} onClick={() => setFiltroTipo(id)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
                    style={active
                      ? { backgroundColor: tipo?.color ?? PRIMARY, color: '#fff', borderColor: tipo?.color ?? PRIMARY }
                      : { backgroundColor: 'white', color: '#6B7280', borderColor: '#E5E7EB' }}>
                    {tipo && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : tipo.color }} />}
                    {tipo ? tipo.nombre : 'Todas las clases'}
                  </button>
                );
              })}
            </div>

            {/* Day heading */}
            {selectedDay && (
              <p className="text-gray-900 font-bold text-base capitalize px-1">
                {fmtLong(new Date(selectedDay + 'T12:00:00'))}
              </p>
            )}

            {sesionesDelDia.length === 0 ? (
              <div className="bg-white rounded-2xl flex flex-col items-center py-16 gap-3 text-center shadow-sm">
                <Calendar size={28} className="text-gray-300" />
                <p className="text-gray-500 font-medium">No hay clases este día</p>
                <button onClick={() => setWeekOffset(o => o + 1)}
                  className="text-sm font-semibold" style={{ color: PRIMARY }}>
                  Ver semana siguiente →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sesionesDelDia.map(s => {
                  const reservado = yaReservado(s.id);
                  const lleno = s.ocupadas >= s.aforoMaximo;
                  const isPast = new Date(s.fin) < now;
                  return (
                    <div key={s.id} className="bg-white rounded-2xl shadow-sm overflow-hidden"
                      style={{ opacity: isPast ? 0.6 : 1, border: reservado ? '1.5px solid #D1FAE5' : '1px solid #F1F3F5' }}>

                      <div className="h-1.5" style={{ backgroundColor: s.tipo?.color ?? PRIMARY }} />
                      <div className="p-4">
                        <div className="flex items-baseline justify-between mb-2">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-gray-900 font-extrabold text-2xl leading-none">{fmtTime(s.inicio)}</span>
                            <span className="text-gray-400 text-sm">→ {fmtTime(s.fin)}</span>
                            <span className="text-gray-300 text-xs">{s.tipo?.duracionMinutos} min</span>
                          </div>
                          <LevelBadge nivel={s.tipo?.nivel} />
                        </div>
                        <h3 className="text-gray-900 font-bold text-lg leading-tight mb-1">{s.tipo?.nombre ?? 'Clase'}</h3>
                        {s.tipo?.descripcion && (
                          <p className="text-gray-500 text-sm mb-3 leading-relaxed">{s.tipo.descripcion}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mb-4 mt-2">
                          {s.instructor && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                style={{ backgroundColor: s.tipo?.color ?? PRIMARY }}>
                                {s.instructor.nombre.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                              </div>
                              <span className="text-gray-600 text-sm">{s.instructor.nombre}</span>
                            </div>
                          )}
                          {s.sala && (
                            <div className="flex items-center gap-1 text-gray-400 text-sm">
                              <MapPin size={12} />{s.sala.nombre}
                            </div>
                          )}
                          <div className="ml-auto">
                            <PlazasDots taken={s.ocupadas} total={s.aforoMaximo} />
                          </div>
                        </div>
                        {isPast ? (
                          <div className="py-2.5 text-center text-sm text-gray-400 bg-gray-50 rounded-xl">Clase finalizada</div>
                        ) : reservado ? (
                          <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-100">
                            <CheckCircle2 size={15} />¡Ya estás apuntada!
                          </div>
                        ) : lleno ? (
                          <button onClick={() => openBooking(s.id)}
                            className="w-full py-2.5 rounded-xl text-sm font-semibold text-gray-500 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors">
                            Clase completa · Lista de espera →
                          </button>
                        ) : (
                          <button onClick={() => openBooking(s.id)}
                            className="w-full py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 active:scale-[0.98] transition-all"
                            style={{ backgroundColor: s.tipo?.color ?? PRIMARY }}>
                            Reservar plaza →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: MIS RESERVAS ───────────────────────────────────────────── */}
        {tab === 'misreservas' && (
          <div className="space-y-3">
            {!socia ? (
              <div className="bg-white rounded-2xl flex flex-col items-center py-16 gap-4 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
                  <Users size={24} style={{ color: PRIMARY }} />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-lg">Identifícate para ver tus reservas</h2>
                  <p className="text-gray-500 text-sm mt-1">Introduce tu nombre y email para acceder</p>
                </div>
                <button onClick={() => { setBookingSesionId(''); setLoginStep('login'); }}
                  className="px-6 py-3 rounded-xl font-bold text-white text-sm"
                  style={{ backgroundColor: PRIMARY }}>
                  Acceder
                </button>
              </div>
            ) : misReservas.length === 0 ? (
              <div className="bg-white rounded-2xl flex flex-col items-center py-16 gap-3 text-center shadow-sm">
                <Calendar size={28} className="text-gray-300" />
                <p className="text-gray-500 font-medium">No tienes reservas todavía</p>
                <button onClick={() => setTab('clases')} className="text-sm font-semibold" style={{ color: PRIMARY }}>
                  Explorar clases →
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-1 mb-1">
                  <h2 className="text-gray-900 font-bold text-base">Mis clases</h2>
                  <span className="text-gray-400 text-sm">{misReservas.length} reserva{misReservas.length !== 1 ? 's' : ''}</span>
                </div>
                {misReservas.map(r => {
                  const s = r.sesion!;
                  const isPast = new Date(s.fin) < now;
                  const isFuture = !isPast && r.estado !== 'ASISTIDA';
                  const fechaLarga = new Date(s.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
                  return (
                    <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden"
                      style={{ border: isFuture ? `1.5px solid ${s.tipo?.color ?? PRIMARY}40` : '1px solid #F1F3F5', opacity: isPast ? 0.7 : 1 }}>
                      <div className="h-1" style={{ backgroundColor: s.tipo?.color ?? PRIMARY, opacity: isPast ? 0.4 : 1 }} />
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <p className="font-bold text-gray-900 text-base leading-tight">{s.tipo?.nombre}</p>
                            <p className="text-gray-500 text-sm mt-0.5 capitalize">{fechaLarga}</p>
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
                            style={r.estado === 'ASISTIDA'
                              ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                              : r.estado === 'LISTA_ESPERA'
                              ? { backgroundColor: '#FEF3C7', color: '#92400E' }
                              : isPast ? { backgroundColor: '#F3F4F6', color: '#9CA3AF' }
                              : { backgroundColor: '#EEF2FF', color: PRIMARY }}>
                            {r.estado === 'ASISTIDA' ? '✓ Asistida' : r.estado === 'LISTA_ESPERA' ? '⏳ En espera' : isPast ? 'Finalizada' : '✅ Confirmada'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                          <span className="font-bold text-gray-900 text-xl">{fmtTime(s.inicio)}<span className="text-gray-400 text-sm font-normal ml-1">→ {fmtTime(s.fin)}</span></span>
                          {s.instructor && <span>{s.instructor.nombre}</span>}
                          {s.sala && <span>{s.sala.nombre}</span>}
                          <LevelBadge nivel={s.tipo?.nivel} />
                        </div>
                        {isFuture && (
                          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                            <a href={makeGoogleCalUrl(s)} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors">
                              <Calendar size={12} /> Añadir al calendario
                            </a>
                            <button onClick={() => downloadICS(s)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors">
                              <Download size={12} /> .ics
                            </button>
                            <button onClick={() => { if (confirm('¿Cancelar esta reserva?')) cancelarReserva(r.id); }}
                              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors">
                              <X size={12} /> Cancelar plaza
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── TAB: EL ESTUDIO ─────────────────────────────────────────────── */}
        {tab === 'estudio' && (
          <div className="space-y-6">
            {/* Studio info */}
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center" style={{ border: '1px solid #F1F3F5' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white text-lg font-black"
                style={{ backgroundColor: PRIMARY }}>T</div>
              <h2 className="text-gray-900 text-xl font-extrabold">Tentare</h2>
              <p className="text-gray-500 text-sm mt-1">Málaga · Calle Larios 12, 2º</p>
              <p className="text-gray-500 text-sm mt-3 max-w-sm mx-auto leading-relaxed">
                Estudio boutique especializado en pilates reformer. Grupos reducidos para atención personalizada.
              </p>
              <div className="flex items-center justify-center gap-3 mt-4 text-sm">
                <span className="font-semibold" style={{ color: PRIMARY }}>hola@tentare.es</span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">+34 951 000 000</span>
              </div>
            </div>

            {/* Plans + Stripe */}
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <CreditCard size={16} style={{ color: PRIMARY }} />
                <h3 className="text-gray-900 font-bold text-base">Nuestros planes</h3>
              </div>
              {stripeError && (
                <div className="mb-3 px-4 py-3 rounded-xl text-sm text-rose-600 bg-rose-50 border border-rose-200">
                  {stripeError}
                </div>
              )}
              <div className="space-y-3">
                {planesTarifa.filter(p => p.activo).map(p => (
                  <div key={p.id} className="bg-white rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm"
                    style={{ border: '1px solid #F1F3F5' }}>
                    <div className="min-w-0">
                      <p className="text-gray-900 font-bold text-sm">{p.nombre}</p>
                      {p.descripcion && <p className="text-gray-500 text-xs mt-0.5">{p.descripcion}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#EEF2FF', color: PRIMARY }}>
                          {p.tipo === 'MENSUAL' ? 'Mensual' : p.tipo === 'BONO' ? `Bono ${p.sesiones} clases` : 'Clase suelta'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-gray-900 font-extrabold text-xl leading-none">{p.precio}€</p>
                        {p.tipo === 'MENSUAL' && <p className="text-gray-400 text-[10px]">/mes</p>}
                      </div>
                      <button onClick={() => handleContratarPlan(p)}
                        disabled={stripeLoading === p.id}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
                        style={{ backgroundColor: PRIMARY }}>
                        {stripeLoading === p.id
                          ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <><CreditCard size={13} />Contratar</>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-gray-400 text-xs mt-3 text-center">Pago seguro con Stripe · IVA incluido</p>
            </div>

            {/* Class types */}
            <div>
              <h3 className="text-gray-900 font-bold text-base mb-3 px-1">Tipos de clase</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {tiposClase.map(t => (
                  <div key={t.id} className="bg-white rounded-2xl p-4 shadow-sm"
                    style={{ border: `1.5px solid ${t.color}25` }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <p className="text-gray-900 font-bold text-sm">{t.nombre}</p>
                    </div>
                    <p className="text-gray-500 text-xs">{t.descripcion}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-gray-400">{t.duracionMinutos} min</span>
                      <LevelBadge nivel={t.nivel} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Instructors */}
            <div>
              <h3 className="text-gray-900 font-bold text-base mb-3 px-1">Instructoras</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {instructores.filter(i => i.activo).map(i => (
                  <div key={i.id} className="bg-white flex items-center gap-3 rounded-2xl p-4 shadow-sm"
                    style={{ border: '1px solid #F1F3F5' }}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                      style={{ backgroundColor: i.color ?? PRIMARY }}>
                      {i.nombre.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-gray-900 font-semibold text-sm">{i.nombre}</p>
                      {i.email != null && <p className="text-gray-400 text-xs mt-0.5">{i.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legal links */}
            <div className="flex items-center justify-center gap-6 pt-2 pb-4">
              {[
                { label: 'Política de privacidad', text: studioConfig.politicaPrivacidad },
                { label: 'Términos de servicio', text: studioConfig.terminosServicio },
              ].map(({ label, text }) => (
                <button key={label}
                  onClick={() => {
                    const w = window.open('', '_blank');
                    if (w) { w.document.write(`<pre style="font-family:sans-serif;padding:2rem;max-width:700px;margin:auto;white-space:pre-wrap">${text}</pre>`); w.document.title = label; }
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  <FileText size={12} />{label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL ───────────────────────────────────────────────────────────── */}
      {(bookingSesionId !== null) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={closeBooking}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={18} />
            </button>

            {/* ── DONE ── */}
            {loginStep === 'done' && bookingSesion && (
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 size={30} style={{ color: '#059669' }} />
                </div>
                <div>
                  <p className="text-gray-900 font-extrabold text-xl">¡Reserva confirmada!</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {bookingSesion.tipo?.nombre} · {fmtLong(new Date(bookingSesion.inicio))} a las {fmtTime(bookingSesion.inicio)}
                  </p>
                </div>
                <div className="w-full space-y-2.5 mt-1">
                  <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Añadir a tu calendario</p>
                  <a href={makeGoogleCalUrl(bookingSesion)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold text-white transition-all"
                    style={{ backgroundColor: '#4285F4' }}>
                    <ExternalLink size={14} />Google Calendar
                  </a>
                  <button onClick={() => downloadICS(bookingSesion)}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all">
                    <Download size={14} />Descargar .ics (Apple / Outlook)
                  </button>
                </div>
                <button onClick={closeBooking} className="text-gray-400 text-sm hover:text-gray-600 transition-colors mt-1">
                  Cerrar
                </button>
              </div>
            )}

            {/* ── ESPERA ── */}
            {loginStep === 'espera' && (
              <div className="flex flex-col items-center text-center py-4 gap-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEF3C7' }}>
                  <CheckCircle2 size={30} style={{ color: '#D97706' }} />
                </div>
                <div>
                  <p className="text-gray-900 font-extrabold text-xl">¡En lista de espera!</p>
                  <p className="text-gray-500 text-sm mt-1">Te avisaremos si se libera una plaza.</p>
                </div>
                <button onClick={closeBooking}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-gray-700 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all">
                  Cerrar
                </button>
              </div>
            )}

            {/* ── LOGIN ── */}
            {loginStep === 'login' && (
              <>
                <h2 className="text-gray-900 font-bold text-lg mb-1">Identificarte</h2>
                <p className="text-gray-500 text-sm mb-5">Introduce tu nombre y email para reservar.</p>
                <div className="space-y-2.5 mb-5">
                  {(['nombre', 'email'] as const).map(field => (
                    <input key={field} type={field === 'email' ? 'email' : 'text'}
                      placeholder={field === 'nombre' ? 'Tu nombre completo' : 'Tu email'}
                      value={loginForm[field]}
                      onChange={e => setLoginForm(f => ({ ...f, [field]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleLogin()}
                      className="w-full rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none border border-gray-200 focus:border-indigo-400 transition-colors"
                      style={{ backgroundColor: '#F9FAFB' }} />
                  ))}
                </div>
                <button onClick={handleLogin} disabled={!loginForm.nombre || !loginForm.email}
                  className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-40"
                  style={{ backgroundColor: PRIMARY }}>
                  Continuar →
                </button>
              </>
            )}

            {/* ── CONTRATO ── */}
            {loginStep === 'contrato' && (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Pen size={16} style={{ color: PRIMARY }} className="shrink-0" />
                  <h2 className="text-gray-900 font-bold text-lg">Firma el contrato</h2>
                </div>
                <p className="text-gray-500 text-sm mb-4">
                  Antes de tu primera reserva, lee y firma los términos de servicio.
                </p>
                <div className="rounded-xl p-3 mb-4 text-[11px] text-gray-500 leading-relaxed overflow-y-auto bg-gray-50 border border-gray-200"
                  style={{ maxHeight: '140px', whiteSpace: 'pre-wrap' }}>
                  {studioConfig.terminosServicio}
                </div>
                <div className="mb-4">
                  <p className="text-gray-700 text-xs font-semibold mb-2">
                    Firma aquí abajo <span className="text-gray-400 font-normal">(dibuja tu firma)</span>
                  </p>
                  <CanvasSignature onHasDrawing={setCanvasSigned} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setLoginStep('login')}
                    className="flex-1 py-3 rounded-2xl text-sm font-semibold text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all">
                    Volver
                  </button>
                  <button onClick={handleSignContract} disabled={!canvasSigned}
                    className="flex-[2] py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-40"
                    style={{ backgroundColor: PRIMARY }}>
                    Firmar y continuar →
                  </button>
                </div>
              </>
            )}

            {/* ── CONFIRM ── */}
            {loginStep === 'confirm' && bookingSesion && (
              <>
                <h2 className="text-gray-900 font-bold text-lg mb-4">Confirmar reserva</h2>
                <div className="rounded-2xl p-4 mb-4 bg-gray-50 border border-gray-200">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: bookingSesion.tipo?.color ?? PRIMARY }} />
                    <p className="text-gray-900 font-bold">{bookingSesion.tipo?.nombre}</p>
                  </div>
                  <p className="text-gray-500 text-sm">{fmtLong(new Date(bookingSesion.inicio))}</p>
                  <p className="text-gray-500 text-sm">{fmtTime(bookingSesion.inicio)} · {bookingSesion.instructor?.nombre}</p>
                  {bookingSesion.ocupadas >= bookingSesion.aforoMaximo && (
                    <p className="text-amber-600 text-xs font-medium mt-2">
                      Clase llena — te apuntaremos en lista de espera
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2.5 mb-5 px-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: PRIMARY }}>
                    {socia?.nombre[0]}
                  </div>
                  <p className="text-gray-500 text-sm">
                    <span className="text-gray-900 font-semibold">{socia?.nombre}</span>
                    <span className="mx-1">·</span>{socia?.email}
                  </p>
                </div>
                <button onClick={handleConfirm}
                  className="w-full py-3 rounded-2xl font-bold text-white"
                  style={{ backgroundColor: PRIMARY }}>
                  Confirmar reserva
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
