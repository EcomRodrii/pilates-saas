'use client';

import { useState } from 'react';
import { Plus, CheckCircle2, XCircle, Clock, User, Calendar, Filter } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { Cita, TipoCita, EstadoCita } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ─── Helper constants ─────────────────────────────────────────────────────────

const TIPO_BADGE: Record<TipoCita, { label: string; cls: string }> = {
  PRIVADA:     { label: 'Privada',      cls: 'bg-[#EDF9C8] text-[#6D28D9]' },
  EVALUACION:  { label: 'Evaluación',   cls: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  FISIOTERAPIA:{ label: 'Fisioterapia', cls: 'bg-[#D1FAE5] text-[#065F46]' },
  ONLINE:      { label: 'Online',       cls: 'bg-[#FEF3C7] text-[#92400E]' },
};

const ESTADO_BADGE: Record<EstadoCita, { label: string; cls: string }> = {
  PENDIENTE:   { label: 'Pendiente',    cls: 'bg-[#FEF3C7] text-[#92400E]' },
  CONFIRMADA:  { label: 'Confirmada',   cls: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  COMPLETADA:  { label: 'Completada',   cls: 'bg-[#D1FAE5] text-[#065F46]' },
  CANCELADA:   { label: 'Cancelada',    cls: 'bg-[#F1F1EC] text-[#8E8E86]' },
  NO_ASISTIO:  { label: 'No asistió',   cls: 'bg-[#FEE2E2] text-[#B91C1C]' },
};

const TIPOS_CITA: TipoCita[] = ['PRIVADA', 'EVALUACION', 'FISIOTERAPIA', 'ONLINE'];
const DURACIONES = [30, 45, 60, 90];

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  const fecha = d.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fecha} · ${hora}`;
}

function duracionMin(inicio: string, fin: string): number {
  return Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 60000);
}

function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

// ─── Form field wrapper ───────────────────────────────────────────────────────

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[#1A1A1A]">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-[#E7E7E0] px-3 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#1A1A1A] focus:ring-1 focus:ring-[#1A1A1A] bg-white placeholder:text-[#A8A89F]';

// ─── Cita card ────────────────────────────────────────────────────────────────

interface CitaCardProps {
  cita: Cita;
  socioNombre: string;
  socioEmail: string;
  socioInitials: string;
  instructorNombre: string;
  onCompletar: (id: string) => void;
  onCancelar: (id: string) => void;
}

function CitaCard({
  cita,
  socioNombre,
  socioEmail,
  socioInitials,
  instructorNombre,
  onCompletar,
  onCancelar,
}: CitaCardProps) {
  const [hovered, setHovered] = useState(false);
  const tipoBadge = TIPO_BADGE[cita.tipo];
  const estadoBadge = ESTADO_BADGE[cita.estado];
  const isActive = cita.estado === 'PENDIENTE' || cita.estado === 'CONFIRMADA';
  const mins = duracionMin(cita.inicio, cita.fin);

  return (
    <div
      className="bg-white border border-[#E7E7E0] rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-shadow hover:shadow-sm"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Type badge */}
      <span
        className={cn(
          'self-start sm:self-auto shrink-0 inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium',
          tipoBadge.cls
        )}
      >
        {tipoBadge.label}
      </span>

      {/* Client */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-full bg-[#F1F1EC] flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-[#8E8E86] uppercase">{socioInitials}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1A1A1A] truncate">{socioNombre}</p>
          <p className="text-xs text-[#8E8E86] truncate">{socioEmail}</p>
        </div>
      </div>

      {/* Instructor */}
      <div className="flex items-center gap-1.5 text-sm text-[#8E8E86] shrink-0">
        <User size={13} className="shrink-0" />
        <span className="truncate max-w-[120px]">{instructorNombre}</span>
      </div>

      {/* Date & duration */}
      <div className="flex items-center gap-1.5 text-sm text-[#8E8E86] shrink-0">
        <Calendar size={13} className="shrink-0" />
        <span>{formatFecha(cita.inicio)}</span>
      </div>

      <div className="flex items-center gap-1 text-sm text-[#8E8E86] shrink-0">
        <Clock size={13} className="shrink-0" />
        <span>{mins} min</span>
      </div>

      {/* Price */}
      <span className="text-sm font-medium text-[#1A1A1A] shrink-0 w-14 text-right">
        {cita.precio != null ? `${cita.precio} €` : '—'}
      </span>

      {/* Status badge or action buttons */}
      <div className="flex items-center gap-2 shrink-0">
        {isActive && hovered ? (
          <>
            <button
              onClick={() => onCompletar(cita.id)}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-[#D1FAE5] text-[#065F46] hover:bg-[#A7F3D0] transition-colors"
            >
              <CheckCircle2 size={12} />
              Completar
            </button>
            <button
              onClick={() => onCancelar(cita.id)}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FECACA] transition-colors"
            >
              <XCircle size={12} />
              Cancelar
            </button>
          </>
        ) : (
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium',
              estadoBadge.cls
            )}
          >
            {estadoBadge.label}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CitasPage() {
  const { socios, instructores, citas, addCita, completarCita, cancelarCita } = useStudio();
  const [tab, setTab] = useState<'proximas' | 'historial'>('proximas');
  const [filterInstructor, setFilterInstructor] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [form, setForm] = useState({
    socioId: '',
    instructorId: '',
    tipo: 'PRIVADA' as TipoCita,
    fecha: '',
    hora: '',
    duracion: 60,
    precio: '',
    notas: '',
  });

  const now = new Date();

  // Derived counts
  const upcoming = citas.filter(
    (c) => c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA'
  );
  const thisMonth = citas.filter((c) => isSameMonth(c.inicio, now));
  const completadasMes = thisMonth.filter((c) => c.estado === 'COMPLETADA');
  const ingresosMes = completadasMes.reduce((sum, c) => sum + (c.precio ?? 0), 0);

  // Tab filter
  const byTab = citas.filter((c) => {
    if (tab === 'proximas') return c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA';
    return ['COMPLETADA', 'CANCELADA', 'NO_ASISTIO'].includes(c.estado);
  });

  // Instructor filter
  const filtered = byTab
    .filter((c) => filterInstructor === 'all' || c.instructorId === filterInstructor)
    .sort((a, b) => {
      const da = new Date(a.inicio).getTime();
      const db = new Date(b.inicio).getTime();
      return tab === 'proximas' ? da - db : db - da;
    });

  // Lookups
  function getSocio(id: string) {
    return socios.find((s) => s.id === id);
  }
  function getInstructor(id: string) {
    return instructores.find((i) => i.id === id);
  }

  function handleCompletar(id: string) {
    completarCita(id);
  }

  function handleCancelar(id: string) {
    cancelarCita(id);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.socioId || !form.instructorId || !form.fecha || !form.hora) return;

    const inicioDate = new Date(`${form.fecha}T${form.hora}`);
    const finDate = new Date(inicioDate.getTime() + form.duracion * 60000);

    addCita({
      socioId: form.socioId,
      instructorId: form.instructorId,
      tipo: form.tipo,
      inicio: inicioDate.toISOString(),
      fin: finDate.toISOString(),
      notas: form.notas || null,
      estado: 'PENDIENTE',
      precio: form.precio ? parseFloat(form.precio) : null,
    });
    setShowModal(false);
    setForm({
      socioId: '',
      instructorId: '',
      tipo: 'PRIVADA',
      fecha: '',
      hora: '',
      duracion: 60,
      precio: '',
      notas: '',
    });
    setTab('proximas');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A1A]">Citas</h1>
          <p className="text-sm text-[#8E8E86] mt-1">
            {upcoming.length} próximas · {thisMonth.length} este mes
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 bg-[#C6F94D] text-[#171717] rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-[#BCEF3F] transition-colors shrink-0"
        >
          <Plus size={16} />
          Nueva cita
        </button>
      </div>

      {/* Revenue banner */}
      <div className="bg-white border border-[#E7E7E0] rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-[#8E8E86]">
          <CheckCircle2 size={16} className="text-[#059669]" />
          <span>Ingresos completadas este mes</span>
        </div>
        <span className="text-xl font-bold text-[#1A1A1A]">{ingresosMes} €</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-[#E7E7E0] rounded-xl p-1 w-fit">
        {(['proximas', 'historial'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t
                ? 'bg-[#C6F94D] text-[#171717]'
                : 'text-[#8E8E86] hover:text-[#1A1A1A]'
            )}
          >
            {t === 'proximas' ? 'Próximas' : 'Historial'}
          </button>
        ))}
      </div>

      {/* Instructor filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-[#8E8E86]">
          <Filter size={13} />
          <span>Instructor</span>
        </div>
        <button
          onClick={() => setFilterInstructor('all')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            filterInstructor === 'all'
              ? 'bg-[#C6F94D] text-[#171717] border-[#1A1A1A]'
              : 'bg-white border-[#E7E7E0] text-[#8E8E86] hover:text-[#1A1A1A]'
          )}
        >
          Todas
        </button>
        {instructores.map((ins) => (
          <button
            key={ins.id}
            onClick={() => setFilterInstructor(ins.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              filterInstructor === ins.id
                ? 'bg-[#C6F94D] text-[#171717] border-[#1A1A1A]'
                : 'bg-white border-[#E7E7E0] text-[#8E8E86] hover:text-[#1A1A1A]'
            )}
          >
            {ins.nombre}
          </button>
        ))}
      </div>

      {/* Cita list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Calendar size={40} className="text-[#D1D5DB] mb-3" />
            <p className="text-[#8E8E86] text-sm">No hay citas que mostrar</p>
            <p className="text-[#A8A89F] text-xs mt-1">
              Prueba a cambiar el filtro o crear una nueva cita
            </p>
          </div>
        ) : (
          filtered.map((cita) => {
            const socio = getSocio(cita.socioId);
            const instructor = getInstructor(cita.instructorId);
            const socioNombre = socio
              ? `${socio.nombre} ${socio.apellidos}`
              : 'Socio desconocido';
            const socioEmail = socio?.email ?? '';
            const socioInitials = socio
              ? `${socio.nombre[0] ?? ''}${socio.apellidos[0] ?? ''}`
              : '?';
            const instructorNombre = instructor?.nombre ?? 'Instructor desconocido';

            return (
              <CitaCard
                key={cita.id}
                cita={cita}
                socioNombre={socioNombre}
                socioEmail={socioEmail}
                socioInitials={socioInitials}
                instructorNombre={instructorNombre}
                onCompletar={handleCompletar}
                onCancelar={handleCancelar}
              />
            );
          })
        )}
      </div>

      {/* Nueva cita modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1A1A1A]">Nueva cita</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <FF label="Socia">
              <select
                required
                value={form.socioId}
                onChange={(e) => setForm((f) => ({ ...f, socioId: e.target.value }))}
                className={inputCls}
              >
                <option value="">Seleccionar socia...</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} {s.apellidos}
                  </option>
                ))}
              </select>
            </FF>

            <FF label="Instructor">
              <select
                required
                value={form.instructorId}
                onChange={(e) => setForm((f) => ({ ...f, instructorId: e.target.value }))}
                className={inputCls}
              >
                <option value="">Seleccionar instructor...</option>
                {instructores.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </select>
            </FF>

            <FF label="Tipo">
              <select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoCita }))}
                className={inputCls}
              >
                {TIPOS_CITA.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_BADGE[t].label}
                  </option>
                ))}
              </select>
            </FF>

            <div className="grid grid-cols-2 gap-3">
              <FF label="Fecha">
                <input
                  type="date"
                  required
                  value={form.fecha}
                  onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                  className={inputCls}
                />
              </FF>
              <FF label="Hora">
                <input
                  type="time"
                  required
                  value={form.hora}
                  onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                  className={inputCls}
                />
              </FF>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FF label="Duracion">
                <select
                  value={form.duracion}
                  onChange={(e) => setForm((f) => ({ ...f, duracion: Number(e.target.value) }))}
                  className={inputCls}
                >
                  {DURACIONES.map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </FF>
              <FF label="Precio (€)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.precio}
                  onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value }))}
                  className={inputCls}
                />
              </FF>
            </div>

            <FF label="Notas">
              <textarea
                rows={3}
                placeholder="Observaciones opcionales..."
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                className={cn(inputCls, 'resize-none')}
              />
            </FF>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-[#E7E7E0] bg-white text-sm font-medium text-[#8E8E86] hover:text-[#1A1A1A] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#C6F94D] text-[#171717] text-sm font-medium hover:bg-[#BCEF3F] transition-colors"
              >
                Guardar cita
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
