'use client';
import { queImparten } from '@/lib/equipo';

import { useEffect, useMemo, useState } from 'react';
import { useAhora } from '@/lib/use-ahora';
import { Clock, ChevronLeft, ChevronRight, X, CheckCircle2, Calendar, User } from 'lucide-react';
import type { ServicioCita, DisponibilidadCita, Instructor } from '@/lib/types';
import { PublicSheet } from '@/components/ui/public-sheet';
import { serif, cq, radius, shadow } from '@/lib/reservar-publico-tokens';

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
  onCancelar: (citaId: string) => void | Promise<{ ok: true } | { ok: false; error: string }>;
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
  // El reloj se lee del estado, no durante el render: leerlo en render es
  // impuro (dos lecturas del mismo render pueden diferir, y React puede
  // descartar y repetir un render) y daba una identidad nueva cada vez.
  const { ahora } = useAhora(new Date());
  const [servicioId, setServicioId] = useState<string | null>(servicios.length === 1 ? servicios[0].id : null);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = useState<Date>(hoy);
  const [selectedDay, setSelectedDay] = useState<string>(localDate(hoy));
  const [huecos, setHuecos] = useState<Hueco[] | null>(null);
  const [loadingHuecos, setLoadingHuecos] = useState(false);
  const [booking, setBooking] = useState<Hueco | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true } | { error: string } | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);

  const servicio = servicios.find(s => s.id === servicioId) ?? null;

  // Instructoras que aceptan citas (tienen horario fino definido).
  const instructorasDisponibles = useMemo(
    () => queImparten(instructores).filter(i => disponibilidad.some(d => d.instructorId === i.id)),
    [instructores, disponibilidad],
  );

  const semana = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const base = new Date(weekAnchor);
    const lunes = addDays(base, -((base.getDay() + 6) % 7)); // lunes de la semana del anchor
    return addDays(lunes, i);
  }), [weekAnchor]);

  // Carga de huecos cuando hay servicio + instructora + día.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga asíncrona con bandera de cancelación. El estado llega de la red, no se puede derivar en render.
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
    .filter(c => c.estado !== 'CANCELADA' && new Date(c.fin).getTime() > ahora.getTime())
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  if (servicios.length === 0) {
    return (
      <div className="bg-white rounded-2xl flex flex-col items-center py-16 gap-3 text-center shadow-sm">
        <Clock size={28} className="text-[var(--portal-micro)]" />
        <p className="text-muted-foreground font-medium">Este estudio aún no ofrece citas reservables online</p>
        <p className="text-[#B0B0A8] text-sm max-w-xs">Escríbeles para reservar una sesión individual.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Mis próximas citas */}
      {citasFuturas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-foreground font-bold text-base px-1">Mis próximas citas</h2>
          {errorCancelar && (
            <p role="alert" className="mx-1 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span className="font-semibold">La cita sigue en pie.</span> {errorCancelar}
            </p>
          )}
          {citasFuturas.map(c => (
            <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3" style={{ border: '1px solid #F1F3F5' }}>
              <div className="min-w-0">
                <p className="font-bold text-foreground text-sm">{c.servicioNombre}</p>
                <p className="text-muted-foreground text-xs mt-0.5 capitalize">{fmtDiaLargo(c.inicio)} · {fmtHora(c.inicio)}</p>
                <p className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1"><User size={11} />{c.instructorNombre}</p>
              </div>
              <button
                onClick={async () => {
                  if (cancelandoId) return;
                  setCancelandoId(c.id);
                  setErrorCancelar(null);
                  try {
                    const r = await onCancelar(c.id);
                    if (r && !r.ok) setErrorCancelar(r.error);
                  } finally {
                    setCancelandoId(null);
                  }
                }}
                disabled={cancelandoId === c.id}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-destructive bg-destructive/10 hover:bg-destructive/10 border border-destructive/30 transition-colors disabled:opacity-60">
                <X size={12} />{cancelandoId === c.id ? 'Cancelando…' : 'Cancelar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 1) Servicio */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-1">1 · Elige el servicio</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {servicios.map(s => {
            const sel = s.id === servicioId;
            return (
              <button key={s.id}
                onClick={() => { setServicioId(s.id); setInstructorId(null); setHuecos(null); }}
                style={{
                  textAlign: 'left', borderRadius: radius.card, padding: `${cq(20, 2.2, 26)} ${cq(20, 2.6, 30)}`,
                  border: `1.5px solid ${sel ? primary : 'transparent'}`, background: 'var(--portal-surface)',
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, cursor: 'pointer',
                  boxShadow: shadow.card, transition: 'border-color .35s ease, transform .5s cubic-bezier(.16,1,.3,1)',
                }}>
                <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                  <div style={{ fontFamily: serif, fontSize: cq(21, 2.2, 27), lineHeight: 1.05, color: 'var(--portal-ink)' }}>{s.nombre}</div>
                  {s.descripcion && <p style={{ fontSize: 11.5, color: 'var(--portal-muted-2)', marginTop: 8 }}>{s.descripcion}</p>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--portal-muted)', whiteSpace: 'nowrap' }}>{s.duracionMin} min</div>
                {s.precio != null && <div style={{ fontFamily: serif, fontSize: cq(21, 2.2, 27), whiteSpace: 'nowrap', color: 'var(--portal-ink)' }}>{s.precio} €</div>}
                {sel && <CheckCircle2 size={18} style={{ color: primary, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2) Instructora */}
      {servicioId && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-1">2 · Elige con quién</p>
          {instructorasDisponibles.length === 0 ? (
            <p className="text-muted-foreground text-sm px-1">No hay instructoras con horario de citas configurado.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {instructorasDisponibles.map(i => {
                const sel = i.id === instructorId;
                return (
                  <button key={i.id} onClick={() => { setInstructorId(i.id); setResultado(null); }}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition-all"
                    style={sel
                      ? { backgroundColor: primary, color: primaryFg, borderColor: primary }
                      : { backgroundColor: 'white', color: 'var(--portal-ink)', borderColor: 'var(--border)' }}>
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
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-1">3 · Elige el hueco</p>

          {/* Semana */}
          <div className="flex items-center justify-between">
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} aria-label="Semana anterior"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-border">
              <ChevronLeft size={16} className="text-[var(--portal-ink)]" />
            </button>
            <div className="flex gap-1.5 flex-1 justify-center px-2">
              {semana.map(d => {
                const key = localDate(d);
                const sel = key === selectedDay;
                const pasado = localDate(d) < localDate(hoy);
                return (
                  <button key={key} disabled={pasado} onClick={() => setSelectedDay(key)}
                    className="flex flex-col items-center gap-1 px-2 py-2 transition-all disabled:opacity-30"
                    style={{
                      borderRadius: radius.hour, border: 'none',
                      ...(sel
                        ? { backgroundColor: primary, color: primaryFg }
                        : { backgroundColor: 'var(--portal-surface)', color: 'var(--portal-ink)' }),
                    }}>
                    <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '.1em' }}>{DOW_CORTO[d.getDay()]}</span>
                    <span style={{ fontFamily: serif, fontSize: 17, lineHeight: 1 }}>{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} aria-label="Semana siguiente"
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-border">
              <ChevronRight size={16} className="text-[var(--portal-ink)]" />
            </button>
          </div>

          {/* Huecos */}
          {loadingHuecos ? (
            <div className="flex justify-center py-8">
              <span className="w-5 h-5 border-2 border-[var(--portal-line)] border-t-[var(--portal-ink)] rounded-full animate-spin" />
            </div>
          ) : (huecos && huecos.length > 0) ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 10 }}>
              {huecos.map(h => (
                <button key={h.inicio} onClick={() => { setBooking(h); setResultado(null); }}
                  style={{
                    height: 54, borderRadius: radius.hour, background: 'var(--portal-surface)', border: '1.5px solid transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500,
                    color: 'var(--portal-ink)', cursor: 'pointer', transition: 'border-color .3s ease, transform .4s cubic-bezier(.16,1,.3,1)',
                  }}>
                  {fmtHora(h.inicio)}
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl flex flex-col items-center py-10 gap-2 text-center shadow-sm" style={{ border: '1px solid #F1F3F5' }}>
              <Calendar size={22} className="text-[var(--portal-micro)]" />
              <p className="text-muted-foreground text-sm">Sin huecos este día. Prueba otro.</p>
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
            <button onClick={cerrarSheet} aria-label="Cerrar" className="absolute top-4 right-4 text-[var(--portal-muted)] hover:text-[var(--portal-ink)]">
              <X size={18} />
            </button>

            {resultado && 'ok' in resultado ? (
              <div className="flex flex-col items-center text-center gap-4 py-2">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, var(--card))' }}>
                  <CheckCircle2 size={30} style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="text-foreground font-extrabold text-xl">¡Cita reservada!</p>
                  <p className="text-muted-foreground text-sm mt-1 capitalize">{fmtDiaLargo(booking.inicio)} · {fmtHora(booking.inicio)}</p>
                </div>
                <button onClick={cerrarSheet} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ backgroundColor: primary }}>
                  Hecho
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-foreground font-bold text-lg mb-4">Confirmar cita</h2>
                <div className="rounded-2xl p-4 mb-4 bg-[var(--portal-surface-2)] border border-border space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: servicio.color ?? primary }} />
                    <p className="text-foreground font-bold">{servicio.nombre}</p>
                  </div>
                  <p className="text-muted-foreground text-sm capitalize">{fmtDiaLargo(booking.inicio)}</p>
                  <p className="text-muted-foreground text-sm">{fmtHora(booking.inicio)} – {fmtHora(booking.fin)} · {servicio.duracionMin} min</p>
                  {servicio.precio != null && <p className="text-muted-foreground text-sm">{servicio.precio} €</p>}
                </div>
                {resultado && 'error' in resultado && (
                  <div className="mb-3 px-4 py-3 rounded-xl text-sm text-destructive bg-destructive/10 border border-destructive/30">{resultado.error}</div>
                )}
                {!autenticada && (
                  <p className="text-muted-foreground text-xs mb-3">Necesitas acceder con tu email para reservar.</p>
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
