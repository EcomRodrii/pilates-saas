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

function isDark(hex: string) {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

function minutesSinceMidnight(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// ─── Calendar constants ───────────────────────────────────────────────────────

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const START_HOUR = 7;
const END_HOUR = 22;
const PX_PER_HOUR = 72;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputCls = 'w-full rounded-xl border border-[#E8EAED] bg-white px-3.5 py-2.5 text-sm font-medium text-[#111827] focus:outline-none focus:border-[#9CA3AF] transition-colors';
const selectCls = 'w-full rounded-xl border border-[#E8EAED] bg-white px-3.5 py-2.5 text-sm font-medium text-[#111827] focus:outline-none focus:border-[#9CA3AF] transition-colors appearance-none';

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

// ─── Occupancy color ──────────────────────────────────────────────────────────

function occupancyColor(confirmadas: number, aforoMaximo: number): string {
  if (aforoMaximo === 0) return '#6B7280';
  const pct = (confirmadas / aforoMaximo) * 100;
  if (pct >= 100) return '#EF4444';
  if (pct >= 70) return '#F59E0B';
  return '#10B981';
}

// ─── Occupancy dot ───────────────────────────────────────────────────────────

function OccupancyDot({ confirmadas, aforoMaximo }: { confirmadas: number; aforoMaximo: number }) {
  const color = occupancyColor(confirmadas, aforoMaximo);
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />;
}

// ─── FormField wrapper ────────────────────────────────────────────────────────

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">{label}</label>
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
        active ? 'bg-[#111827] text-white' : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
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

// ─── CurrentTimeLine ─────────────────────────────────────────────────────────

function CurrentTimeLine({ now }: { now: Date }) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const startMins = START_HOUR * 60;
  const endMins = END_HOUR * 60;
  if (mins < startMins || mins > endMins) return null;
  const top = ((mins - startMins) / 60) * PX_PER_HOUR;
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none flex items-center" style={{ top }}>
      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 -ml-1 shadow" />
      <div className="flex-1 h-px bg-red-500 shadow-sm" />
    </div>
  );
}

// ─── StatsBar ────────────────────────────────────────────────────────────────

