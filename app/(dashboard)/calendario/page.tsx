'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useStudio } from '@/lib/studio-context';
import type { ReservaEnriquecida } from '@/lib/types';
import { SpotMap } from '@/components/spots/spot-map';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronLeft, ChevronRight, Plus, X, AlertTriangle, RefreshCw,
  Search, CalendarDays, CheckCircle2, TrendingUp, ChevronDown,
  Clock, MapPin, Users, UserPlus, Pencil, Trash2, ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Socio, Spot } from '@/lib/types';

// ─── Utility helpers ──────────────────────────────────────────────────────────

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function weekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function localDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function toISO(fecha: string, hora: string) {
  return new Date(`${fecha}T${hora}:00`).toISOString();
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return `rgba(200,200,200,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDark(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors';
const selectCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors appearance-none';

// ─── SesionEnriquecida local type ─────────────────────────────────────────────

interface SesionEnr {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
  aforoMaximo: number;
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  notas: string | null;
  precioPuntual: number | null;
  tipoClase: { nombre: string; color: string };
  sala: { nombre: string };
  instructor: { nombre: string };
  confirmadas: number;
  asistidas: number;
  reservadoIds: string[];
}

// ─── FormData ─────────────────────────────────────────────────────────────────

type FormData = {
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  aforoMaximo: number;
  notas: string;
  repetir: boolean;
  repetirSemanas: number;
};

// ─── RecurringFormData ────────────────────────────────────────────────────────

type RecurringFormData = {
  tipoClaseId: string;
  instructorId: string;
  salaId: string;
  horaInicio: string;
  duracion: 45 | 60 | 90;
  diasSemana: number[];
  fechaInicio: string;
  fechaFin: string;
  aforoMaximo: number;
};

// ─── FormField wrapper ────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

// ─── DiaPill ─────────────────────────────────────────────────────────────────

function DiaPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-9 h-9 rounded-full text-[12px] font-bold transition-colors',
        active ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground hover:bg-border'
      )}
    >
      {label}
    </button>
  );
}

const DIA_PILLS: { label: string; day: number }[] = [
  { label: 'L', day: 1 }, { label: 'M', day: 2 }, { label: 'X', day: 3 },
  { label: 'J', day: 4 }, { label: 'V', day: 5 }, { label: 'S', day: 6 }, { label: 'D', day: 0 },
];

// ─── StatsBar ────────────────────────────────────────────────────────────────

function ocupColorFor(ratio: number) {
  if (ratio >= 1) return '#E23B4E';
  if (ratio >= 0.85) return '#E0733E';
  if (ratio >= 0.6) return '#C98A2E';
  return '#3E9E6B';
}

function StatsBar({ sesiones, todayStr }: {
  sesiones: SesionEnr[];
  todayStr: string;
}) {
  const hoy = sesiones.filter(s => !s.cancelada && localDate(s.inicio) === todayStr);
  const aforo = hoy.reduce((acc, s) => acc + s.aforoMaximo, 0);
  const reservas = hoy.reduce((acc, s) => acc + s.confirmadas, 0);
  const libres = Math.max(0, aforo - reservas);
  const ocupPct = aforo > 0 ? Math.round((reservas / aforo) * 100) : 0;
  const ocupColor = ocupColorFor(ocupPct / 100);
  const ocupLabel = ocupPct >= 85 ? 'Muy ocupado' : ocupPct >= 60 ? 'Buen ritmo' : 'Tranquilo';

  return (
    <div className="flex gap-3 flex-wrap sm:flex-nowrap">
      <div className="flex-1 min-w-[130px] bg-muted/60 border border-border rounded-2xl px-4 py-3.5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Clases hoy</div>
        <div className="text-[26px] font-extrabold text-foreground leading-none tabular-nums mt-1.5">{hoy.length}</div>
      </div>
      <div className="flex-1 min-w-[130px] bg-muted/60 border border-border rounded-2xl px-4 py-3.5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Ocupación media</div>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="text-[26px] font-extrabold leading-none tabular-nums" style={{ color: ocupColor }}>{ocupPct}%</span>
          <span className="text-xs font-bold" style={{ color: ocupColor }}>{ocupLabel}</span>
        </div>
      </div>
      <div className="flex-1 min-w-[130px] bg-muted/60 border border-border rounded-2xl px-4 py-3.5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Reservas hoy</div>
        <div className="flex items-baseline gap-1.5 mt-1.5">
          <span className="text-[26px] font-extrabold text-foreground leading-none tabular-nums">{reservas}</span>
          <span className="text-sm font-bold text-muted-foreground">/ {aforo}</span>
        </div>
      </div>
      <div className="flex-1 min-w-[130px] bg-muted/60 border border-border rounded-2xl px-4 py-3.5">
        <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Plazas libres</div>
        <div className="text-[26px] font-extrabold text-foreground leading-none tabular-nums mt-1.5">{libres}</div>
      </div>
    </div>
  );
}

// ─── FilterBar ───────────────────────────────────────────────────────────────

function FilterBar({ instructores, salas, filtroInstructor, filtroSala, onInstructor, onSala, busqueda, onBusqueda }: {
  instructores: { id: string; nombre: string }[];
  salas: { id: string; nombre: string }[];
  filtroInstructor: string; filtroSala: string;
  onInstructor: (v: string) => void; onSala: (v: string) => void;
  busqueda: string; onBusqueda: (v: string) => void;
}) {
  const hayFiltros = filtroInstructor || filtroSala || busqueda;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[160px] max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full rounded-xl border border-border bg-card pl-8 pr-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors placeholder:text-muted-foreground"
          placeholder="Buscar clase..."
          value={busqueda}
          onChange={e => onBusqueda(e.target.value)}
        />
      </div>
      <select
        className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none appearance-none cursor-pointer"
        value={filtroInstructor}
        onChange={e => onInstructor(e.target.value)}
      >
        <option value="">Todas las instructoras</option>
        {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
      </select>
      <select
        className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none appearance-none cursor-pointer"
        value={filtroSala}
        onChange={e => onSala(e.target.value)}
      >
        <option value="">Todas las salas</option>
        {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      {hayFiltros && (
        <button
          onClick={() => { onInstructor(''); onSala(''); onBusqueda(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          <X size={12} />Limpiar
        </button>
      )}
    </div>
  );
}

// ─── SessionSidebar ───────────────────────────────────────────────────────────

function SessionSidebar({
  sesion,
  reservas,
  socios,
  spots,
  onClose,
  onCheckin,
  onCancelarReserva,
  onAddReserva,
  onOpenEdit,
  onCancelarSesion,
  onEliminarSesion,
  onLiberarSpot,
  onAsignarSpot,
}: {
  sesion: SesionEnr | null;
  reservas: ReservaEnriquecida[];
  socios: Socio[];
  spots: Spot[];
  onClose: () => void;
  onCheckin: (reservaId: string) => void;
  onCancelarReserva: (reservaId: string) => void;
  onAddReserva: (sesionId: string, socioId: string) => void;
  onOpenEdit: () => void;
  onCancelarSesion: () => void;
  onEliminarSesion: () => void;
  onLiberarSpot: (reservaId: string) => void;
  onAsignarSpot: (sesionId: string, socioId: string, spotId: string) => void;
}) {
  const { studio } = useStudio();
  const [buscarSocia, setBuscarSocia] = useState('');
  const [showAnadir, setShowAnadir] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'cancelar' | 'eliminar' | null>(null);
  const [activeTab, setActiveTab] = useState<'asistentes' | 'mapa'>('asistentes');

  const sociosEnClase = new Set(reservas.filter(r => r.estado !== 'CANCELADA').map(r => r.socioId));
  const sociosDisponibles = socios.filter(
    s => s.activo && !sociosEnClase.has(s.id) &&
    (buscarSocia === '' || `${s.nombre} ${s.apellidos}`.toLowerCase().includes(buscarSocia.toLowerCase()))
  );

  if (!sesion) return null;

  const pct = sesion.aforoMaximo > 0 ? Math.round((sesion.confirmadas / sesion.aforoMaximo) * 100) : 0;
  const barColor = pct >= 100 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#10B981';
  const dark = isDark(sesion.tipoClase.color);
  const fechaLabel = new Date(sesion.inicio).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const spotsActuales = spots.filter(sp => sp.salaId === sesion.salaId);

  return (
    <div className="relative w-full lg:w-[400px] shrink-0 bg-card flex flex-col h-full overflow-hidden shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)]">
      {/* Header with class color accent */}
      <div className="h-2" style={{ backgroundColor: sesion.tipoClase.color }} />
      <div className="px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span
            className="inline-block text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={{ color: sesion.tipoClase.color, backgroundColor: hexToRgba(sesion.tipoClase.color, 0.14) }}
          >
            {sesion.tipoClase.nombre}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>
        <h2 className="text-base font-bold text-foreground leading-tight mb-1">{sesion.tipoClase.nombre}</h2>

        <p className="text-xs font-semibold text-muted-foreground capitalize mb-3">{fechaLabel}</p>

        <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <Clock size={12} />
            {formatHora(sesion.inicio)} – {formatHora(sesion.fin)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={12} />
            {sesion.sala.nombre}
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={12} />
            {sesion.instructor.nombre}
          </span>
        </div>

        {/* Occupancy bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-muted-foreground">Ocupación</span>
            <span style={{ color: barColor }}>{pct}% · {sesion.confirmadas}/{sesion.aforoMaximo}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-5 py-2.5 border-b border-border flex items-center gap-2">
        <button
          onClick={onOpenEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors"
        >
          <Pencil size={12} />Editar
        </button>
        <button
          onClick={() => setShowConfirm('cancelar')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:bg-muted transition-colors"
        >
          <X size={12} />Cancelar
        </button>
        <button
          onClick={() => setShowConfirm('eliminar')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 transition-colors ml-auto"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Confirm overlay */}
      {showConfirm && (
        <div className="absolute inset-0 bg-card z-30 flex flex-col items-center justify-center gap-5 p-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: showConfirm === 'eliminar' ? '#FEE2E2' : '#FEF3C7' }}
          >
            <AlertTriangle size={24} color={showConfirm === 'eliminar' ? '#EF4444' : '#D97706'} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground mb-1">
              {showConfirm === 'eliminar' ? '¿Eliminar clase?' : '¿Cancelar clase?'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {showConfirm === 'eliminar'
                ? 'Se eliminará la clase y todas las reservas. Esta acción no se puede deshacer.'
                : 'La clase quedará marcada como cancelada. Las socias serán notificadas.'}
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setShowConfirm(null)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted"
            >
              Volver
            </button>
            <button
              onClick={() => { showConfirm === 'eliminar' ? onEliminarSesion() : onCancelarSesion(); setShowConfirm(null); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: showConfirm === 'eliminar' ? '#EF4444' : '#D97706' }}
            >
              {showConfirm === 'eliminar' ? 'Eliminar' : 'Cancelar clase'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border px-5 pt-2">
        {(['asistentes', 'mapa'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'pb-2 mr-5 text-xs font-bold border-b-2 transition-colors capitalize',
              activeTab === tab
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-muted-foreground'
            )}
          >
            {tab === 'asistentes' ? `Asistentes (${reservas.filter(r => r.estado !== 'LISTA_ESPERA' && r.estado !== 'CANCELADA').length})` : 'Mapa'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'asistentes' ? (
          <div className="p-4 space-y-1">
            {/* Add attendee */}
            {!showAnadir ? (
              <button
                onClick={() => setShowAnadir(true)}
                className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-border text-xs font-bold text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors mb-3"
              >
                <UserPlus size={13} />Añadir socia a la clase
              </button>
            ) : (
              <div className="mb-3 space-y-2">
                <input
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground"
                  placeholder="Buscar socia..."
                  value={buscarSocia}
                  onChange={e => setBuscarSocia(e.target.value)}
                  autoFocus
                />
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {sociosDisponibles.slice(0, 8).map(s => (
                    <button
                      key={s.id}
                      onClick={() => { onAddReserva(sesion.id, s.id); setShowAnadir(false); setBuscarSocia(''); }}
                      className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 10%, var(--card))', color: 'var(--brand)' }}>
                        {s.nombre[0]}{s.apellidos[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{s.nombre} {s.apellidos}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                      </div>
                    </button>
                  ))}
                  {sociosDisponibles.length === 0 && (
                    <p className="text-xs text-center py-3 text-muted-foreground">No hay socias disponibles</p>
                  )}
                </div>
                <button
                  onClick={() => { setShowAnadir(false); setBuscarSocia(''); }}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Attendee list */}
            {reservas.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">Sin asistentes aún</p>
              </div>
            ) : (
              reservas
                .filter(r => r.estado !== 'CANCELADA')
                .map(r => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl hover:bg-muted group transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={
                        r.estado === 'ASISTIDA'
                          ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                          : r.estado === 'LISTA_ESPERA'
                          ? { backgroundColor: '#FEF3C7', color: '#92400E' }
                          : { backgroundColor: 'color-mix(in srgb, var(--brand) 10%, var(--card))', color: 'var(--brand)' }
                      }
                    >
                      {r.socio?.nombre[0]}{r.socio?.apellidos[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{r.socio?.nombre} {r.socio?.apellidos}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.estado === 'LISTA_ESPERA'
                          ? `Espera #${r.posicionEspera}`
                          : r.estado === 'ASISTIDA'
                          ? 'Asistida'
                          : 'Confirmada'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {r.estado === 'CONFIRMADA' && (
                        <button
                          onClick={() => onCheckin(r.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors"
                          style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}
                        >
                          <CheckCircle2 size={11} />Check-in
                        </button>
                      )}
                      {r.estado === 'ASISTIDA' && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold" style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
                          <CheckCircle2 size={11} />OK
                        </span>
                      )}
                      <button
                        onClick={() => onCancelarReserva(r.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        ) : (
          <div className="p-4">
            {spotsActuales.length > 0 ? (
              <SpotMap
                spots={spotsActuales}
                reservas={reservas}
                socios={socios}
                onCheckin={id => onCheckin(id)}
                onQuitarSpot={id => onLiberarSpot(id)}
                onAsignarSpot={(spotId, socioId) => onAsignarSpot(sesion.id, socioId, spotId)}
              />
            ) : (
              <div className="flex items-center justify-center h-32 rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground">
                Sala sin mapa de spots
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: kiosk link */}
      <div className="px-5 py-3 border-t border-border">
        <a
          href={`/kiosk/${studio?.slug ?? 'tentare'}`}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpRight size={13} />Ver en modo kiosk
        </a>
      </div>
    </div>
  );
}

// ─── ModalClasesRecurrentes ───────────────────────────────────────────────────

function ModalClasesRecurrentes({
  open, onClose, tiposClase, instructores, salas, onCrear,
}: {
  open: boolean;
  onClose: () => void;
  tiposClase: { id: string; nombre: string }[];
  instructores: { id: string; nombre: string }[];
  salas: { id: string; nombre: string }[];
  onCrear: (sesiones: Omit<import('@/lib/types').Sesion, 'id' | 'studioId'>[]) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const inOneMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const emptyForm = (): RecurringFormData => ({
    tipoClaseId: tiposClase[0]?.id ?? '',
    instructorId: instructores[0]?.id ?? '',
    salaId: salas[0]?.id ?? '',
    horaInicio: '10:00',
    duracion: 60,
    diasSemana: [1, 3],
    fechaInicio: today,
    fechaFin: inOneMonth,
    aforoMaximo: 8,
  });

  const [form, setForm] = useState<RecurringFormData>(emptyForm);

  useEffect(() => {
    if (open) setForm(emptyForm());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleDia(day: number) {
    setForm(f => ({
      ...f,
      diasSemana: f.diasSemana.includes(day)
        ? f.diasSemana.filter(d => d !== day)
        : [...f.diasSemana, day],
    }));
  }

  const estimatedCount = (() => {
    if (!form.fechaInicio || !form.fechaFin || form.diasSemana.length === 0) return 0;
    const start = new Date(form.fechaInicio + 'T00:00:00');
    const end = new Date(form.fechaFin + 'T00:00:00');
    if (start > end) return 0;
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (form.diasSemana.includes(cursor.getDay())) count++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  })();

  function handleSubmit() {
    if (form.diasSemana.length === 0) return;
    const start = new Date(form.fechaInicio + 'T00:00:00');
    const end = new Date(form.fechaFin + 'T00:00:00');
    if (start > end) return;

    const sesionesFields: Omit<import('@/lib/types').Sesion, 'id' | 'studioId'>[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      if (form.diasSemana.includes(cursor.getDay())) {
        const dateStr = cursor.toISOString().slice(0, 10);
        const inicioISO = `${dateStr}T${form.horaInicio}:00`;
        const finDate = new Date(inicioISO);
        finDate.setMinutes(finDate.getMinutes() + form.duracion);
        sesionesFields.push({
          tipoClaseId: form.tipoClaseId,
          instructorId: form.instructorId,
          salaId: form.salaId,
          inicio: inicioISO,
          fin: finDate.toISOString().slice(0, 19),
          aforoMaximo: form.aforoMaximo,
          cancelada: false,
          notas: null,
          precioPuntual: null,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    onCrear(sesionesFields);
  }

  const f2 = 'w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-foreground focus:outline-none text-foreground';
  const s2 = 'w-full border border-border rounded-xl px-3.5 py-2.5 text-sm focus:border-foreground focus:outline-none text-foreground bg-card appearance-none';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">Crear clases recurrentes</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">Genera múltiples sesiones de una vez</p>
        </DialogHeader>
        <div className="space-y-4 mt-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Tipo de clase</label>
            <select className={s2} value={form.tipoClaseId} onChange={e => setForm(f => ({ ...f, tipoClaseId: e.target.value }))}>
              {tiposClase.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Instructora</label>
            <select className={s2} value={form.instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
              {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Sala</label>
            <select className={s2} value={form.salaId} onChange={e => setForm(f => ({ ...f, salaId: e.target.value }))}>
              {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Hora inicio</label>
              <input type="time" className={f2} value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Duración</label>
              <select className={s2} value={form.duracion} onChange={e => setForm(f => ({ ...f, duracion: Number(e.target.value) as 45 | 60 | 90 }))}>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Días de la semana</label>
            <div className="flex items-center gap-2 flex-wrap">
              {DIA_PILLS.map(({ label, day }) => (
                <DiaPill key={day} label={label} active={form.diasSemana.includes(day)} onClick={() => toggleDia(day)} />
              ))}
            </div>
            {form.diasSemana.length === 0 && <p className="text-xs text-red-500">Selecciona al menos un día</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Fecha inicio</label>
              <input type="date" className={f2} value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">Fecha fin</label>
              <input type="date" className={f2} value={form.fechaFin} onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wider">Aforo máximo</label>
            <input type="number" min={1} max={50} className={f2} value={form.aforoMaximo} onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value) }))} />
          </div>
          {estimatedCount > 0 && (
            <div className="rounded-xl bg-muted px-4 py-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold text-foreground">Se crearán <span className="font-bold">{estimatedCount}</span> clases</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={form.diasSemana.length === 0 || estimatedCount === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-brand text-brand-foreground hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {estimatedCount > 0 ? `Crear ${estimatedCount} clases` : 'Crear clases'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Week time-grid view ──────────────────────────────────────────────────────

const HOUR_HEIGHT = 60; // px per hour
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

type LayoutedSesion = SesionEnr & { col: number; cols: number };

function layoutDay(items: SesionEnr[]): LayoutedSesion[] {
  const sorted = [...items].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const active: { end: string; col: number }[] = [];
  const placed: (SesionEnr & { col: number })[] = [];
  let maxCols = 1;
  for (const s of sorted) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].end <= s.inicio) active.splice(i, 1);
    }
    const usedCols = new Set(active.map(a => a.col));
    let col = 0;
    while (usedCols.has(col)) col++;
    active.push({ end: s.fin, col });
    placed.push({ ...s, col });
    maxCols = Math.max(maxCols, active.length);
  }
  return placed.map(p => ({ ...p, cols: maxCols }));
}

function minutesFromRangeStart(iso: string, startHour: number) {
  const d = new Date(iso);
  return (d.getHours() * 60 + d.getMinutes()) - startHour * 60;
}

function SessionBlock({ s, isSelected, onClick, startHour }: {
  s: LayoutedSesion; isSelected: boolean; onClick: (id: string) => void; startHour: number;
}) {
  const startMin = minutesFromRangeStart(s.inicio, startHour);
  const durMin = Math.max(20, (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 60000);
  const libres = s.aforoMaximo - s.confirmadas;
  const isFull = libres <= 0;
  const ratio = s.aforoMaximo > 0 ? s.confirmadas / s.aforoMaximo : 0;
  const occColor = ocupColorFor(ratio);
  const showCap = durMin >= 45;

  return (
    <button
      onClick={() => onClick(s.id)}
      className={cn(
        'absolute rounded-[10px] pl-2.5 pr-2 py-1.5 text-left overflow-hidden transition-shadow z-10 flex flex-col shadow-[0_1px_4px_rgba(0,0,0,0.06)]',
        isSelected ? 'ring-2 ring-foreground shadow-md' : 'hover:shadow-md',
        s.cancelada && 'opacity-45 line-through',
      )}
      style={{
        top: `${(startMin / 60) * HOUR_HEIGHT + 1}px`,
        height: `${Math.max(20, (durMin / 60) * HOUR_HEIGHT - 2)}px`,
        left: `calc(${(s.col / s.cols) * 100}% + 2px)`,
        width: `calc(${100 / s.cols}% - 4px)`,
        backgroundColor: hexToRgba(s.tipoClase.color, 0.14),
        borderLeft: `3px solid ${s.tipoClase.color}`,
        color: 'var(--foreground)',
      }}
      title={`${s.tipoClase.nombre} · ${formatHora(s.inicio)}–${formatHora(s.fin)} · ${s.instructor.nombre}`}
    >
      <p className="text-[11.5px] font-extrabold leading-tight truncate">{s.tipoClase.nombre}</p>
      <p className="text-[10px] leading-tight truncate mt-0.5 text-muted-foreground">{formatHora(s.inicio)} · {s.instructor.nombre}</p>
      {showCap && (
        <div className="mt-auto pt-1 flex items-center gap-1.5">
          <div className="flex-1 h-[5px] rounded-full bg-black/[0.08] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: occColor }} />
          </div>
          <span className="text-[10px] font-extrabold shrink-0" style={{ color: occColor }}>
            {isFull ? 'Lleno' : `${s.confirmadas}/${s.aforoMaximo}`}
          </span>
        </div>
      )}
    </button>
  );
}

function CurrentTimeLine({ startHour, endHour }: { startHour: number; endHour: number }) {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    function update() {
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes() - startHour * 60;
      const total = (endHour - startHour) * 60;
      if (mins < 0 || mins > total) { setTop(null); return; }
      setTop((mins / 60) * HOUR_HEIGHT);
    }
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, [startHour, endHour]);

  if (top === null) return null;
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="flex items-center">
        <span className="w-2 h-2 rounded-full bg-[#DC2626] -ml-1 shrink-0" />
        <div className="flex-1 h-px bg-[#DC2626]" />
      </div>
    </div>
  );
}

function WeekGrid({
  dias, sesiones, todayStr, selectedId, onSesionClick, onSlotClick, mobileDia,
}: {
  dias: Date[];
  sesiones: SesionEnr[];
  todayStr: string;
  selectedId: string | null;
  onSesionClick: (id: string) => void;
  onSlotClick: (fecha: string, hora: string) => void;
  mobileDia: string;
}) {
  const { startHour, endHour } = useMemo(() => {
    let min = 9, max = 20;
    sesiones.forEach(s => {
      const ini = new Date(s.inicio);
      const fin = new Date(s.fin);
      const iniH = ini.getHours();
      const finH = fin.getHours() + (fin.getMinutes() > 0 ? 1 : 0);
      if (iniH < min) min = iniH;
      if (finH > max) max = finH;
    });
    return { startHour: Math.max(0, min - 1), endHour: Math.min(24, max + 1) };
  }, [sesiones]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;

  function handleColClick(e: React.MouseEvent<HTMLDivElement>, str: string) {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawMinutes = (y / HOUR_HEIGHT) * 60 + startHour * 60;
    const rounded = Math.round(rawMinutes / 30) * 30;
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    onSlotClick(str, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  if (sesiones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 mx-6 mb-6 rounded-2xl border border-dashed border-border bg-card">
        <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
          <CalendarDays size={26} className="text-brand" />
        </div>
        <p className="text-[16px] font-bold text-foreground">No hay clases esta semana</p>
        <p className="text-[13px] text-[#94A3B8] mt-1 mb-5">Crea la primera clase para empezar a llenar el calendario</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Day header row */}
      <div className="flex border-b border-border shrink-0">
        <div className="w-12 shrink-0 lg:w-14" />
        {dias.map(d => {
          const str = localDate(d);
          const isToday = str === todayStr;
          return (
            <div
              key={str}
              className={cn(
                'flex-1 min-w-0 py-3 text-center border-l border-muted',
                str === mobileDia ? 'block' : 'hidden lg:block',
                isToday && 'bg-brand/[0.06]',
              )}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{DIAS_CORTOS[d.getDay()]}</p>
              <p className={cn(
                'text-[16px] font-extrabold mt-1.5 inline-flex items-center justify-center w-8 h-8 rounded-full',
                isToday ? 'bg-brand text-brand-foreground' : 'text-foreground',
              )}>
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex" style={{ height: `${totalHeight}px` }}>
          {/* Time axis */}
          <div className="w-12 lg:w-14 shrink-0 relative">
            {hours.map(h => (
              <div
                key={h}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] font-medium text-muted-foreground"
                style={{ top: `${(h - startHour) * HOUR_HEIGHT}px` }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dias.map(d => {
            const str = localDate(d);
            const isToday = str === todayStr;
            const items = layoutDay(sesiones.filter(s => localDate(s.inicio) === str));
            return (
              <div
                key={str}
                onClick={e => handleColClick(e, str)}
                className={cn(
                  'flex-1 min-w-0 relative border-l border-muted cursor-pointer',
                  isToday && 'bg-brand/[0.06]',
                  str === mobileDia ? 'block' : 'hidden lg:block',
                )}
              >
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-muted"
                    style={{ top: `${(h - startHour) * HOUR_HEIGHT}px` }}
                  />
                ))}
                {isToday && <CurrentTimeLine startHour={startHour} endHour={endHour} />}
                {items.map(s => (
                  <SessionBlock key={s.id} s={s} isSelected={s.id === selectedId} onClick={onSesionClick} startHour={startHour} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function Calendario() {
  const {
    sesiones, reservas, socios, spots, tiposClase, salas, instructores,
    addSesion, updateSesion, deleteSesion, addReserva, cancelarReserva, checkin, liberarSpot, asignarSpot,
  } = useStudio();

  // ── Hydration guard ─────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  const FALLBACK = new Date('2026-06-29');

  // ── Week state ────────────────────────────────────────────────────────────────
  const [semana, setSemana] = useState(() => weekStart(FALLBACK));

  useEffect(() => {
    const today = new Date();
    setMounted(true);
    setSemana(weekStart(today));
  }, []);

  const now = mounted ? new Date() : FALLBACK;

  // ── Selection ───────────────────────────────────────────────────────────────
  const [sesionId, setSesionId] = useState<string | null>(null);

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState<'nueva' | 'editar' | null>(null);
  const [showRecurrentes, setShowRecurrentes] = useState(false);
  const [showNuevaMenu, setShowNuevaMenu] = useState(false);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [filtroInstructor, setFiltroInstructor] = useState('');
  const [filtroSala, setFiltroSala] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Form ─────────────────────────────────────────────────────────────────────
  const emptyForm = useCallback((): FormData => ({
    tipoClaseId: tiposClase[0]?.id ?? '',
    salaId: salas[0]?.id ?? '',
    instructorId: instructores[0]?.id ?? '',
    fecha: localDate(now),
    horaInicio: '09:00',
    horaFin: '10:00',
    aforoMaximo: 8,
    notas: '',
    repetir: false,
    repetirSemanas: 4,
  }), [tiposClase, salas, instructores, now]);

  const [form, setForm] = useState<FormData>(() => emptyForm());

  // ── Derived data ─────────────────────────────────────────────────────────────
  const todayStr = localDate(now);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(semana, i)), [semana]);

  // ── Mobile: which day of the week is shown in the single-day grid ────────────
  const [mobileDia, setMobileDia] = useState(() => localDate(FALLBACK));
  useEffect(() => {
    const diasStr = dias.map(localDate);
    setMobileDia(diasStr.includes(todayStr) ? todayStr : diasStr[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semana]);

  const sesionesEnriquecidas = useMemo<SesionEnr[]>(() =>
    sesiones.map(s => ({
      ...s,
      tipoClase: tiposClase.find(t => t.id === s.tipoClaseId) ?? { nombre: '?', color: 'var(--muted-foreground)' },
      sala: salas.find(x => x.id === s.salaId) ?? { nombre: '?' },
      instructor: instructores.find(i => i.id === s.instructorId) ?? { nombre: '?' },
      confirmadas: reservas.filter(r => r.sesionId === s.id && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA')).length,
      asistidas: reservas.filter(r => r.sesionId === s.id && r.estado === 'ASISTIDA').length,
      reservadoIds: reservas.filter(r => r.sesionId === s.id && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA')).map(r => r.socioId),
    })),
    [sesiones, reservas, tiposClase, salas, instructores]
  );

  const sesionesFiltered = useMemo(() =>
    sesionesEnriquecidas.filter(s => {
      if (filtroInstructor && s.instructorId !== filtroInstructor) return false;
      if (filtroSala && s.salaId !== filtroSala) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        if (!s.tipoClase.nombre.toLowerCase().includes(q) &&
            !s.instructor.nombre.toLowerCase().includes(q) &&
            !s.sala.nombre.toLowerCase().includes(q)) return false;
      }
      return true;
    }),
    [sesionesEnriquecidas, filtroInstructor, filtroSala, busqueda]
  );

  const sesionActual = sesionesEnriquecidas.find(s => s.id === sesionId) ?? null;

  const reservasActuales = useMemo<ReservaEnriquecida[]>(() =>
    sesionActual
      ? reservas
          .filter(r => r.sesionId === sesionActual.id && r.estado !== 'CANCELADA')
          .map(r => ({
            ...r,
            socio: socios.find(s => s.id === r.socioId)!,
            spot: spots.find(sp => sp.id === r.spotId) ?? null,
          }))
      : [],
    [sesionActual, reservas, socios, spots]
  );

  // ── Calendar navigation ──────────────────────────────────────────────────────
  function cambiarSemana(delta: number) {
    setSemana(prev => addDays(prev, delta * 7));
  }

  function irAHoy() {
    setSemana(weekStart(new Date()));
  }

  // ── Session actions ──────────────────────────────────────────────────────────
  function openNueva(prefillFecha?: string) {
    setForm({ ...emptyForm(), fecha: prefillFecha ?? localDate(now) });
    setShowForm('nueva');
  }

  function openEdit() {
    if (!sesionActual) return;
    const ini = new Date(sesionActual.inicio);
    const fin = new Date(sesionActual.fin);
    setForm({
      tipoClaseId: sesionActual.tipoClaseId,
      salaId: sesionActual.salaId,
      instructorId: sesionActual.instructorId,
      fecha: localDate(ini),
      horaInicio: `${String(ini.getHours()).padStart(2, '0')}:${String(ini.getMinutes()).padStart(2, '0')}`,
      horaFin: `${String(fin.getHours()).padStart(2, '0')}:${String(fin.getMinutes()).padStart(2, '0')}`,
      aforoMaximo: sesionActual.aforoMaximo,
      notas: sesionActual.notas ?? '',
      repetir: false,
      repetirSemanas: 4,
    });
    setShowForm('editar');
  }

  function crearSesion() {
    const semanas = form.repetir ? form.repetirSemanas : 1;
    for (let i = 0; i < semanas; i++) {
      const base = new Date(`${form.fecha}T${form.horaInicio}:00`);
      base.setDate(base.getDate() + i * 7);
      addSesion({
        tipoClaseId: form.tipoClaseId,
        salaId: form.salaId,
        instructorId: form.instructorId,
        inicio: toISO(localDate(base), form.horaInicio),
        fin: toISO(localDate(base), form.horaFin),
        aforoMaximo: form.aforoMaximo,
        cancelada: false,
        notas: form.notas || null,
        precioPuntual: null,
      });
    }
    setToast(form.repetir ? `Se han creado ${form.repetirSemanas} clases` : 'Clase creada');
    setShowForm(null);
  }

  function editarSesion() {
    if (!sesionId) return;
    updateSesion(sesionId, {
      tipoClaseId: form.tipoClaseId,
      salaId: form.salaId,
      instructorId: form.instructorId,
      inicio: toISO(form.fecha, form.horaInicio),
      fin: toISO(form.fecha, form.horaFin),
      aforoMaximo: form.aforoMaximo,
      notas: form.notas || null,
    });
    setShowForm(null);
    setToast('Clase actualizada');
  }

  function cancelarSesion() {
    if (!sesionId) return;
    updateSesion(sesionId, { cancelada: true });
    setSesionId(null);
    setToast('Clase cancelada');
  }

  function eliminarSesion() {
    if (!sesionId) return;
    deleteSesion(sesionId);
    setSesionId(null);
    setToast('Clase eliminada');
  }

  function crearClasesRecurrentes(sesionesFields: Omit<import('@/lib/types').Sesion, 'id' | 'studioId'>[]) {
    sesionesFields.forEach(s => addSesion(s));
    setToast(`Se han creado ${sesionesFields.length} clases`);
    setShowRecurrentes(false);
  }

  // ── Label ────────────────────────────────────────────────────────────────────
  const mesLabel = `${semana.toLocaleDateString('es-ES', { day: 'numeric' })} – ${addDays(semana, 6).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  // Sessions of the current week (agenda groups them by day)
  const sesionesSemana = sesionesFiltered.filter(s => dias.some(d => localDate(d) === localDate(s.inicio)));

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full">
    <div className="flex flex-col flex-1 min-h-0 rounded-3xl bg-card border border-border shadow-[0_20px_50px_-24px_rgba(0,0,0,0.18)] overflow-hidden">
      {/* ── Top header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0 px-6 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center shrink-0">
            <CalendarDays size={18} className="text-brand-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-tight leading-tight">Agenda</h1>
            <p className="text-xs font-semibold mt-0.5 capitalize text-muted-foreground">{mesLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type legend */}
          {tiposClase.length > 0 && (
            <div className="hidden lg:flex items-center gap-3 mr-1">
              {tiposClase.slice(0, 4).map(t => (
                <div key={t.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-xs font-semibold text-muted-foreground">{t.nombre}</span>
                </div>
              ))}
            </div>
          )}

          {/* Week navigation */}
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
            <button
              onClick={() => cambiarSemana(-1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={irAHoy}
              className="px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={() => cambiarSemana(1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Nueva clase dropdown */}
          <div className="relative">
            <div className="flex rounded-xl overflow-hidden bg-primary">
              <button
                onClick={() => openNueva()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white hover:bg-card/10 transition-colors"
              >
                <Plus size={15} />Nueva clase
              </button>
              <button
                onClick={() => setShowNuevaMenu(v => !v)}
                className="px-2 py-2 text-white hover:bg-card/10 transition-colors border-l border-white/20"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {showNuevaMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNuevaMenu(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-20 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[180px]">
                  <button
                    onClick={() => { setShowNuevaMenu(false); openNueva(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors text-left"
                  >
                    <Plus size={14} className="text-muted-foreground" />Clase única
                  </button>
                  <button
                    onClick={() => { setShowNuevaMenu(false); setShowRecurrentes(true); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors text-left"
                  >
                    <RefreshCw size={14} className="text-muted-foreground" />Clases recurrentes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────────── */}
      <div className="px-6 pb-4 shrink-0">
        <StatsBar sesiones={sesionesEnriquecidas} todayStr={todayStr} />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pb-3 shrink-0">
        <FilterBar
          instructores={instructores}
          salas={salas}
          filtroInstructor={filtroInstructor}
          filtroSala={filtroSala}
          onInstructor={setFiltroInstructor}
          onSala={setFiltroSala}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
        />
      </div>

      {/* ── Mobile day picker ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 px-6 shrink-0 lg:hidden">
        {dias.map(d => {
          const str = localDate(d);
          const isToday = str === todayStr;
          const isSelected = str === mobileDia;
          return (
            <button
              key={str}
              onClick={() => setMobileDia(str)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl shrink-0 transition-colors',
                isSelected ? 'bg-primary' : 'bg-card border border-border',
              )}
            >
              <span className={cn('text-[9px] font-bold uppercase tracking-wider', isSelected ? 'text-primary-foreground/50' : 'text-muted-foreground')}>
                {DIAS_CORTOS[d.getDay()]}
              </span>
              <span className={cn(
                'text-[13px] font-extrabold w-5 h-5 flex items-center justify-center rounded-full',
                isSelected ? (isToday ? 'bg-brand text-brand-foreground' : 'text-primary-foreground') : (isToday ? 'text-brand' : 'text-foreground'),
              )}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Main content: week grid + optional detail sidebar ─────────────────── */}
      <div className="flex gap-0 flex-1 min-h-0 relative border-t border-border">
        {/* Week grid */}
        <div className="flex-1 min-w-0 min-h-0">
          <WeekGrid
            dias={dias}
            sesiones={sesionesSemana}
            todayStr={todayStr}
            selectedId={sesionId}
            onSesionClick={id => setSesionId(prev => prev === id ? null : id)}
            onSlotClick={(fecha, hora) => { setForm(f => ({ ...emptyForm(), fecha, horaInicio: hora, horaFin: hora })); setShowForm('nueva'); }}
            mobileDia={mobileDia}
          />
        </div>

        {/* Session detail — slide-over panel from the right */}
        {sesionId && sesionActual && !showForm && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-foreground/20" onClick={() => setSesionId(null)} />
            <SessionSidebar
              sesion={sesionActual}
              reservas={reservasActuales}
              socios={socios}
              spots={spots}
              onClose={() => setSesionId(null)}
              onCheckin={checkin}
              onCancelarReserva={cancelarReserva}
              onAddReserva={addReserva}
              onOpenEdit={openEdit}
              onCancelarSesion={cancelarSesion}
              onEliminarSesion={eliminarSesion}
              onLiberarSpot={liberarSpot}
              onAsignarSpot={asignarSpot}
            />
          </div>
        )}
      </div>
    </div>

      {/* ── Panel lateral crear / editar ────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-foreground/20" onClick={() => setShowForm(null)} />
          <div className="relative w-full lg:w-[420px] bg-card h-full flex flex-col shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)]">
            <div className="px-6 py-5 flex items-center justify-between border-b border-border shrink-0">
              <h2 className="text-lg font-extrabold text-foreground tracking-tight">
                {showForm === 'nueva' ? 'Nueva clase' : 'Editar clase'}
              </h2>
              <button onClick={() => setShowForm(null)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-border transition-colors">
                <X size={16} className="text-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo de clase">
                  <select className={selectCls} value={form.tipoClaseId} onChange={e => setForm(f => ({ ...f, tipoClaseId: e.target.value }))}>
                    {tiposClase.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </FormField>
                <FormField label="Sala">
                  <select className={selectCls} value={form.salaId} onChange={e => setForm(f => ({ ...f, salaId: e.target.value }))}>
                    {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Instructora">
                <select className={selectCls} value={form.instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
                  {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                </select>
              </FormField>
              <FormField label="Fecha">
                <input type="date" className={inputCls} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Hora inicio">
                  <input type="time" className={inputCls} value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
                </FormField>
                <FormField label="Hora fin">
                  <input type="time" className={inputCls} value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} />
                </FormField>
              </div>
              <FormField label="Aforo máximo">
                <input type="number" min={1} max={50} className={inputCls} value={form.aforoMaximo} onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value) }))} />
              </FormField>
              {showForm === 'nueva' && (
                <label className="flex items-center justify-between px-4 py-3.5 rounded-2xl bg-muted/60 border border-border cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <RefreshCw size={14} className="text-brand" />
                    Repetir semanalmente
                  </span>
                  <span
                    className="w-11 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0"
                    style={{ backgroundColor: form.repetir ? 'var(--primary)' : 'var(--muted-foreground)' }}
                    onClick={e => { e.preventDefault(); setForm(f => ({ ...f, repetir: !f.repetir })); }}
                  >
                    <span
                      className="w-5 h-5 bg-card rounded-full shadow transition-transform"
                      style={{ transform: form.repetir ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </span>
                </label>
              )}
              {showForm === 'nueva' && form.repetir && (
                <div className="flex items-center gap-3 pl-1">
                  <span className="text-sm text-muted-foreground">durante</span>
                  <input
                    type="number" min={2} max={52}
                    className="w-20 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground text-center"
                    value={form.repetirSemanas}
                    onChange={e => setForm(f => ({ ...f, repetirSemanas: Math.max(2, Number(e.target.value)) }))}
                  />
                  <span className="text-sm text-muted-foreground">semanas</span>
                </div>
              )}
              <FormField label="Notas (opcional)">
                <textarea
                  className={inputCls + ' resize-none h-20'}
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Indicaciones especiales, material necesario..."
                />
              </FormField>
            </div>
            <div className="px-6 py-5 border-t border-border flex gap-3 shrink-0">
              <button onClick={() => setShowForm(null)} className="flex-1 py-3 rounded-2xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button
                onClick={showForm === 'nueva' ? crearSesion : editarSesion}
                className="flex-[2] py-3 rounded-2xl text-sm font-extrabold text-brand-foreground transition-opacity hover:opacity-90 bg-brand"
              >
                {showForm === 'nueva'
                  ? form.repetir ? `Crear ${form.repetirSemanas} clases` : 'Crear clase'
                  : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal clases recurrentes ────────────────────────────────────────────── */}
      <ModalClasesRecurrentes
        open={showRecurrentes}
        onClose={() => setShowRecurrentes(false)}
        tiposClase={tiposClase}
        instructores={instructores}
        salas={salas}
        onCrear={crearClasesRecurrentes}
      />

      {/* ── Toast ──────────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 bg-primary text-primary-foreground px-5 py-3 rounded-full shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={15} className="text-[#3EC38A] shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
