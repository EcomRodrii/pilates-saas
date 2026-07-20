'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, ChevronLeft, ChevronRight, X, CheckCircle2, Calendar, User } from 'lucide-react';
import type { ServicioCita, DisponibilidadCita, Instructor } from '@/lib/types';
import { PublicSheet } from '@/components/ui/public-sheet';

// ─────────────────────────────────────────────────────────────────────────────
// Reserva pública de citas 1:1 (widget /reservar). Flujo: servicio → instructora
// → día → hueco → confirmar. Los huecos los calcula el servidor (GET
// /api/public/citas) sobre el horario fino; la reserva va por reservarCitaPublica
// (Bearer JWT). No decide nada de negocio: solo orquesta la UI.
// ─────────────────────────────────────────────────────────────────────────────

interface Hueco { inicio: string; fin: string }

interface MiCita {
  id: string;
  servicioNombre: string;
  instructorNombre: string;
  inicio: string;
  fin: string;
  estado: string;
}

export interface CitasPublicaProps {
  studioId: string;
  servicios: ServicioCita[];
  instructores: Instructor[];
  disponibilidad: DisponibilidadCita[];
  misCitas: MiCita[];
  autenticada: boolean;
  onNeedLogin: () => void;
  onReservar: (servicioId: string, instructorId: string, inicioISO: string) => Promise<{ ok: true } | { error: string }>;
  onCancelar: (citaId: string) => void;
  primary: string;
  primaryFg: string;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function localDate(d: Date) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
}
function fmtDiaLargo(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
}
const DOW_CORTO = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export function CitasPublica({
  studioId, servicios, instructores, disponibilidad, misCitas,
  autenticada, onNeedLogin, onReservar, onCancelar, primary, primaryFg,
}: CitasPublicaProps) {
  const hoy = useMemo(() => new Date(), []);
  const [servicioId, setServicioId] = useState<string | null>(servicios.length === 1 ? servicios[0].id : null);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = useState<Date>(hoy);
  const [selectedDay, setSelectedDay] = useState<string>(localDate(hoy));
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [loadingHuecos, setLoadingHuecos] = useState(false);
  const [booking, setBooking] = useState<Hueco | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true } | { error: string } | null>(null);

  const servicio = servicios.find(s => s.id === servicioId) ?? null;

  // Instructoras que aceptan citas (tienen horario fino definido).
  const instructorasDisponibles = useMemo(
    () => instructores.filter(i => i.activo && disponibilidad.some(d => d.instructorId === i.id)),
    [instructores, disponibilidad],
  );

  const semana = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const base = new Date(weekAnchor);
    const lunes = addDays(base, -((base.getDay() + 6) % 7)); // lunes de la semana del anchor
    return addDays(lunes, i);
  }), [weekAnchor]);

  // Carga de huecos cuando hay servicio + instructora + día.
  useEffect(() => {
    if (!servicioId || !instructorId) { setHuecos(null); return; }
    let cancelado = false;
    setLoadingHuecos(true);
    const url = `/api/public/citas?studioId=${encodeURIComponent(studioId)}&servicioId=${encodeURIComponent(servicioId)}&instructorId=${encodeURIComponent(instructorId)}&fecha=${selectedDay}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { if (!cancelado) setHuecos(Array.isArray(d.huecos) ? d.huecos : []); })
      .catch(() => { if (!cancelado) setHuecos([]); })
      .finally(() => { if (!cancelado) setLoadingHuecos(false); });
    return () => { cancelado = true; };
  }, [studioId, servicioId, instructorId, selectedDay]);

  async function confirmar() {
    if (!booking || !servicioId || !instructorId) return;
    if (!autenticada) { onNeedLogin(); return; }
    setEnviando(true);
    const r = await onReservar(servicioId, instructorId, booking.inicio);
    setEnviando(false);
    setResultado(r);
    if ('ok' in r) {
      // Quita el hueco recién reservado de la lista visible.
      setHuecos(prev => (prev ?? []).filter(h => h.inicio !== booking.inicio));
    }
  }

  function cerrarSheet() { setBooking(null); setResultado(null); }

  const citasFuturas = misCitas
    .filter(c => c.estado !== 'CANCELADA' && new Date(c.fin).getTime() > Date.now())
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  if (servicios.length === 0) {
    return (
      <div className="bg-white rounded-2xl flex flex-col items-center py-16 gap-3 text-center shadow-sm">
        <Clock size={28} className="text-[#C6C6BE]" />
        <p className="text-[#8E8E86] font-medium">Este estudio aún no ofrece citas reservables online</p>
        <p className="text-[#B0B0A8] text-sm max-w-xs">Escríbeles para reservar una sesión individual.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Mis próximas citas */}
      {citasFuturas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[#1A1A1A] font-bold text-base px-1">Mis próximas citas</h2>
          {citasFuturas.map(c => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3" style={{ border: '1px solid #F1F3F5' }}>
              <div className="min-w-0">
                <p className="font-bold text-[#1A1A1A] text-sm">{c.servicioNombre}</p>
                <p className="text-[#8E8E86] text-xs mt-0.5 capitalize">{fmtDiaLargo(c.inicio)} · {fmtHora(c.inicio)}</p>
                <p className="text-[#8E8E86] text-xs mt-0.5 flex items-center gap-1"><User size={11} />{c.instructorNombre}</p>
              </div>
              <button onClick={() => onCancelar(c.id)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors">
                <X size={12} />Cancelar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 1) Servicio */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#8E8E86] px-1">1 · Elige el servicio</p>
        <div className="grid gap-2">
          {servicios.map(s => {
            const sel = s.id === servicioId;
            return (
              <button key={s.id}
                onClick={() => { setServicioId(s.id); setInstructorId(null); setHuecos(null); }}
                className="text-left rounded-2xl p-4 border transition-all bg-white flex items-center justify-between gap-3"
                style={{ borderColor: sel ? primary : '#E7E7E0', boxShadow: sel ? `0 0 0 1px ${primary}` : undefined }}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color ?? primary }} />
                  <div className="min-w-0">
                    <p className="font-bold text-[#1A1A1A] text-sm truncate">{s.nombre}</p>
                    <p className="text-[#8E8E86] text-xs">{s.duracionMin} min{s.precio != null ? ` · ${s.precio} €` : ''}</p>
                  </div>
                </div>
                {sel && <CheckCircle2 size={18} style={{ color: primary }} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2) Instructora */}
      {servicioId && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#8E8E86] px-1">2 · Elige con quién</p>
          {instructorasDisponibles.length === 0 ? (
            <p className="text-[#8E8E86] text-sm px-1">No hay instructoras con horario de citas configurado.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {instructorasDisponibles.map(i => {
                const sel = i.id === instructorId;
                return (
                  <button key={i.id} onClick={() => { setInstructorId(i.id); setResultado(null); }}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all"
                    style={sel
                      ? { backgroundColor: primary, color: primaryFg, borderColor: primary }
                      : { backgroundColor: 'white', color: '#3A3A34', borderColor: '#E7E7E0' }}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ backgroundColor: i.color ?? primary }}>
                      {i.nombre[0]}
                    </span>
                    {i.nombre.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3) Día + huecos */}
      {servicioId && instructorId && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#8E8E86] px-1">3 · Elige el hueco</p>

          {/* Semana */}
          <div className="flex items-center justify-between">
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} aria-label="Semana anterior"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#E7E7E0]">
              <ChevronLeft size={16} className="text-[#3A3A34]" />
            </button>
            <div className="flex gap-1.5 flex-1 justify-center px-2">
              {semana.map(d => {
                const key = localDate(d);
                const sel = key === selectedDay;
                const pasado = localDate(d) < localDate(hoy);
                return (
                  <button key={key} disabled={pasado} onClick={() => setSelectedDay(key)}
                    className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl border transition-all disabled:opacity-30"
                    style={sel
                      ? { backgroundColor: primary, color: primaryFg, borderColor: primary }
                      : { backgroundColor: 'white', color: '#3A3A34', borderColor: '#E7E7E0' }}>
                    <span className="text-[9px] font-bold">{DOW_CORTO[d.getDay()]}</span>
                    <span className="text-[15px] font-bold leading-none">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} aria-label="Semana siguiente"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-[#E7E7E0]">
              <ChevronRight size={16} className="text-[#3A3A34]" />
            </button>
          </div>

          {/* Huecos */}
          {loadingHuecos ? (
            <div className="flex justify-center py-8">
              <span className="w-5 h-5 border-2 border-[#D9D9D2] border-t-[#1A1A1A] rounded-full animate-spin" />
            </div>
          ) : (huecos && huecos.length > 0) ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {huecos.map(h => (
                <button key={h.inicio} onClick={() => { setBooking(h); setResultado(null); }}
                  className="py-2.5 rounded-xl text-sm font-bold border bg-white text-[#1A1A1A] hover:border-[#1A1A1A] transition-colors"
                  style={{ borderColor: '#E7E7E0' }}>
                  {fmtHora(h.inicio)}
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl flex flex-col items-center py-10 gap-2 text-center shadow-sm" style={{ border: '1px solid #F1F3F5' }}>
              <Calendar size={22} className="text-[#C6C6BE]" />
              <p className="text-[#8E8E86] text-sm">Sin huecos este día. Prueba otro.</p>
            </div>
          )}
        </div>
      )}

      {/* Hoja de confirmación */}
      <PublicSheet
        open={!!(booking && servicio)}
        onClose={cerrarSheet}
        label={resultado && 'ok' in resultado ? 'Cita reservada' : 'Confirmar cita'}
        sheetClassName="bg-white w-full max-w-sm rounded-3xl p-6 relative shadow-2xl"
      >
        {booking && servicio && (
          <>
            <button onClick={cerrarSheet} aria-label="Cerrar" className="absolute top-4 right-4 text-[#767670] hover:text-[#3A3A34]">
              <X size={18} />
            </button>

            {resultado && 'ok' in resultado ? (
              <div className="flex flex-col items-center text-center gap-4 py-2">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 size={30} style={{ color: '#059669' }} />
                </div>
                <div>
                  <p className="text-[#1A1A1A] font-extrabold text-xl">¡Cita reservada!</p>
                  <p className="text-[#8E8E86] text-sm mt-1 capitalize">{fmtDiaLargo(booking.inicio)} · {fmtHora(booking.inicio)}</p>
                </div>
                <button onClick={cerrarSheet} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ backgroundColor: primary }}>
                  Hecho
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-[#1A1A1A] font-bold text-lg mb-4">Confirmar cita</h2>
                <div className="rounded-2xl p-4 mb-4 bg-[#F5F5F1] border border-[#E7E7E0] space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: servicio.color ?? primary }} />
                    <p className="text-[#1A1A1A] font-bold">{servicio.nombre}</p>
                  </div>
                  <p className="text-[#8E8E86] text-sm capitalize">{fmtDiaLargo(booking.inicio)}</p>
                  <p className="text-[#8E8E86] text-sm">{fmtHora(booking.inicio)} – {fmtHora(booking.fin)} · {servicio.duracionMin} min</p>
                  {servicio.precio != null && <p className="text-[#8E8E86] text-sm">{servicio.precio} €</p>}
                </div>
                {resultado && 'error' in resultado && (
                  <div className="mb-3 px-4 py-3 rounded-xl text-sm text-rose-600 bg-rose-50 border border-rose-200">{resultado.error}</div>
                )}
                {!autenticada && (
                  <p className="text-[#8E8E86] text-xs mb-3">Necesitas acceder con tu email para reservar.</p>
                )}
                <button onClick={confirmar} disabled={enviando}
                  className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:opacity-50"
                  style={{ backgroundColor: primary }}>
                  {enviando ? 'Reservando…' : autenticada ? 'Confirmar cita' : 'Acceder para reservar'}
                </button>
              </>
            )}
          </>
        )}
      </PublicSheet>
    </div>
  );
}