function StatsBar({ sesiones, reservas, todayStr }: {
  sesiones: SesionEnr[];
  reservas: { sesionId: string; estado: string }[];
  todayStr: string;
}) {
  const hoy = sesiones.filter(s => !s.cancelada && localDate(s.inicio) === todayStr);
  const totalPlazas = hoy.reduce((acc, s) => acc + s.aforoMaximo, 0);
  const ocupadas = hoy.reduce((acc, s) => acc + s.confirmadas, 0);
  const asistidas = hoy.reduce((acc, s) => acc + s.asistidas, 0);
  const checkinRate = ocupadas > 0 ? Math.round((asistidas / ocupadas) * 100) : 0;

  const ocupPct = totalPlazas > 0 ? Math.round((ocupadas / totalPlazas) * 100) : 0;

  const stats = [
    { icon: CalendarDays, label: 'Clases hoy', value: hoy.length, sub: hoy.length === 1 ? 'sesión' : 'sesiones', color: '#4F46E5', bg: '#EEF2FF' },
    { icon: Users, label: 'Plazas totales', value: totalPlazas, sub: 'disponibles hoy', color: '#0F172A', bg: '#F1F5F9' },
    { icon: TrendingUp, label: 'Ocupación', value: `${ocupPct}%`, sub: `${ocupadas} de ${totalPlazas} reservadas`, color: '#D97706', bg: '#FEF3C7' },
    { icon: CheckCircle2, label: 'Check-in', value: `${checkinRate}%`, sub: `${asistidas} asistidas`, color: '#059669', bg: '#DCFCE7' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map(({ icon: Icon, label, value, sub, color, bg }) => (
        <div key={label} className="bg-white border border-[#EBECF0] rounded-2xl p-4 flex flex-col gap-2.5 hover:shadow-sm transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">{label}</span>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
              <Icon size={15} color={color} />
            </div>
          </div>
          <div>
            <p className="text-[26px] font-extrabold text-[#0F172A] leading-none tracking-tight tabular-nums">{value}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-1 truncate">{sub}</p>
          </div>
        </div>
      ))}
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
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
        <input
          className="w-full rounded-xl border border-[#E8EAED] bg-white pl-8 pr-3 py-2 text-sm font-medium text-[#111827] focus:outline-none focus:border-[#9CA3AF] transition-colors placeholder:text-[#9CA3AF]"
          placeholder="Buscar clase..."
          value={busqueda}
          onChange={e => onBusqueda(e.target.value)}
        />
      </div>
      <select
        className="rounded-xl border border-[#E8EAED] bg-white px-3 py-2 text-sm font-medium text-[#111827] focus:outline-none appearance-none cursor-pointer"
        value={filtroInstructor}
        onChange={e => onInstructor(e.target.value)}
      >
        <option value="">Todas las instructoras</option>
        {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
      </select>
      <select
        className="rounded-xl border border-[#E8EAED] bg-white px-3 py-2 text-sm font-medium text-[#111827] focus:outline-none appearance-none cursor-pointer"
        value={filtroSala}
        onChange={e => onSala(e.target.value)}
      >
        <option value="">Todas las salas</option>
        {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      {hayFiltros && (
        <button
          onClick={() => { onInstructor(''); onSala(''); onBusqueda(''); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[#E8EAED] text-[#6B7280] hover:bg-gray-50 transition-colors"
        >
          <X size={12} />Limpiar
        </button>
      )}
    </div>
  );
}

// ─── Overlap layout: assign columns to overlapping sessions ──────────────────

interface LayoutedSesion extends SesionEnr {
  col: number;
  totalCols: number;
}

function layoutSesiones(sesiones: SesionEnr[]): LayoutedSesion[] {
  if (sesiones.length === 0) return [];

  // Sort by start time
  const sorted = [...sesiones].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const result: LayoutedSesion[] = [];

  // Track columns: array of end times
  const colEnds: string[] = [];

  // First pass: assign columns greedily
  const cols: number[] = [];
  for (const s of sorted) {
    let col = 0;
    while (col < colEnds.length && colEnds[col] > s.inicio) col++;
    cols.push(col);
    colEnds[col] = s.fin;
  }

  // Second pass: determine total columns for each overlapping group
  // For each session, find max col of sessions that overlap with it
  for (let i = 0; i < sorted.length; i++) {
    let maxCol = cols[i];
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      // Do they overlap?
      if (sorted[j].inicio < sorted[i].fin && sorted[j].fin > sorted[i].inicio) {
        if (cols[j] > maxCol) maxCol = cols[j];
      }
    }
    result.push({ ...sorted[i], col: cols[i], totalCols: maxCol + 1 });
  }

  return result;
}

// ─── SessionBlock ─────────────────────────────────────────────────────────────

function SessionBlock({
  s,
  onClick,
  isSelected,
}: {
  s: LayoutedSesion;
  onClick: (id: string) => void;
  isSelected: boolean;
}) {
  const startMins = minutesSinceMidnight(s.inicio);
  const endMins = minutesSinceMidnight(s.fin);
  const offsetMins = START_HOUR * 60;

  const top = ((startMins - offsetMins) / 60) * PX_PER_HOUR + 1;
  const height = Math.max(((endMins - startMins) / 60) * PX_PER_HOUR - 3, 16);

  const gutter = 2;
  const colWidth = `calc((100% - ${gutter}px) / ${s.totalCols})`;
  const left = `calc((100% - ${gutter}px) / ${s.totalCols} * ${s.col} + ${s.col > 0 ? gutter : 0}px)`;

  const dark = isDark(s.tipoClase.color);
  // Dark class colors → solid fill + white text. Light colors → soft tint + dark text.
  const bg = dark ? s.tipoClase.color : `${s.tipoClase.color}26`;
  const textMain = dark ? '#fff' : '#0F172A';
  const textSub = dark ? 'rgba(255,255,255,0.7)' : '#64748B';

  const isFull = s.confirmadas >= s.aforoMaximo;

  return (
    <button
      onClick={() => onClick(s.id)}
      className={cn(
        'absolute rounded-xl text-left overflow-hidden transition-all',
        isSelected ? 'ring-2 ring-offset-1 ring-[#4F46E5] shadow-lg' : 'hover:-translate-y-px hover:shadow-md',
      )}
      style={{
        top,
        height,
        left,
        width: colWidth,
        backgroundColor: bg,
        boxShadow: isSelected ? undefined : '0 1px 2px rgba(15,23,42,0.06)',
        zIndex: isSelected ? 10 : 1,
      }}
    >
      {/* Left accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: s.tipoClase.color }}
      />
      <div className="pl-2.5 pr-1.5 pt-1 pb-1 h-full flex flex-col">
        {/* Occupancy dot + name */}
        <div className="flex items-start gap-1 min-w-0">
          <OccupancyDot confirmadas={s.confirmadas} aforoMaximo={s.aforoMaximo} />
          <p
            className="text-[11px] font-bold leading-tight truncate flex-1"
            style={{ color: textMain }}
          >
            {s.tipoClase.nombre}
          </p>
        </div>

        {/* Time + spots — only if enough height */}
        {height > 34 && (
          <p className="text-[10px] leading-snug mt-0.5 truncate" style={{ color: textSub }}>
            {formatHora(s.inicio)}
            {height > 48 && ` · ${s.confirmadas}/${s.aforoMaximo}`}
          </p>
        )}

        {/* Instructor — only if tall enough */}
        {height > 60 && (
          <p className="text-[10px] leading-snug truncate mt-0.5" style={{ color: textSub }}>
            {s.instructor.nombre}
          </p>
        )}

        {/* Full badge */}
        {isFull && height > 52 && (
          <span
            className="mt-auto text-[9px] font-bold px-1 py-0.5 rounded self-start"
            style={{ backgroundColor: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)', color: textMain }}
          >
            COMPLETO
          </span>
        )}
      </div>
    </button>
  );
}

// ─── WeekGrid ────────────────────────────────────────────────────────────────

function WeekGrid({
  sesiones,
  dias,
  todayStr,
  now,
  selectedId,
  onSesionClick,
  onSlotClick,
}: {
  sesiones: SesionEnr[];
  dias: Date[];
  todayStr: string;
  now: Date;
  selectedId: string | null;
  onSesionClick: (id: string) => void;
  onSlotClick: (fecha: string, hora: string) => void;
}) {
  const isCurrentWeek = dias.some(d => localDate(d) === todayStr);

  return (
    <div className="bg-white rounded-2xl border border-[#EBECF0] overflow-hidden flex-1 min-w-0 shadow-sm">
      {/* Day header row */}
      <div className="grid border-b border-[#EBECF0] sticky top-0 bg-white/95 z-10" style={{ gridTemplateColumns: '52px repeat(7, 1fr)', backdropFilter: 'blur(8px)' }}>
        <div className="border-r border-[#EBECF0]" />
        {dias.map((d, i) => {
          const str = localDate(d);
          const isToday = str === todayStr;
          const isWeekend = i >= 5;
          const dayCount = sesiones.filter(s => !s.cancelada && localDate(s.inicio) === str).length;
          return (
            <div
              key={i}
              className={cn('py-2 flex flex-col items-center border-r border-[#EBECF0] last:border-r-0', isToday && 'bg-[#EEF2FF]')}
            >
              <p className={cn('text-[10px] uppercase tracking-widest font-bold', isToday ? 'text-[#4F46E5]' : isWeekend ? 'text-[#C4C4CC]' : 'text-[#9CA3AF]')}>{DAY_LABELS[i]}</p>
              <div className={cn(
                'mt-1 w-8 h-8 flex items-center justify-center rounded-full text-[15px] font-bold tabular-nums',
                isToday ? 'bg-[#4F46E5] text-white shadow-sm' : 'text-[#0F172A]',
              )}>
                {d.getDate()}
              </div>
              <p className={cn('text-[9px] font-semibold mt-0.5 h-3', dayCount > 0 ? 'text-[#9CA3AF]' : 'text-transparent')}>
                {dayCount > 0 ? `${dayCount} clase${dayCount > 1 ? 's' : ''}` : '·'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: 400 }}>
        <div
          className="relative grid"
          style={{ gridTemplateColumns: '52px repeat(7, 1fr)', height: TOTAL_HEIGHT }}
        >
          {/* Hour labels column */}
          <div className="relative border-r border-[#E8EAED] bg-white">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full flex items-center justify-end pr-2"
                style={{ top: (h - START_HOUR) * PX_PER_HOUR - 8 }}
              >
                <span className="text-[10px] font-semibold text-[#C4C4CC] tabular-nums">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {dias.map((d, di) => {
            const str = localDate(d);
            const isToday = str === todayStr;
            const daySesiones = sesiones.filter(s => !s.cancelada && localDate(s.inicio) === str);
            const layouted = layoutSesiones(daySesiones);

            return (
              <div
                key={di}
                className={cn('relative border-r border-[#E8EAED] last:border-r-0', isToday && 'bg-[#F5F7FF]')}
              >
                {/* Hour gridlines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-[#F0F0F5]"
                    style={{ top: (h - START_HOUR) * PX_PER_HOUR }}
                  />
                ))}
                {/* Half-hour dashed lines */}
                {HOURS.slice(0, -1).map(h => (
                  <div
                    key={`${h}h`}
                    className="absolute inset-x-0 border-t border-dashed border-[#F7F7FA]"
                    style={{ top: (h - START_HOUR) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                  />
                ))}

                {/* Clickable empty slot areas */}
                {HOURS.slice(0, -1).map(h => {
                  const slotHora = `${String(h).padStart(2, '0')}:00`;
                  return (
                    <div
                      key={`slot-${h}`}
                      className="absolute inset-x-0 cursor-pointer hover:bg-[#4F46E5]/5 transition-colors group"
                      style={{ top: (h - START_HOUR) * PX_PER_HOUR, height: PX_PER_HOUR }}
                      onClick={() => onSlotClick(str, slotHora)}
                    >
                      <div className="absolute inset-x-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[10px] font-bold text-[#4F46E5] bg-white/90 px-1.5 py-0.5 rounded-md shadow-sm">
                          + {slotHora}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Session blocks */}
                {layouted.map(s => (
                  <SessionBlock
                    key={s.id}
                    s={s}
                    onClick={onSesionClick}
                    isSelected={s.id === selectedId}
                  />
                ))}

                {/* Current time line — only on today's column */}
                {isToday && isCurrentWeek && (
                  <CurrentTimeLine now={now} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── DayColumn ────────────────────────────────────────────────────────────────

function DayColumn({
  sesiones,
  fecha,
  todayStr,
  now,
  selectedId,
  onSesionClick,
  onSlotClick,
}: {
  sesiones: SesionEnr[];
  fecha: string;
  todayStr: string;
  now: Date;
  selectedId: string | null;
  onSesionClick: (id: string) => void;
  onSlotClick: (fecha: string, hora: string) => void;
}) {
  const isToday = fecha === todayStr;
  const layouted = layoutSesiones(sesiones);

  return (
    <div className="bg-white rounded-2xl border border-[#E8EAED] overflow-hidden flex-1 min-w-0">
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: 400 }}>
        <div
          className="relative"
          style={{ height: TOTAL_HEIGHT, paddingLeft: 52 }}
        >
          {/* Hour labels */}
          <div className="absolute left-0 top-0 bottom-0 w-[52px] border-r border-[#E8EAED]">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full flex items-center justify-end pr-2"
                style={{ top: (h - START_HOUR) * PX_PER_HOUR - 8 }}
              >
                <span className="text-[10px] font-semibold text-[#C4C4CC] tabular-nums">
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day content */}
          <div className={cn('relative h-full', isToday && 'bg-[#F5F7FF]')}>
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute inset-x-0 border-t border-[#F0F0F5]"
                style={{ top: (h - START_HOUR) * PX_PER_HOUR }}
              />
            ))}
            {HOURS.slice(0, -1).map(h => (
              <div
                key={`${h}h`}
                className="absolute inset-x-0 border-t border-dashed border-[#F7F7FA]"
                style={{ top: (h - START_HOUR) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
              />
            ))}
            {HOURS.slice(0, -1).map(h => {
              const slotHora = `${String(h).padStart(2, '0')}:00`;
              return (
                <div
                  key={`slot-${h}`}
                  className="absolute inset-x-0 cursor-pointer hover:bg-[#4F46E5]/5 transition-colors group"
                  style={{ top: (h - START_HOUR) * PX_PER_HOUR, height: PX_PER_HOUR }}
                  onClick={() => onSlotClick(fecha, slotHora)}
                >
                  <div className="absolute inset-x-2 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    <span className="text-[10px] font-bold text-[#4F46E5] bg-white/90 px-1.5 py-0.5 rounded-md shadow-sm">
                      + {slotHora}
                    </span>
                  </div>
                </div>
              );
            })}
            {layouted.map(s => (
              <SessionBlock
                key={s.id}
                s={s}
                onClick={onSesionClick}
                isSelected={s.id === selectedId}
              />
            ))}
            {isToday && <CurrentTimeLine now={now} />}
          </div>
        </div>
      </div>
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
    <div className="w-[380px] shrink-0 bg-white border-l border-[#E8EAED] flex flex-col h-full overflow-hidden">
      {/* Header with class color accent */}
      <div
        className="px-5 pt-4 pb-3 border-b border-[#E8EAED]"
        style={{ borderTop: `3px solid ${sesion.tipoClase.color}` }}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
              style={{ backgroundColor: sesion.tipoClase.color }}
            />
            <h2 className="text-base font-bold text-[#111827] leading-tight">{sesion.tipoClase.nombre}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] transition-colors ml-2 shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        <p className="text-xs font-semibold text-[#6B7280] capitalize mb-3">{fechaLabel}</p>

        <div className="flex items-center gap-3 text-xs font-medium text-[#6B7280] flex-wrap">
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
            <span className="text-[#6B7280]">Ocupación</span>
            <span style={{ color: barColor }}>{pct}% · {sesion.confirmadas}/{sesion.aforoMaximo}</span>
          </div>
          <div className="h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-5 py-2.5 border-b border-[#E8EAED] flex items-center gap-2">
        <button
          onClick={onOpenEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E8EAED] text-[#111827] hover:bg-gray-50 transition-colors"
        >
          <Pencil size={12} />Editar
        </button>
        <button
          onClick={() => setShowConfirm('cancelar')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E8EAED] text-[#6B7280] hover:bg-gray-50 transition-colors"
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
        <div className="absolute inset-0 bg-white z-30 flex flex-col items-center justify-center gap-5 p-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: showConfirm === 'eliminar' ? '#FEE2E2' : '#FEF3C7' }}
          >
            <AlertTriangle size={24} color={showConfirm === 'eliminar' ? '#EF4444' : '#D97706'} />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#111827] mb-1">
              {showConfirm === 'eliminar' ? '¿Eliminar clase?' : '¿Cancelar clase?'}
            </h3>
            <p className="text-sm text-[#6B7280]">
              {showConfirm === 'eliminar'
                ? 'Se eliminará la clase y todas las reservas. Esta acción no se puede deshacer.'
                : 'La clase quedará marcada como cancelada. Las socias serán notificadas.'}
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setShowConfirm(null)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#E8EAED] text-[#6B7280] hover:bg-gray-50"
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
      <div className="flex border-b border-[#E8EAED] px-5 pt-2">
        {(['asistentes', 'mapa'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'pb-2 mr-5 text-xs font-bold border-b-2 transition-colors capitalize',
              activeTab === tab
                ? 'border-[#111827] text-[#111827]'
                : 'border-transparent text-[#9CA3AF] hover:text-[#6B7280]'
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
                className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-[#E8EAED] text-xs font-bold text-[#6B7280] hover:border-[#9CA3AF] hover:text-[#111827] transition-colors mb-3"
              >
                <UserPlus size={13} />Añadir socia a la clase
              </button>
            ) : (
              <div className="mb-3 space-y-2">
                <input
                  className="w-full rounded-xl border border-[#E8EAED] bg-white px-3.5 py-2.5 text-sm font-medium text-[#111827] focus:outline-none focus:border-[#9CA3AF]"
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
                      className="w-full flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-[#F9FAFB] transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: '#EDEAF8', color: '#4F46E5' }}>
                        {s.nombre[0]}{s.apellidos[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#111827] truncate">{s.nombre} {s.apellidos}</p>
                        <p className="text-[10px] text-[#9CA3AF] truncate">{s.email}</p>
                      </div>
                    </button>
                  ))}
                  {sociosDisponibles.length === 0 && (
                    <p className="text-xs text-center py-3 text-[#9CA3AF]">No hay socias disponibles</p>
                  )}
                </div>
                <button
                  onClick={() => { setShowAnadir(false); setBuscarSocia(''); }}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-[#9CA3AF] hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* Attendee list */}
            {reservas.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[#9CA3AF]">Sin asistentes aún</p>
              </div>
            ) : (
              reservas
                .filter(r => r.estado !== 'CANCELADA')
                .map(r => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl hover:bg-[#F9FAFB] group transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={
                        r.estado === 'ASISTIDA'
                          ? { backgroundColor: '#D1FAE5', color: '#065F46' }
                          : r.estado === 'LISTA_ESPERA'
                          ? { backgroundColor: '#FEF3C7', color: '#92400E' }
                          : { backgroundColor: '#EDEAF8', color: '#4F46E5' }
                      }
                    >
                      {r.socio?.nombre[0]}{r.socio?.apellidos[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#111827] truncate">{r.socio?.nombre} {r.socio?.apellidos}</p>
                      <p className="text-[10px] text-[#9CA3AF]">
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
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-[#C4C4CC] hover:bg-red-50 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
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
              <div className="flex items-center justify-center h-32 rounded-2xl border-2 border-dashed border-[#E8EAED] text-sm text-[#9CA3AF]">
                Sala sin mapa de spots
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: kiosk link */}
      <div className="px-5 py-3 border-t border-[#E8EAED]">
        <a
          href={`/kiosk/${sesion.id}`}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7280] hover:text-[#111827] transition-colors"
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

  const f2 = 'w-full border border-[#E8EAED] rounded-xl px-3.5 py-2.5 text-sm focus:border-[#111827] focus:outline-none text-[#111827]';
  const s2 = 'w-full border border-[#E8EAED] rounded-xl px-3.5 py-2.5 text-sm focus:border-[#111827] focus:outline-none text-[#111827] bg-white appearance-none';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-[#111827]">Crear clases recurrentes</DialogTitle>
          <p className="text-sm text-[#6B7280] mt-0.5">Genera múltiples sesiones de una vez</p>
        </DialogHeader>
        <div className="space-y-4 mt-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Tipo de clase</label>
            <select className={s2} value={form.tipoClaseId} onChange={e => setForm(f => ({ ...f, tipoClaseId: e.target.value }))}>
              {tiposClase.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Instructora</label>
            <select className={s2} value={form.instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
              {instructores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Sala</label>
            <select className={s2} value={form.salaId} onChange={e => setForm(f => ({ ...f, salaId: e.target.value }))}>
              {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Hora inicio</label>
              <input type="time" className={f2} value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Duración</label>
              <select className={s2} value={form.duracion} onChange={e => setForm(f => ({ ...f, duracion: Number(e.target.value) as 45 | 60 | 90 }))}>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Días de la semana</label>
            <div className="flex items-center gap-2 flex-wrap">
              {DIA_PILLS.map(({ label, day }) => (
                <DiaPill key={day} label={label} active={form.diasSemana.includes(day)} onClick={() => toggleDia(day)} />
              ))}
            </div>
            {form.diasSemana.length === 0 && <p className="text-xs text-red-500">Selecciona al menos un día</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Fecha inicio</label>
              <input type="date" className={f2} value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Fecha fin</label>
              <input type="date" className={f2} value={form.fechaFin} onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Aforo máximo</label>
            <input type="number" min={1} max={50} className={f2} value={form.aforoMaximo} onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value) }))} />
          </div>
          {estimatedCount > 0 && (
            <div className="rounded-xl bg-[#F3F4F6] px-4 py-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-[#6B7280] shrink-0" />
              <p className="text-sm font-semibold text-[#111827]">Se crearán <span className="font-bold">{estimatedCount}</span> clases</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#E8EAED] text-[#6B7280] hover:bg-gray-50 transition-colors">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={form.diasSemana.length === 0 || estimatedCount === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#111827] text-white hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {estimatedCount > 0 ? `Crear ${estimatedCount} clases` : 'Crear clases'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
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

  // ── View state ──────────────────────────────────────────────────────────────
  const [vista, setVista] = useState<'semana' | 'dia'>('semana');
  const [semana, setSemana] = useState(() => weekStart(FALLBACK));
  const [diaActivo, setDiaActivo] = useState(() => FALLBACK);

  useEffect(() => {
    const today = new Date();
    setMounted(true);
    setSemana(weekStart(today));
    setDiaActivo(today);
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

  const sesionesEnriquecidas = useMemo<SesionEnr[]>(() =>
    sesiones.map(s => ({
      ...s,
      tipoClase: tiposClase.find(t => t.id === s.tipoClaseId) ?? { nombre: '?', color: '#9CA3AF' },
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
    const today = new Date();
    setSemana(weekStart(today));
    setDiaActivo(today);
  }

  // ── Slot click → prefill form ────────────────────────────────────────────────
  function handleSlotClick(fecha: string, hora: string) {
    const [hh] = hora.split(':');
    const finH = String(Math.min(parseInt(hh) + 1, END_HOUR)).padStart(2, '0');
    setForm(prev => ({ ...emptyForm(), fecha, horaInicio: hora, horaFin: `${finH}:00` }));
    setShowForm('nueva');
  }

  // ── Session actions ──────────────────────────────────────────────────────────
  function openNueva(prefillFecha?: string) {
    setForm({ ...emptyForm(), fecha: prefillFecha ?? localDate(diaActivo) });
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

  const diaStr = localDate(diaActivo);
  const sesionesDelDia = sesionesFiltered.filter(s => !s.cancelada && localDate(s.inicio) === diaStr);

  if (!mounted) return null;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── Top header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Calendario</h1>
          <p className="text-sm font-medium mt-0.5 capitalize text-[#6B7280]">
            {vista === 'dia'
              ? diaActivo.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : mesLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex bg-white border border-[#E8EAED] p-1 rounded-xl gap-1">
            <button
              onClick={() => setVista('semana')}
              className={cn('px-3 py-1.5 text-xs font-bold rounded-lg transition-all', vista === 'semana' ? 'bg-[#111827] text-white' : 'text-[#6B7280] hover:text-[#111827]')}
            >
              Semana
            </button>
            <button
              onClick={() => setVista('dia')}
              className={cn('px-3 py-1.5 text-xs font-bold rounded-lg transition-all', vista === 'dia' ? 'bg-[#111827] text-white' : 'text-[#6B7280] hover:text-[#111827]')}
            >
              Día
            </button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 bg-white border border-[#E8EAED] rounded-xl p-1">
            <button
              onClick={() => vista === 'semana' ? cambiarSemana(-1) : setDiaActivo(addDays(diaActivo, -1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={irAHoy}
              className="px-3 py-1 text-xs font-bold text-[#6B7280] hover:text-[#111827] transition-colors"
            >
              Hoy
            </button>
            <button
              onClick={() => vista === 'semana' ? cambiarSemana(1) : setDiaActivo(addDays(diaActivo, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Nueva clase dropdown */}
          <div className="relative">
            <div className="flex rounded-xl overflow-hidden bg-[#111827]">
              <button
                onClick={() => openNueva()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 transition-colors"
              >
                <Plus size={15} />Nueva clase
              </button>
              <button
                onClick={() => setShowNuevaMenu(v => !v)}
                className="px-2 py-2 text-white hover:bg-white/10 transition-colors border-l border-white/20"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {showNuevaMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNuevaMenu(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-20 bg-white border border-[#E8EAED] rounded-xl shadow-lg overflow-hidden min-w-[180px]">
                  <button
                    onClick={() => { setShowNuevaMenu(false); openNueva(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB] transition-colors text-left"
                  >
                    <Plus size={14} className="text-[#6B7280]" />Clase única
                  </button>
                  <button
                    onClick={() => { setShowNuevaMenu(false); setShowRecurrentes(true); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB] transition-colors text-left"
                  >
                    <RefreshCw size={14} className="text-[#6B7280]" />Clases recurrentes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────────── */}
      <StatsBar sesiones={sesionesEnriquecidas} reservas={reservas} todayStr={todayStr} />

      {/* ── Filter bar ─────────────────────────────────────────────────────────── */}
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

      {/* ── Day strip (día view only) ──────────────────────────────────────────── */}
      {vista === 'dia' && (
        <div className="grid grid-cols-7 gap-1 shrink-0">
          {dias.map((d, i) => {
            const str = localDate(d);
            const isToday = str === todayStr;
            const activo = str === diaStr;
            const tieneClases = sesionesFiltered.some(s => !s.cancelada && localDate(s.inicio) === str);
            return (
              <button
                key={i}
                onClick={() => setDiaActivo(d)}
                className={cn(
                  'flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all',
                  activo ? 'bg-[#111827] shadow-sm' : isToday ? 'bg-white shadow-sm' : 'hover:bg-white/70'
                )}
              >
                <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: activo ? 'rgba(255,255,255,0.5)' : '#9CA3AF' }}>{DAY_LABELS[i]}</span>
                <span className="text-sm font-bold leading-none" style={{ color: activo ? '#fff' : isToday ? '#111827' : '#6B7280' }}>{d.getDate()}</span>
                {tieneClases && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: activo ? 'rgba(255,255,255,0.5)' : '#C8C2E8' }} />}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Main content: calendar + optional sidebar ──────────────────────────── */}
      <div className="flex gap-0 flex-1 min-h-0 relative">
        {/* Grid or day column */}
        <div className="flex-1 min-w-0 flex flex-col">
          {vista === 'semana' ? (
            <WeekGrid
              sesiones={sesionesFiltered}
              dias={dias}
              todayStr={todayStr}
              now={now}
              selectedId={sesionId}
              onSesionClick={id => setSesionId(prev => prev === id ? null : id)}
              onSlotClick={handleSlotClick}
            />
          ) : (
            <DayColumn
              sesiones={sesionesDelDia}
              fecha={diaStr}
              todayStr={todayStr}
              now={now}
              selectedId={sesionId}
              onSesionClick={id => setSesionId(prev => prev === id ? null : id)}
              onSlotClick={handleSlotClick}
            />
          )}
        </div>

        {/* Session detail sidebar — slides in when a session is selected */}
        <div
          className={cn(
            'transition-all duration-200 ease-out shrink-0 overflow-hidden relative',
            sesionId && sesionActual ? 'w-[380px] ml-4' : 'w-0 ml-0'
          )}
          style={{ minHeight: 0 }}
        >
          {sesionId && sesionActual && !showForm && (
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
          )}
        </div>
      </div>

      {/* ── Modal crear / editar ────────────────────────────────────────────────── */}
      <Dialog open={showForm !== null} onOpenChange={open => !open && setShowForm(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#111827]">
              {showForm === 'nueva' ? 'Nueva clase' : 'Editar clase'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
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
              <div className="rounded-xl border border-[#E8EAED] p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.repetir}
                    onChange={e => setForm(f => ({ ...f, repetir: e.target.checked }))}
                    className="w-4 h-4 rounded accent-[#4F46E5]"
                  />
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
                    <RefreshCw size={14} className="text-[#4F46E5]" />
                    Repetir semanalmente
                  </span>
                </label>
                {form.repetir && (
                  <div className="flex items-center gap-3 pl-7">
                    <span className="text-sm text-[#6B7280]">durante</span>
                    <input
                      type="number" min={2} max={52}
                      className="w-20 rounded-xl border border-[#E8EAED] bg-white px-3 py-2 text-sm font-medium text-[#111827] focus:outline-none focus:border-[#9CA3AF] text-center"
                      value={form.repetirSemanas}
                      onChange={e => setForm(f => ({ ...f, repetirSemanas: Math.max(2, Number(e.target.value)) }))}
                    />
                    <span className="text-sm text-[#6B7280]">semanas</span>
                  </div>
                )}
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
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowForm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-[#E8EAED] text-[#6B7280] hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={showForm === 'nueva' ? crearSesion : editarSesion}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 bg-[#111827]"
            >
              {showForm === 'nueva'
                ? form.repetir ? `Crear ${form.repetirSemanas} clases` : 'Crear clase'
                : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#111827] text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={16} className="text-green-400 shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
