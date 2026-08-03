'use client';

import * as Sentry from '@sentry/nextjs';
import { useState, useMemo, useEffect, useRef, useCallback, useId, isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { useSemaforoRecepcion } from '@/lib/hooks/use-semaforo-recepcion';
import { queImparten } from '@/lib/equipo';
import { useRol, puedeVerFichaClinica, puedeVerSemaforo, puedeGestionarClientas, puedeMoverDinero, puedeCrearClasesPropias } from '@/lib/permisos';
import { semaforo, alertaPreClase, resumenSaludClase, RESPUESTAS_ORDEN, RESPUESTA_META, SEMAFORO_META } from '@/lib/ficha-clinica';
import { authHeader } from '@/lib/api-client';
import type { ReservaEnriquecida, Sesion } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ChevronLeft, ChevronRight, Plus, X, AlertTriangle, RefreshCw,
  CalendarDays, ChevronDown,
  UserPlus, UserCheck, Pencil, Trash2, Copy,
  Bot, Loader2, Upload, QrCode, LayoutGrid, Rows3,
} from 'lucide-react';
import Link from 'next/link';
import { cn, cuandoEstudio, fechaLargaEstudio, horaEstudio } from '@/lib/utils';
import { enviarEmailCancelacionClase, avisarCambioClaseServidor, avisarClaseCancelada, avisarClaseModificada, listarAusencias, type AusenciaInstructora } from '@/lib/api-client';
import { ausenciaEnFecha, sufijoAusencia } from '@/lib/ausencias';
import { detectarConflictos, elegirLibre, hayConflicto, plazasSobrantesTrasAforo, type SlotSesion } from '@/lib/calendar-logic';
import { decidirReservaNueva } from '@/lib/booking-logic';
import { CoberturaDialog } from '@/components/calendario/cobertura-dialog';
import { NoPuedoAsistirDialog } from '@/components/calendario/no-puedo-asistir-dialog';
import { AvisoSinBono, type MotivoSinBono } from '@/components/calendario/aviso-sin-bono';
import { tieneEntitlementActivo } from '@/lib/bono-logic';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { Toast, useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';

// ── Rediseño del Calendario ──────────────────────────────────────────────────
// Composición nueva sobre lib/calendario-*.ts + components/calendario/*
// (Etapas 0-8). Toda la lógica de negocio de esta pantalla (crear/editar/
// cancelar clase, series, cobertura, bonos, ficha clínica/IA, notificaciones)
// se conserva TAL CUAL — el rediseño cambia la arquitectura visual (estado
// derivado, rejilla día-por-sala, franja de decisiones, panel de 3 pestañas,
// datos por rol, filtros que atenúan, layout sin scroll de página), no las
// reglas de negocio ya probadas.
import { LienzoCalendario } from '@/components/calendario/lienzo-calendario';
import { TarjetasMetricas } from '@/components/calendario/tarjetas-metricas';
import { FiltrosCalendario } from '@/components/calendario/filtros-calendario';
import { FranjaDecisiones, type DecisionResumen } from '@/components/calendario/franja-decisiones';
import { DialogoDecision } from '@/components/calendario/dialogo-decision';
import { VistaDiaSalas, type DatoSesion } from '@/components/calendario/vista-dia-salas';
import { VistaSemana } from '@/components/calendario/vista-semana';
import { VistaMes } from '@/components/calendario/vista-mes';
import { BuscadorRapido } from '@/components/calendario/buscador-rapido';
import { PanelSesion, horaTextoSesion, type PestanaSesion } from '@/components/calendario/panel-sesion';
import { estadoSesion, pideDecision, type EstadoSesion } from '@/lib/calendario-estado';
import { prepararColumnasSalaDia, prepararColumnasDiaSemana, type SesionColumna, type SesionSemana } from '@/lib/calendario-columnas';
import { agregarPorDiaMes, type SesionMes, type DiaMes } from '@/lib/calendario-mes';
import { type SesionBuscable } from '@/lib/calendario-busqueda';
import { metricasDia, metricasSemana, mmA } from '@/lib/calendario-metricas';
import { minutosDesdeOffset, nuevoHorarioArrastrado } from '@/lib/calendario-arrastre';
import { decisionesOrdenadas, accionParaEstado, reservasParaPasarLista, type ItemDecision, type TipoAccion } from '@/lib/calendario-decisiones';
import { puedeAjustarAforoASalaCapacidad, motivoAforoBloqueado, preguntaAvisoCobertura } from '@/lib/calendario-acciones';
import { claseAtenuadaPorInstructor } from '@/lib/calendario-filtros';
import { rangoDia, rangoSemana, rangoMes, claveRango, type RangoFechas } from '@/lib/calendario-rango';
import { historialSustituciones } from '@/lib/calendario-historial';
import { enPilotoVoz } from '@/lib/piloto-ficha-viva';
import { ModalNotaVoz } from '@/components/socios/modal-nota-voz';

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

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors';
const selectCls = 'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors appearance-none';

// ─── SesionEnriquecida local type ─────────────────────────────────────────────
// Sigue viva: toda la lógica de formulario/edición/conflictos (existentesSlot,
// detectarConflictos, cobertura...) necesita ver TODO el estudio, no solo lo
// que el rol ve renderizado — igual que antes del rediseño.

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
  serieId?: string | null;
  incidenciaTexto?: string | null;
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
  aforoTocado?: boolean;
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
  duracion: number;
  diasSemana: number[];
  fechaInicio: string;
  fechaFin: string;
  aforoMaximo: number;
  aforoTocado?: boolean;
};

// ─── Aviso de aforo mayor que la sala ─────────────────────────────────────────

function AvisoAforoSala({ salas, salaId, aforo }: {
  salas: { id: string; nombre: string; capacidad: number }[];
  salaId: string;
  aforo: number;
}) {
  const sala = salas.find(s => s.id === salaId);
  if (!sala || !Number.isFinite(aforo) || aforo <= sala.capacidad) return null;
  return (
    <p role="alert" className="mt-1.5 text-[11px] leading-snug text-[var(--warning)]">
      «{sala.nombre}» tiene {sala.capacidad} plaza{sala.capacidad === 1 ? '' : 's'}.
      Con {aforo} estarías vendiendo {aforo - sala.capacidad} más de las que caben.
    </p>
  );
}

// ─── FormField wrapper ────────────────────────────────────────────────────────

function FormField({
  label,
  description,
  children,
}: {
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const { htmlFor, control } = useCampoAsociado(children);
  const descAutoId = useId();
  const idDesc = description ? `${descAutoId}-desc` : undefined;
  const controlDescrito = idDesc && isValidElement(control)
    ? cloneElement(control as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': idDesc })
    : control;

  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-foreground uppercase tracking-wider">{label}</label>
      {description && (
        <p id={idDesc} className="text-xs leading-relaxed text-muted-foreground text-balance">
          {description}
        </p>
      )}
      {controlDescrito}
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

// ─── ModalClasesRecurrentes ───────────────────────────────────────────────────

function ModalClasesRecurrentes({
  open, onClose, tiposClase, instructores, salas, onCrear, sesionesExistentes, ausencias = [],
}: {
  open: boolean;
  onClose: () => void;
  tiposClase: { id: string; nombre: string }[];
  instructores: { id: string; nombre: string }[];
  ausencias?: AusenciaInstructora[];
  salas: { id: string; nombre: string; capacidad: number }[];
  onCrear: (sesiones: Omit<Sesion, 'id' | 'studioId'>[]) => void;
  sesionesExistentes: SlotSesion[];
}) {
  const uid = useId();
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
    aforoMaximo: salas[0]?.capacidad ?? 8,
  });

  const [form, setForm] = useState<RecurringFormData>(emptyForm);
  const duracionInvalida = !form.duracion || form.duracion < 15;

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

  const sesionesGeneradas = useMemo<Omit<Sesion, 'id' | 'studioId'>[]>(() => {
    if (!form.fechaInicio || !form.fechaFin || form.diasSemana.length === 0) return [];
    const start = new Date(form.fechaInicio + 'T00:00:00');
    const end = new Date(form.fechaFin + 'T00:00:00');
    if (start > end) return [];
    const out: Omit<Sesion, 'id' | 'studioId'>[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      if (form.diasSemana.includes(cursor.getDay())) {
        const dateStr = localDate(cursor);
        const inicio = new Date(`${dateStr}T${form.horaInicio}:00`);
        const fin = new Date(inicio.getTime() + form.duracion * 60000);
        out.push({
          tipoClaseId: form.tipoClaseId,
          instructorId: form.instructorId,
          salaId: form.salaId,
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
          aforoMaximo: form.aforoMaximo,
          cancelada: false,
          notas: null,
          precioPuntual: null,
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [form]);

  const estimatedCount = sesionesGeneradas.length;

  const conflictosCount = useMemo(() =>
    sesionesGeneradas.filter(s => hayConflicto(detectarConflictos(
      { salaId: s.salaId, instructorId: s.instructorId, inicio: s.inicio, fin: s.fin },
      sesionesExistentes,
    ))).length,
    [sesionesGeneradas, sesionesExistentes]
  );

  function handleSubmit() {
    if (sesionesGeneradas.length === 0) return;
    onCrear(sesionesGeneradas);
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
          <FormField label="Tipo de clase">
            <select className={s2} value={form.tipoClaseId} onChange={e => setForm(f => ({ ...f, tipoClaseId: e.target.value }))}>
              {tiposClase.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </FormField>
          <FormField label="Instructora">
            <select className={s2} value={form.instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
              {instructores.map(i => { const au = ausenciaEnFecha(ausencias, i.id, form.fechaInicio || new Date()); return <option key={i.id} value={i.id}>{i.nombre}{sufijoAusencia(au)}</option>; })}
            </select>
          </FormField>
          <FormField label="Sala">
            <select className={s2} value={form.salaId} onChange={e => {
              const salaId = e.target.value;
              const cap = salas.find(x => x.id === salaId)?.capacidad;
              setForm(f => ({
                ...f,
                salaId,
                aforoMaximo: f.aforoTocado || cap == null ? f.aforoMaximo : cap,
              }));
            }}>
              {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Hora inicio">
              <input type="time" className={f2} value={form.horaInicio} onChange={e => setForm(f => ({ ...f, horaInicio: e.target.value }))} />
            </FormField>
            <FormField label="Duración (min)">
              <input type="number" min={15} max={300} step={5} className={f2}
                aria-invalid={duracionInvalida}
                value={form.duracion || ''}
                onChange={e => {
                  const bruto = e.target.value;
                  if (bruto === '') { setForm(f => ({ ...f, duracion: 0 })); return; }
                  const n = Number(bruto);
                  setForm(f => ({ ...f, duracion: Number.isNaN(n) ? f.duracion : Math.min(300, n) }));
                }} />
            </FormField>
            {duracionInvalida && (
              <p className="col-span-2 -mt-2 text-xs text-amber-700">Mínimo 15 minutos.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <span id={`${uid}-dias`} className="text-xs font-bold text-foreground uppercase tracking-wider">Días de la semana</span>
            <p className="text-xs leading-relaxed text-muted-foreground text-balance">
              Se creará una clase cada semana en estos días, desde la fecha de inicio hasta la de fin.
            </p>
            <div role="group" aria-labelledby={`${uid}-dias`} className="flex items-center gap-2 flex-wrap">
              {DIA_PILLS.map(({ label, day }) => (
                <DiaPill key={day} label={label} active={form.diasSemana.includes(day)} onClick={() => toggleDia(day)} />
              ))}
            </div>
            {form.diasSemana.length === 0 && <p className="text-xs text-destructive">Selecciona al menos un día</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Fecha inicio">
              <input type="date" className={f2} value={form.fechaInicio} onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
            </FormField>
            <FormField label="Fecha fin">
              <input type="date" className={f2} value={form.fechaFin} onChange={e => setForm(f => ({ ...f, fechaFin: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Aforo máximo" description="Al llenarse, las siguientes reservas entran en lista de espera; no se bloquean.">
            <input type="number" min={1} max={300} className={f2} value={form.aforoMaximo}
              onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value), aforoTocado: true }))} />
          </FormField>
          <AvisoAforoSala salas={salas} salaId={form.salaId} aforo={form.aforoMaximo} />
          {estimatedCount > 0 && (
            <div className="rounded-xl bg-muted px-4 py-3 flex items-center gap-2">
              <CalendarDays size={15} className="text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold text-foreground">Se crearán <span className="font-bold">{estimatedCount}</span> clases</p>
            </div>
          )}
          {conflictosCount > 0 && (
            <div className="rounded-xl bg-warning/10 border border-warning/30 px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={15} className="text-warning shrink-0" />
              <p className="text-sm font-semibold text-warning">
                {conflictosCount} de estas clases se solapan con la sala o la instructora ya programadas.
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted transition-colors">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={form.diasSemana.length === 0 || estimatedCount === 0 || duracionInvalida}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-brand text-brand-foreground hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {estimatedCount > 0 ? `Crear ${estimatedCount} clases` : 'Crear clases'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Datos por rango, desde /api/calendario ──────────────────────────────────
// Separado a propósito de `useStudio()`: ese fetch genérico usa el cliente
// admin y no da forma al payload por rol (punto 6). Esto es SOLO lo que se
// RENDERIZA (rejilla, métricas, franja de decisiones, panel) — todo lo que es
// formulario/edición/conflictos sigue usando el contexto de siempre (más
// abajo), que necesita ver el estudio entero para detectar solapes reales.

interface SustitucionVista {
  id: string; sesionId: string; estado: string; motivo: string | null;
  sustitutaFinalId: string | null; creadoEn: string | null; resueltoEn: string | null;
}

interface DatosVista {
  sesiones: (Sesion & { sustitucionAbierta: boolean; motivoBaja: string | null; sustitucionId: string | null })[];
  reservas: import('@/lib/types').Reserva[];
  sustituciones: SustitucionVista[];
  salas: import('@/lib/types').Sala[];
  instructores: import('@/lib/types').Instructor[];
  horaApertura: string;
  horaCierre: string;
  rol: string;
}

// ─── Main Calendar Page ───────────────────────────────────────────────────────

export default function Calendario() {
  const {
    sesiones, reservas, socios, spots, tiposClase, salas, instructores,
    suscripciones, planesTarifa,
    addSesion, updateSesion, deleteSesion, addSesionesSerie, editarSerieDesde, cancelarSerieDesde,
    addReserva, cancelarReserva, checkin,
    deshacerCheckin, marcarNoShow, revertirNoShow, liberarSpot, asignarSpot,
    addActividadReciente, addRecibo, resetDatosPilates,
  } = useStudio();
  const { user } = useAuth();
  // Un solo sistema de toast (antes había dos en paralelo) — con soporte de
  // Deshacer (punto 4), reutilizado por las 6 acciones de la franja.
  const { message: toastMsg, action: toastAction, show: showToast, dismiss: dismissToast } = useToast();

  const resolverPendiente = useCallback(async (reservaId: string, aprobar: boolean) => {
    try {
      const res = await fetch('/api/reservas/resolver-pendiente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ reservaId, aprobar }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data?.error ?? 'No se pudo procesar la reserva'); return; }
      if (data?.motivoUI === 'clase_ya_empezada') {
        showToast('La clase ya ha comenzado. Esta reserva se ha cancelado automáticamente y ya no puede aprobarse.');
      } else {
        showToast(aprobar ? 'Reserva aprobada' : 'Reserva rechazada');
      }
      resetDatosPilates();
      void refrescarVista();
    } catch {
      showToast('No se pudo procesar la reserva. Revisa tu conexión.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast, resetDatosPilates]);

  const rolActual = useRol();
  const gestionaClientas = puedeGestionarClientas(rolActual);
  const mueveDinero = puedeMoverDinero(rolActual);
  const creaClasesPropias = puedeCrearClasesPropias(rolActual);
  const esInstructorTop = rolActual === 'INSTRUCTOR';
  const yoTop = instructores.find(i => i.authUserId === user?.id) ?? null;

  // ── Hydration guard ─────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  const FALLBACK = new Date('2026-01-01T12:00:00');

  // ── Vista: Día (por sala) / Semana (7 columnas) / Mes — punto 2 del rediseño ─
  const [vista, setVista] = useState<'dia' | 'semana' | 'mes'>('semana');
  const [semana, setSemana] = useState(() => weekStart(FALLBACK));
  const [diaSeleccionado, setDiaSeleccionado] = useState(() => FALLBACK);
  const [mesVisto, setMesVisto] = useState(() => FALLBACK);

  useEffect(() => {
    const today = new Date();
    setMounted(true);
    setSemana(weekStart(today));
    setDiaSeleccionado(today);
    setMesVisto(today);
  }, []);

  const now = mounted ? new Date() : FALLBACK;

  // ── Selection ───────────────────────────────────────────────────────────────
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [pestanaPanel, setPestanaPanel] = useState<PestanaSesion>('clientas');

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState<'nueva' | 'editar' | null>(null);
  const [showRecurrentes, setShowRecurrentes] = useState(false);
  const [showNuevaMenu, setShowNuevaMenu] = useState(false);
  const [showCobertura, setShowCobertura] = useState(false);
  const [showNoPuedoAsistir, setShowNoPuedoAsistir] = useState(false);
  const [ausencias, setAusencias] = useState<AusenciaInstructora[]>([]);
  useEffect(() => { let vivo = true; listarAusencias().then(r => { if (vivo) setAusencias(r); }); return () => { vivo = false; }; }, []);

  // ── Filters (punto 9: sala reduce columnas, instructora atenúa) ─────────────
  const [filtroInstructor, setFiltroInstructor] = useState('');
  const [filtroSala, setFiltroSala] = useState('todas');
  const [busqueda, setBusqueda] = useState('');

  const [guardandoSesion, setGuardandoSesion] = useState(false);
  const [avisoInstructora, setAvisoInstructora] = useState<
    {
      sesionId: string; apuntadas: number; instructora: string;
      datos: { clase: string; cuando: string; sala: string; instructora: string };
      email: { clase: string; fecha: string; hora: string; sala: string; instructora: string; anterior: string };
    } | null
  >(null);
  const [errorSesion, setErrorSesion] = useState<string | null>(null);
  const [avisoSinBono, setAvisoSinBono] = useState<
    { sesionId: string; socioId: string; motivo: MotivoSinBono } | null
  >(null);
  const [confirmarEspera, setConfirmarEspera] = useState<
    { sesionId: string; socioId: string; nombre: string; posicion: number } | null
  >(null);

  // Punto 4: diálogo de confirmación para CUBRIR / OFRECER / AJUSTAR_AFORO.
  const [dialogoAccion, setDialogoAccion] = useState<{ tipo: 'CUBRIR' | 'OFRECER' | 'AJUSTAR_AFORO'; sesionId: string } | null>(null);
  // Reporta una incidencia (necesario para que el estado INCIDENCIA sea
  // alcanzable: sin esto, `incidencia_texto` nunca lo pondría nadie).
  const [dialogoIncidencia, setDialogoIncidencia] = useState<{ sesionId: string; texto: string } | null>(null);

  // ── Form ─────────────────────────────────────────────────────────────────────

  const finSegunDuracion = useCallback((horaInicio: string, tipoClaseId: string): string => {
    const dur = tiposClase.find(t => t.id === tipoClaseId)?.duracionMinutos;
    const [h, m] = horaInicio.split(':').map(Number);
    if (!dur || Number.isNaN(h) || Number.isNaN(m)) return horaInicio;
    const total = h * 60 + m + dur;
    if (total >= 24 * 60) return '23:59';
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }, [tiposClase]);

  const emptyForm = useCallback((): FormData => ({
    tipoClaseId: tiposClase[0]?.id ?? '',
    salaId: salas[0]?.id ?? '',
    instructorId: queImparten(instructores)[0]?.id ?? '',
    fecha: localDate(now),
    horaInicio: '09:00',
    horaFin: tiposClase[0]?.duracionMinutos
      ? `${String(9 + Math.floor(tiposClase[0].duracionMinutos / 60)).padStart(2, '0')}:${String(tiposClase[0].duracionMinutos % 60).padStart(2, '0')}`
      : '10:00',
    aforoMaximo: salas[0]?.capacidad ?? 8,
    notas: '',
    repetir: false,
    repetirSemanas: 4,
  }), [tiposClase, salas, instructores, now]);

  const [form, setForm] = useState<FormData>(() => emptyForm());

  const instructoresActivos = useMemo(() => queImparten(instructores), [instructores]);

  const instructoresForm = useMemo(() => {
    const actual = instructores.find(i => i.id === form.instructorId);
    return actual && !actual.activo ? [actual, ...instructoresActivos] : instructoresActivos;
  }, [instructores, instructoresActivos, form.instructorId]);

  // ── Derived data (contexto completo — formularios/conflictos) ───────────────
  const todayStr = localDate(now);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(semana, i)), [semana]);

  const sesionesEnriquecidas = useMemo<SesionEnr[]>(() => {
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const salasById = new Map(salas.map(x => [x.id, x]));
    const instrById = new Map(instructores.map(i => [i.id, i]));
    const agg = new Map<string, { confirmadas: number; asistidas: number; reservadoIds: string[] }>();
    for (const r of reservas) {
      if (r.estado !== 'CONFIRMADA' && r.estado !== 'ASISTIDA') continue;
      let a = agg.get(r.sesionId);
      if (!a) { a = { confirmadas: 0, asistidas: 0, reservadoIds: [] }; agg.set(r.sesionId, a); }
      a.confirmadas++;
      if (r.estado === 'ASISTIDA') a.asistidas++;
      a.reservadoIds.push(r.socioId);
    }
    return sesiones.map(s => {
      const a = agg.get(s.id);
      return {
        ...s,
        tipoClase: tiposById.get(s.tipoClaseId) ?? { nombre: '?', color: 'var(--muted-foreground)' },
        sala: salasById.get(s.salaId) ?? { nombre: '?' },
        instructor: instrById.get(s.instructorId) ?? { nombre: '?' },
        confirmadas: a?.confirmadas ?? 0,
        asistidas: a?.asistidas ?? 0,
        reservadoIds: a?.reservadoIds ?? [],
      };
    });
  }, [sesiones, reservas, tiposClase, salas, instructores]);

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

  const horaInvalida = !!(showForm && form.horaInicio && form.horaFin && form.horaFin <= form.horaInicio);
  const repetirInvalido = !!(showForm === 'nueva' && form.repetir && (!form.repetirSemanas || form.repetirSemanas < 2));

  const faltaConfigurar = useMemo(() => {
    if (!showForm) return null;
    const faltan: string[] = [];
    if (!form.tipoClaseId) faltan.push(tiposClase.length === 0 ? 'un tipo de clase' : 'elegir el tipo de clase');
    if (!form.salaId) faltan.push(salas.length === 0 ? 'una sala' : 'elegir la sala');
    if (!form.instructorId) faltan.push(instructores.length === 0 ? 'una instructora' : 'elegir la instructora');
    if (faltan.length === 0) return null;
    const sinCrear = (!form.tipoClaseId && tiposClase.length === 0)
      || (!form.salaId && salas.length === 0)
      || (!form.instructorId && instructores.length === 0);
    return { faltan, sinCrear };
  }, [showForm, form.tipoClaseId, form.salaId, form.instructorId, tiposClase.length, salas.length, instructores.length]);

  const existentesSlot = useMemo<SlotSesion[]>(() => sesiones.map(s => ({
    id: s.id, salaId: s.salaId, instructorId: s.instructorId,
    inicio: s.inicio, fin: s.fin, cancelada: s.cancelada,
  })), [sesiones]);

  // ── Buscador rápido (Fase 2): sobre TODO el estudio, no solo `datosVista` —
  // misma regla de visibilidad que filtrarSesionesPorRol (lib/calendario-datos.ts),
  // replicada aquí porque estos datos vienen del contexto completo, no del
  // endpoint ya filtrado por rol.
  const candidatasBusqueda = useMemo<SesionBuscable[]>(() => {
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const salasById = new Map(salas.map(s => [s.id, s]));
    const instrById = new Map(instructores.map(i => [i.id, i]));
    const visibles = esInstructorTop && yoTop ? sesiones.filter(s => s.instructorId === yoTop.id) : sesiones;
    return visibles.map(s => ({
      id: s.id, inicio: s.inicio, cancelada: s.cancelada,
      tipoClaseNombre: tiposById.get(s.tipoClaseId)?.nombre ?? '?',
      salaNombre: salasById.get(s.salaId)?.nombre ?? '?',
      instructorNombre: instrById.get(s.instructorId)?.nombre ?? '?',
    }));
  }, [sesiones, tiposClase, salas, instructores, esInstructorTop, yoTop]);

  function saltarAClase(id: string) {
    const s = sesiones.find(x => x.id === id);
    if (!s) return;
    const inicio = new Date(s.inicio);
    setDiaSeleccionado(inicio);
    setSemana(weekStart(inicio));
    setVista('dia');
    setSesionId(id);
    setPestanaPanel('clientas');
  }

  const conflictosForm = useMemo(() => {
    if (!showForm || !form.fecha || !form.horaInicio || !form.horaFin) return null;
    const inicio = toISO(form.fecha, form.horaInicio);
    const fin = toISO(form.fecha, form.horaFin);
    if (new Date(fin).getTime() <= new Date(inicio).getTime()) return null;
    const c = detectarConflictos(
      { salaId: form.salaId, instructorId: form.instructorId, inicio, fin },
      existentesSlot,
      showForm === 'editar' ? sesionId ?? undefined : undefined,
    );
    return hayConflicto(c) ? c : null;
  }, [showForm, form.fecha, form.horaInicio, form.horaFin, form.salaId, form.instructorId, existentesSlot, sesionId]);

  const aforoSobrante = useMemo(() => {
    if (showForm !== 'editar' || !sesionActual) return 0;
    return plazasSobrantesTrasAforo(sesionActual.confirmadas, form.aforoMaximo);
  }, [showForm, sesionActual, form.aforoMaximo]);

  const nombreSala = (id: string | null) => salas.find(s => s.id === id)?.nombre ?? 'sala';
  const nombreInstructor = (id: string | null) => instructores.find(i => i.id === id)?.nombre ?? 'instructora';

  // ── Calendar navigation ──────────────────────────────────────────────────────
  function cambiarSemana(delta: number) {
    setSemana(prev => addDays(prev, delta * 7));
  }
  function irAHoy() {
    const hoy = new Date();
    setSemana(weekStart(hoy));
    setDiaSeleccionado(hoy);
    setMesVisto(hoy);
  }
  function cambiarDia(delta: number) {
    setDiaSeleccionado(prev => addDays(prev, delta));
  }
  function cambiarMes(delta: number) {
    setMesVisto(prev => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  }
  function onSeleccionarDia(fecha: string) {
    setDiaSeleccionado(new Date(`${fecha}T12:00:00`));
    setSemana(weekStart(new Date(`${fecha}T12:00:00`)));
    setVista('dia');
  }

  // ── Session actions (creación/edición/cancelación — sin cambios de fondo) ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('nueva') === '1') {
      openNueva();
      window.history.replaceState({}, '', '/calendario');
    } else if (params.get('recurrentes') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowRecurrentes(true);
      window.history.replaceState({}, '', '/calendario');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNueva(prefillFecha?: string) {
    const base = emptyForm();
    const fecha = prefillFecha ?? localDate(now);
    const inicio = toISO(fecha, base.horaInicio);
    const fin = toISO(fecha, base.horaFin);
    const salaId = elegirLibre(salas.map(s => s.id), 'salaId', inicio, fin, existentesSlot);
    setForm({
      ...base,
      fecha,
      salaId,
      instructorId: esInstructorTop && yoTop ? yoTop.id : elegirLibre(instructoresActivos.map(i => i.id), 'instructorId', inicio, fin, existentesSlot),
      aforoMaximo: salas.find(s => s.id === salaId)?.capacidad ?? base.aforoMaximo,
    });
    setErrorSesion(null);
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

  // Duplicar: mismo tipo/sala/instructora/aforo, +7 días (nunca el mismo
  // instante — chocaría consigo misma). Nace como clase suelta: sin notas
  // (son de la instancia de origen, no de la plantilla) y sin precio puntual
  // ni serie (emptyForm/crearSesion no llevan esos campos).
  function openDuplicar(origen: SesionEnr) {
    const ini = new Date(origen.inicio);
    const fin = new Date(origen.fin);
    setForm({
      tipoClaseId: origen.tipoClaseId,
      salaId: origen.salaId,
      instructorId: origen.instructorId,
      fecha: localDate(addDays(ini, 7)),
      horaInicio: `${String(ini.getHours()).padStart(2, '0')}:${String(ini.getMinutes()).padStart(2, '0')}`,
      horaFin: `${String(fin.getHours()).padStart(2, '0')}:${String(fin.getMinutes()).padStart(2, '0')}`,
      aforoMaximo: origen.aforoMaximo,
      notas: '',
      repetir: false,
      repetirSemanas: 4,
    });
    setErrorSesion(null);
    setShowForm('nueva');
  }

  async function crearSesion() {
    if (horaInvalida || faltaConfigurar || repetirInvalido || guardandoSesion) return;
    const semanas = form.repetir ? form.repetirSemanas : 1;
    setGuardandoSesion(true);
    setErrorSesion(null);

    const aCrear = Array.from({ length: semanas }, (_, i) => {
      const base = new Date(`${form.fecha}T${form.horaInicio}:00`);
      base.setDate(base.getDate() + i * 7);
      return {
        tipoClaseId: form.tipoClaseId,
        salaId: form.salaId,
        instructorId: form.instructorId,
        inicio: toISO(localDate(base), form.horaInicio),
        fin: toISO(localDate(base), form.horaFin),
        aforoMaximo: form.aforoMaximo,
        cancelada: false,
        notas: form.notas || null,
        precioPuntual: null,
      };
    });

    const res = semanas > 1
      ? await addSesionesSerie(aCrear)
      : await addSesion(aCrear[0]);
    if (!res.ok) {
      setGuardandoSesion(false);
      setErrorSesion(res.error);
      return;
    }
    const creadas = semanas;
    setGuardandoSesion(false);

    const semanaDeLaClase = weekStart(new Date(`${form.fecha}T12:00:00`));
    const otraSemana = localDate(semanaDeLaClase) !== localDate(semana);
    if (otraSemana) {
      // NO llamar aquí a refrescarVista(): sigue cerrado sobre el `rango` de
      // ANTES de este setSemana (React no re-renderiza síncronamente), así que
      // pediría la semana vieja — que no tiene la clase nueva — y esa
      // respuesta podía llegar DESPUÉS del refetch correcto disparado por el
      // efecto de claveVista, pisando la rejilla con datos obsoletos (bug: la
      // clase aparece, desaparece y vuelve a aparecer). Solo hace falta
      // invalidar la caché de la semana destino (por si ya se había visitado
      // antes de crear la clase) — el cambio de `semana` de abajo ya dispara
      // el fetch correcto vía el efecto de claveVista.
      cacheVistaRef.current.delete(claveRango(rangoSemana(semanaDeLaClase)));
      setSemana(semanaDeLaClase);
    } else {
      void refrescarVista();
    }
    setDiaSeleccionado(new Date(`${form.fecha}T12:00:00`));

    const cuantas = semanas > 1 ? `Serie creada · ${creadas} clases` : 'Clase creada';
    showToast(otraSemana ? `${cuantas} — te llevo a esa semana` : cuantas);
    setShowForm(null);
  }

  function cuantasApuntadas(id: string): number {
    return reservas.filter(r => r.sesionId === id && r.estado === 'CONFIRMADA').length;
  }

  async function avisarCambioInstructora(aviso: NonNullable<typeof avisoInstructora>) {
    showToast('Avisando…');
    const r = await avisarCambioClaseServidor(aviso.sesionId, {
      clase: aviso.datos.clase, cuando: aviso.datos.cuando, sala: aviso.datos.sala,
      instructora: aviso.datos.instructora, instructorActual: aviso.datos.instructora,
      fecha: aviso.email.fecha, hora: aviso.email.hora, instructorAnterior: aviso.email.anterior,
    });
    if (!r) { showToast('No se ha podido avisar. Inténtalo otra vez.'); return; }

    const faltan = r.sinEmail > 0 ? ` · ${r.sinEmail} sin email guardado` : '';
    if (r.enviados > 0) {
      showToast(`Avisada${r.enviados !== 1 ? 's' : ''} ${r.enviados} clienta${r.enviados !== 1 ? 's' : ''} por email${faltan}`);
    } else if (r.enApp > 0) {
      showToast(`Aviso puesto en la app${faltan}`);
    } else {
      showToast('No se ha podido avisar. Inténtalo otra vez.');
    }
  }

  async function avisarCambioHorarioSala(
    sesionId: string,
    datos: {
      clase: string; cuando: string; d: Date; sala: string;
      instructora: string; instructorActual: string; instructorAnterior?: string;
    },
    opts: { cambioHora: boolean; cambioSala: boolean },
  ) {
    await avisarCambioClaseServidor(sesionId, {
      clase: datos.clase, cuando: datos.cuando, sala: datos.sala,
      instructora: datos.instructora, instructorActual: datos.instructorActual,
      fecha: fechaLargaEstudio(datos.d), hora: horaEstudio(datos.d), instructorAnterior: datos.instructorAnterior ?? '',
      cambioHora: opts.cambioHora, cambioSala: opts.cambioSala,
    });
  }

  async function editarSesion() {
    if (!sesionId || horaInvalida || guardandoSesion) return;
    setGuardandoSesion(true);
    try {
    const nuevoInicio = toISO(form.fecha, form.horaInicio);
    const mismoInstante = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
    const cambioHora = !!sesionActual && !mismoInstante(sesionActual.inicio, nuevoInicio);
    const cambioSala = !!sesionActual && sesionActual.salaId !== form.salaId;
    const cambioInstructora = !!sesionActual && sesionActual.instructorId !== form.instructorId;
    const guardado = await updateSesion(sesionId, {
      tipoClaseId: form.tipoClaseId,
      salaId: form.salaId,
      instructorId: form.instructorId,
      inicio: nuevoInicio,
      fin: toISO(form.fecha, form.horaFin),
      aforoMaximo: form.aforoMaximo,
      notas: form.notas || null,
    });
    if (!guardado.ok) { showToast(guardado.error); return; }
    const apuntadas = cuantasApuntadas(sesionId);

    if (sesionActual && (cambioHora || cambioSala || cambioInstructora)) {
      const d = new Date(nuevoInicio);
      const cuando = cuandoEstudio(d);
      const clase = tiposClase.find(t => t.id === form.tipoClaseId)?.nombre ?? sesionActual.tipoClase.nombre;
      const sala = salas.find(s => s.id === form.salaId)?.nombre ?? '';
      const instructora = cambioInstructora ? (instructores.find(x => x.id === form.instructorId)?.nombre ?? '') : '';
      const datos = { clase, cuando, sala, instructora };

      if (cambioInstructora && !cambioHora && !cambioSala) {
        setAvisoInstructora({
          sesionId, apuntadas, instructora, datos,
          email: {
            clase, sala, instructora,
            fecha: fechaLargaEstudio(d), hora: horaEstudio(d),
            anterior: nombreInstructor(sesionActual.instructorId),
          },
        });
      } else {
        void avisarCambioHorarioSala(
          sesionId,
          {
            clase, cuando, d, sala,
            instructora,
            instructorActual: instructores.find(x => x.id === form.instructorId)?.nombre ?? nombreInstructor(sesionActual.instructorId),
            instructorAnterior: cambioInstructora ? nombreInstructor(sesionActual.instructorId) : undefined,
          },
          { cambioHora, cambioSala },
        );
      }
    }
    setShowForm(null);
    showToast('Clase actualizada');
    void refrescarVista();
    } finally {
      setGuardandoSesion(false);
    }
  }

  async function asignarSustituta(nuevoInstructorId: string) {
    if (!sesionActual) return;
    const anterior = nombreInstructor(sesionActual.instructorId);
    const nueva = nombreInstructor(nuevoInstructorId);
    const guardado = await updateSesion(sesionActual.id, { instructorId: nuevoInstructorId });
    if (!guardado.ok) { showToast(guardado.error); return; }
    addActividadReciente(
      'SESION_REASIGNADA',
      `Clase de ${sesionActual.tipoClase.nombre} (${formatHora(sesionActual.inicio)}) reasignada: ${anterior} → ${nueva}`,
    );

    const apuntadas = cuantasApuntadas(sesionActual.id);
    if (apuntadas > 0) {
      setAvisoInstructora({
        sesionId: sesionActual.id,
        apuntadas,
        instructora: nueva,
        datos: {
          clase: sesionActual.tipoClase.nombre,
          cuando: cuandoEstudio(new Date(sesionActual.inicio)),
          sala: sesionActual.sala?.nombre ?? '',
          instructora: nueva,
        },
        email: {
          clase: sesionActual.tipoClase.nombre,
          fecha: fechaLargaEstudio(new Date(sesionActual.inicio)),
          hora: horaEstudio(new Date(sesionActual.inicio)),
          sala: sesionActual.sala?.nombre ?? '',
          instructora: nueva,
          anterior,
        },
      });
    }

    setShowCobertura(false);
    showToast(`Sustituta asignada: ${nueva}`);
    void refrescarVista();
  }

  async function editarSerie() {
    if (!sesionId || horaInvalida || guardandoSesion) return;
    setGuardandoSesion(true);
    try {
    const n = sesionesEnriquecidas.filter(s => {
      const base = sesionesEnriquecidas.find(x => x.id === sesionId);
      return base?.serieId && s.serieId === base.serieId && s.inicio >= base.inicio;
    }).length;
    const guardado = await editarSerieDesde(sesionId, {
      tipoClaseId: form.tipoClaseId,
      salaId: form.salaId,
      instructorId: form.instructorId,
      aforoMaximo: form.aforoMaximo,
      notas: form.notas || null,
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
    });
    if (!guardado.ok) { showToast(guardado.error); return; }
    if (guardado.count != null && guardado.count !== n) {
      Sentry.captureMessage('[calendario] editar_serie_desde: filas afectadas no coinciden con las esperadas', {
        level: 'warning', tags: { area: 'calendario', tipo: 'conflicto_edicion' },
        extra: { sesionId, esperadas: n, afectadas: guardado.count },
      });
      showToast(`Serie actualizada · ${guardado.count} de ${n} clases (alguien más tocó la serie mientras editabas — revisa el calendario)`);
      setShowForm(null);
      void refrescarVista();
      return;
    }
    const base = sesionesEnriquecidas.find(x => x.id === sesionId);
    if (base?.serieId) {
      const clase = tiposClase.find(t => t.id === form.tipoClaseId)?.nombre ?? base.tipoClase.nombre;
      const salaNombre = salas.find(s => s.id === form.salaId)?.nombre ?? '';
      for (const s of sesionesEnriquecidas) {
        if (s.serieId !== base.serieId || s.inicio < base.inicio) continue;
        const nuevoInicioS = toISO(localDate(new Date(s.inicio)), form.horaInicio);
        if (s.inicio === nuevoInicioS && s.salaId === form.salaId) continue;
        const d = new Date(nuevoInicioS);
        const cuando = cuandoEstudio(d);
        void avisarClaseModificada(s.id, { clase, cuando, sala: salaNombre });
      }
    }
    setShowForm(null);
    showToast(`Serie actualizada · ${n} clases`);
    void refrescarVista();
    } finally {
      setGuardandoSesion(false);
    }
  }

  async function cancelarSesion() {
    if (!sesionId) return;
    const guardado = await updateSesion(sesionId, { cancelada: true });
    if (!guardado.ok) { showToast(guardado.error); return; }
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    if (sesion) {
      const inicio = new Date(sesion.inicio);
      const fecha = fechaLargaEstudio(inicio);
      const hora = horaEstudio(inicio);
      reservas
        .filter(r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'))
        .forEach(r => {
          const socia = socios.find(s => s.id === r.socioId);
          if (!socia?.email) return;
          enviarEmailCancelacionClase({
            to: socia.email,
            toName: socia.nombre,
            claseNombre: sesion.tipoClase.nombre,
            fecha, hora,
            sala: sesion.sala.nombre,
            instructor: sesion.instructor.nombre,
          });
        });
    }
    void avisarClaseCancelada(sesionId);
    setSesionId(null);
    showToast('Clase cancelada · clientas avisadas');
    void refrescarVista();
  }

  async function cancelarSerie() {
    if (!sesionId) return;
    const n = sesionesEnriquecidas.filter(s => {
      const base = sesionesEnriquecidas.find(x => x.id === sesionId);
      return base?.serieId && s.serieId === base.serieId && s.inicio >= base.inicio && !s.cancelada;
    }).length;
    const guardado = await cancelarSerieDesde(sesionId);
    if (!guardado.ok) { showToast(guardado.error); return; }
    setSesionId(null);
    showToast(`Serie cancelada · ${n} clases · clientas avisadas`);
    void refrescarVista();
  }

  function eliminarSesion() {
    if (!sesionId) return;
    deleteSesion(sesionId);
    setSesionId(null);
    showToast('Clase eliminada');
    void refrescarVista();
  }

  async function crearClasesRecurrentes(sesionesFields: Omit<Sesion, 'id' | 'studioId'>[]) {
    const res = await addSesionesSerie(sesionesFields);
    if (!res.ok) { showToast(`No se ha creado la serie. ${res.error}`); return; }
    showToast(`Serie creada · ${sesionesFields.length} clases`);
    setShowRecurrentes(false);
    void refrescarVista();
  }

  function handleAddReserva(sesionId: string, socioId: string) {
    const hoyISO = new Date().toISOString().slice(0, 10);
    const tipoDeLaClase = sesiones.find(s => s.id === sesionId)?.tipoClaseId ?? null;
    if (!tieneEntitlementActivo(socioId, suscripciones, planesTarifa, hoyISO, tipoDeLaClase)) {
      const tieneAlguno = tieneEntitlementActivo(socioId, suscripciones, planesTarifa, hoyISO);
      setAvisoSinBono({ sesionId, socioId, motivo: tieneAlguno ? 'tipo-no-cubierto' : 'sin-bono' });
      return;
    }
    anadirOPreguntarEspera(sesionId, socioId);
  }

  function anadirOPreguntarEspera(sesionId: string, socioId: string) {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    const { estado, posicionEspera } = decidirReservaNueva(sesion?.aforoMaximo, sesionId, reservas);
    if (estado === 'LISTA_ESPERA') {
      const socio = socios.find(s => s.id === socioId);
      setConfirmarEspera({
        sesionId, socioId,
        nombre: socio ? `${socio.nombre} ${socio.apellidos}`.trim() : 'Esta clienta',
        posicion: posicionEspera ?? 1,
      });
      return;
    }
    confirmarAddReserva(sesionId, socioId);
  }

  function confirmarAddReserva(sesionId: string, socioId: string) {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    const socio = socios.find(s => s.id === socioId);
    const nombre = socio ? socio.nombre : 'La clienta';
    const { estado, posicionEspera } = decidirReservaNueva(sesion?.aforoMaximo, sesionId, reservas);
    void addReserva(sesionId, socioId);
    showToast(estado === 'LISTA_ESPERA'
      ? `Clase llena — ${nombre} va a lista de espera (nº ${posicionEspera})`
      : `${nombre} añadida a la clase`);
    void refrescarVista();
  }

  const precioSueltaDe = (sesionId: string): number | null => {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    return sesion?.precioPuntual ?? planesTarifa.find(p => p.tipo === 'PUNTUAL')?.precio ?? null;
  };

  function handleCobrarSuelta() {
    if (!avisoSinBono) return;
    const { sesionId, socioId } = avisoSinBono;
    const precio = precioSueltaDe(sesionId);
    if (precio != null && precio > 0) {
      addRecibo({ socioId, suscripcionId: null, concepto: 'Clase suelta', importe: precio, fechaVencimiento: new Date().toISOString().slice(0, 10) });
    }
    anadirOPreguntarEspera(sesionId, socioId);
    setAvisoSinBono(null);
    showToast(precio ? 'Clase suelta cobrada (recibo pendiente) y clienta añadida' : 'Clienta añadida');
  }

  function handleCortesiaSinBono() {
    if (!avisoSinBono) return;
    const { sesionId, socioId } = avisoSinBono;
    const socio = socios.find(s => s.id === socioId);
    const nombre = socio ? `${socio.nombre} ${socio.apellidos}` : 'La clienta';
    confirmarAddReserva(sesionId, socioId);
    addActividadReciente('NUEVA_RESERVA', `Cortesía · ${nombre} añadida sin bono (sin cargo)`, socioId);
    setAvisoSinBono(null);
  }

  // ── Rediseño: datos de vista (rejilla/métricas/franja/panel) por rango+rol ──
  const [datosVista, setDatosVista] = useState<DatosVista | null>(null);
  const cacheVistaRef = useRef<Map<string, DatosVista>>(new Map());
  // Guarda contra la carrera entre dos fetches de rangos distintos en vuelo a
  // la vez (p. ej. refrescarVista() del rango viejo + el efecto de claveVista
  // para el rango nuevo, disparados casi a la vez al crear una clase que cae
  // en otra semana): solo se aplica la respuesta si su rango sigue siendo el
  // último que se pidió — si no, quien responda último no debería "ganar".
  const ultimaClaveSolicitadaRef = useRef<string>('');

  const rango: RangoFechas = vista === 'dia' ? rangoDia(diaSeleccionado)
    : vista === 'mes' ? rangoMes(mesVisto)
    : rangoSemana(semana);
  const claveVista = claveRango(rango);

  const cargarDatosVista = useCallback(async (r: RangoFechas) => {
    const clave = claveRango(r);
    ultimaClaveSolicitadaRef.current = clave;
    const cacheado = cacheVistaRef.current.get(clave);
    if (cacheado) { setDatosVista(cacheado); return; }
    try {
      const res = await fetch(`/api/calendario?desde=${encodeURIComponent(r.desde)}&hasta=${encodeURIComponent(r.hasta)}`, {
        headers: await authHeader(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as DatosVista;
      // Defensa ante un payload incompleto (mock de test a medio configurar, o
      // una respuesta real inesperada): sin `sesiones`/`horaApertura` la rejilla
      // reventaría al leer `horaApertura.slice(...)`. Mejor seguir "Cargando…".
      if (!Array.isArray(data?.sesiones) || typeof data?.horaApertura !== 'string') return;
      cacheVistaRef.current.set(clave, data);
      if (ultimaClaveSolicitadaRef.current !== clave) return; // respuesta obsoleta, se descarta
      setDatosVista(data);
    } catch {
      // Silencioso: la rejilla se queda con lo último cargado en vez de romper la pantalla.
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void cargarDatosVista(rango);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, claveVista, cargarDatosVista]);

  // Tras cualquier mutación: invalida la caché del rango actual y vuelve a
  // pedirlo — mismo patrón que ya usaba resolverPendiente con resetDatosPilates.
  const refrescarVista = useCallback(async () => {
    cacheVistaRef.current.delete(claveRango(rango));
    await cargarDatosVista(rango);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango.desde, rango.hasta, cargarDatosVista]);

  // ── Estado derivado por sesión (punto 1) ────────────────────────────────────
  const estadoPorSesion = useMemo(() => {
    const m = new Map<string, EstadoSesion>();
    if (!datosVista) return m;
    for (const s of datosVista.sesiones) {
      const conflicto = hayConflicto(detectarConflictos(
        { salaId: s.salaId, instructorId: s.instructorId, inicio: s.inicio, fin: s.fin },
        existentesSlot, s.id,
      ));
      const confirmadasSinCheckin = datosVista.reservas.filter(r =>
        r.sesionId === s.id && r.estado === 'CONFIRMADA' && !r.checkInEn).length;
      m.set(s.id, estadoSesion(s, now, {
        sustitucionAbierta: s.sustitucionAbierta, conflicto, confirmadasSinCheckin,
      }));
    }
    return m;
  }, [datosVista, existentesSlot, now]);

  const reservasPorSesion = useMemo(() => {
    const m = new Map<string, import('@/lib/types').Reserva[]>();
    if (!datosVista) return m;
    for (const r of datosVista.reservas) {
      const arr = m.get(r.sesionId) ?? [];
      arr.push(r);
      m.set(r.sesionId, arr);
    }
    return m;
  }, [datosVista]);

  // ── Filtro por sala (reduce), instructora (atenúa) + búsqueda ───────────────
  const sesionesVistaFiltradas = useMemo(() => {
    if (!datosVista) return [];
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const salasById = new Map(datosVista.salas.map(s => [s.id, s]));
    const instrById = new Map(datosVista.instructores.map(i => [i.id, i]));
    return datosVista.sesiones.filter(s => {
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const tc = tiposById.get(s.tipoClaseId)?.nombre ?? '';
        const sa = salasById.get(s.salaId)?.nombre ?? '';
        const ins = instrById.get(s.instructorId)?.nombre ?? '';
        if (!tc.toLowerCase().includes(q) && !sa.toLowerCase().includes(q) && !ins.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [datosVista, busqueda, tiposClase]);

  const datosPorSesionId = useMemo(() => {
    const m = new Map<string, DatoSesion>();
    if (!datosVista) return m;
    const tiposById = new Map(tiposClase.map(t => [t.id, t]));
    const instrById = new Map(datosVista.instructores.map(i => [i.id, i]));
    for (const s of sesionesVistaFiltradas) {
      m.set(s.id, {
        sesion: s,
        tipo: tiposById.get(s.tipoClaseId) ?? { id: s.tipoClaseId, studioId: s.studioId, nombre: '?', color: '#999' } as import('@/lib/types').TipoClase,
        instructor: instrById.get(s.instructorId) ?? null,
        reservasSesion: reservasPorSesion.get(s.id) ?? [],
        estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA',
      });
    }
    return m;
  }, [sesionesVistaFiltradas, reservasPorSesion, estadoPorSesion, tiposClase, datosVista]);

  const atenuada = useCallback((d: DatoSesion) => claseAtenuadaPorInstructor(d.sesion.instructorId, filtroInstructor), [filtroInstructor]);

  // ── Columnas (Día por sala / Semana 7 columnas) ─────────────────────────────
  const columnasDia = useMemo(() => {
    if (!datosVista) return [];
    const cols: SesionColumna[] = sesionesVistaFiltradas
      .filter(s => localDate(s.inicio) === localDate(diaSeleccionado))
      .map(s => {
        const r = reservasPorSesion.get(s.id) ?? [];
        return {
          id: s.id,
          inicioMin: new Date(s.inicio).getHours() * 60 + new Date(s.inicio).getMinutes(),
          finMin: new Date(s.fin).getHours() * 60 + new Date(s.fin).getMinutes(),
          salaId: s.salaId,
          estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA',
          confirmadas: r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length,
          enEspera: r.filter(x => x.estado === 'LISTA_ESPERA').length,
          aforoMaximo: s.aforoMaximo,
        };
      });
    return prepararColumnasSalaDia(cols, datosVista.salas, filtroSala);
  }, [datosVista, sesionesVistaFiltradas, diaSeleccionado, reservasPorSesion, estadoPorSesion, filtroSala]);

  const columnasSemana = useMemo(() => {
    if (!datosVista) return [];
    const porSala = filtroSala === 'todas' ? sesionesVistaFiltradas : sesionesVistaFiltradas.filter(s => s.salaId === filtroSala);
    const cols: SesionSemana[] = porSala.map(s => {
      const r = reservasPorSesion.get(s.id) ?? [];
      const d = new Date(s.inicio).getDay();
      return {
        id: s.id,
        inicioMin: new Date(s.inicio).getHours() * 60 + new Date(s.inicio).getMinutes(),
        finMin: new Date(s.fin).getHours() * 60 + new Date(s.fin).getMinutes(),
        salaId: s.salaId,
        estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA',
        confirmadas: r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length,
        enEspera: r.filter(x => x.estado === 'LISTA_ESPERA').length,
        aforoMaximo: s.aforoMaximo,
        dia: d === 0 ? 6 : d - 1,
      };
    });
    return prepararColumnasDiaSemana(cols);
  }, [datosVista, sesionesVistaFiltradas, reservasPorSesion, estadoPorSesion, filtroSala]);

  // ── Vista de Mes: agregación por día, no por hora (Fase 2) ─────────────────
  const diasMes = useMemo(() => {
    if (!datosVista) return new Map<string, DiaMes>();
    const salasById = new Map(datosVista.salas.map(s => [s.id, s]));
    const sesiones: SesionMes[] = sesionesVistaFiltradas.map(s => {
      const r = reservasPorSesion.get(s.id) ?? [];
      const confirmadas = r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length;
      const enEspera = r.filter(x => x.estado === 'LISTA_ESPERA').length;
      const estado = estadoPorSesion.get(s.id) ?? 'PROGRAMADA';
      const sala = salasById.get(s.salaId);
      const sobreaforo = sala ? Math.max(0, s.aforoMaximo - sala.capacidad) : 0;
      const huecosLibres = Math.max(0, s.aforoMaximo - confirmadas);
      return {
        id: s.id,
        fecha: localDate(s.inicio),
        confirmadas,
        aforoMaximo: s.aforoMaximo,
        cancelada: s.cancelada,
        pideAtencion: pideDecision(estado, { enEspera, sobreaforo, huecosLibres }),
      };
    });
    return agregarPorDiaMes(sesiones);
  }, [datosVista, sesionesVistaFiltradas, reservasPorSesion, estadoPorSesion]);

  // ── Métricas (punto 8: hablan de lo que se está mirando) ────────────────────
  const tarjetas = useMemo(() => {
    if (!datosVista) return [];
    if (vista === 'dia') {
      const deHoy = sesionesVistaFiltradas.filter(s => localDate(s.inicio) === localDate(diaSeleccionado));
      const esHoyReal = localDate(diaSeleccionado) === todayStr;
      const ahoraMin = now.getHours() * 60 + now.getMinutes();
      const base = deHoy.map(s => {
        const r = reservasPorSesion.get(s.id) ?? [];
        const tc = tiposClase.find(t => t.id === s.tipoClaseId);
        const sala = datosVista.salas.find(x => x.id === s.salaId);
        return {
          estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA' as EstadoSesion,
          inicioMin: new Date(s.inicio).getHours() * 60 + new Date(s.inicio).getMinutes(),
          finMin: new Date(s.fin).getHours() * 60 + new Date(s.fin).getMinutes(),
          nombre: tc?.nombre ?? '?', lugar: sala?.nombre ?? '?',
          confirmadas: r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length,
          aforoMaximo: s.aforoMaximo,
        };
      });
      return esHoyReal ? metricasDia(base, ahoraMin) : metricasSemana(base, false);
    }
    const base = sesionesVistaFiltradas.map(s => {
      const r = reservasPorSesion.get(s.id) ?? [];
      return {
        estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA' as EstadoSesion,
        confirmadas: r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length,
        aforoMaximo: s.aforoMaximo,
      };
    });
    // I-8: "esta semana" solo si la semana visible incluye hoy — mismo criterio que el StatsBar viejo.
    return metricasSemana(base, dias.some(d => localDate(d) === todayStr));
  }, [datosVista, vista, sesionesVistaFiltradas, diaSeleccionado, todayStr, now, reservasPorSesion, estadoPorSesion, tiposClase, dias]);

  // ── Franja de decisiones (puntos 3 y 4) ─────────────────────────────────────
  const [indiceDecision, setIndiceDecision] = useState(0);
  const itemsDecision = useMemo<(ItemDecision & { id: string })[]>(() => {
    if (!datosVista) return [];
    return sesionesVistaFiltradas.map(s => {
      const r = reservasPorSesion.get(s.id) ?? [];
      const confirmadas = r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length;
      const enEspera = r.filter(x => x.estado === 'LISTA_ESPERA').length;
      const sala = datosVista.salas.find(x => x.id === s.salaId);
      const d = new Date(s.inicio);
      const dia = d.getDay() === 0 ? 6 : d.getDay() - 1;
      return {
        id: s.id, sesionId: s.id,
        estado: estadoPorSesion.get(s.id) ?? 'PROGRAMADA',
        dia: vista === 'semana' ? dia : 0,
        inicioMin: d.getHours() * 60 + d.getMinutes(),
        enEspera,
        sobreaforo: sala ? Math.max(0, s.aforoMaximo - sala.capacidad) : 0,
        huecosLibres: Math.max(0, s.aforoMaximo - confirmadas),
      };
    });
  }, [datosVista, sesionesVistaFiltradas, reservasPorSesion, estadoPorSesion, vista]);

  const decisiones = useMemo(() => decisionesOrdenadas(itemsDecision), [itemsDecision]);

  const decisionesResumen = useMemo<DecisionResumen[]>(() => {
    if (!datosVista) return [];
    return decisiones.map(it => {
      const s = datosVista.sesiones.find(x => x.id === it.sesionId);
      const tc = s ? tiposClase.find(t => t.id === s.tipoClaseId) : null;
      const horaCorta = s ? horaEstudio(s.inicio) : '';
      const p = estadoPorSesion.get(it.sesionId);
      const etiqueta = p === 'SIN_INSTRUCTORA' ? 'sin instructora'
        : p === 'INCIDENCIA' ? 'incidencia'
        : p === 'CONFLICTO' ? 'conflicto de sala'
        : p === 'SIN_PASAR_LISTA' ? 'falta pasar lista'
        : it.sobreaforo > 0 ? 'sobreaforo'
        : 'lista de espera con hueco libre';
      return { sesionId: it.sesionId, horaCorta, resumen: `${horaCorta} · ${tc?.nombre ?? 'Clase'} · ${etiqueta}` };
    });
  }, [decisiones, datosVista, tiposClase, estadoPorSesion]);

  useEffect(() => { setIndiceDecision(0); }, [decisiones.length]);

  function accionParaSesion(sesionId: string): TipoAccion | null {
    const it = itemsDecision.find(i => i.sesionId === sesionId);
    if (!it) return null;
    return accionParaEstado(it.estado, { enEspera: it.enEspera, sobreaforo: it.sobreaforo, huecosLibres: it.huecosLibres });
  }

  // "Mejor candidata" para CUBRIR: primera instructora activa sin ausencia ni
  // solape a esa hora (elegirLibre) — la RPC re-valida solape real antes de
  // confirmar, así que un acierto parcial aquí nunca cuela una sustituta ocupada.
  function candidataParaSustitucion(s: { instructorId: string; inicio: string; fin: string }) {
    const candidatos = instructoresActivos
      .filter(i => i.id !== s.instructorId)
      .filter(i => !ausenciaEnFecha(ausencias, i.id, s.inicio))
      .map(i => i.id);
    if (candidatos.length === 0) return null;
    const libreId = elegirLibre(candidatos, 'instructorId', s.inicio, s.fin, existentesSlot);
    return instructoresActivos.find(i => i.id === libreId) ?? null;
  }

  // ── Las 6 acciones con nombre propio (punto 4) ──────────────────────────────

  async function ejecutarCubrir(sesionId: string, instructorId: string) {
    const s = datosVista?.sesiones.find(x => x.id === sesionId);
    if (!s?.sustitucionId) return;
    const prevInstructorId = s.instructorId;
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ action: 'confirmar', sustitucionId: s.sustitucionId, instructorId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data?.error ?? 'No se ha podido cubrir la clase'); return; }
    setDialogoAccion(null);
    await refrescarVista();
    showToast(`Clase cubierta con ${nombreInstructor(instructorId)}`, {
      texto: 'Deshacer',
      onClick: async () => { await updateSesion(sesionId, { instructorId: prevInstructorId }); await refrescarVista(); },
    });
  }

  async function ejecutarPasarLista(sesionId: string) {
    const reservasSesion = reservasPorSesion.get(sesionId) ?? [];
    const ids = reservasParaPasarLista(reservasSesion.map(r => ({ id: r.id, estado: r.estado, checkInEn: r.checkInEn })));
    if (ids.length === 0) return;
    for (const id of ids) checkin(id);
    await refrescarVista();
    showToast(`Lista pasada · ${ids.length} clienta${ids.length !== 1 ? 's' : ''} marcada${ids.length !== 1 ? 's' : ''}`, {
      texto: 'Deshacer',
      onClick: async () => { for (const id of ids) deshacerCheckin(id); await refrescarVista(); },
    });
  }

  function abrirIncidencia(sesionId: string) {
    const actual = datosVista?.sesiones.find(s => s.id === sesionId)?.incidenciaTexto ?? '';
    setDialogoIncidencia({ sesionId, texto: actual ?? '' });
  }

  async function guardarIncidencia() {
    if (!dialogoIncidencia) return;
    const { sesionId, texto } = dialogoIncidencia;
    setDialogoIncidencia(null);
    const guardado = await updateSesion(sesionId, { incidenciaTexto: texto.trim() || null });
    if (!guardado.ok) { showToast(guardado.error); return; }
    await refrescarVista();
    showToast(texto.trim() ? 'Incidencia registrada' : 'Incidencia borrada');
  }

  async function ejecutarResolverIncidencia(sesionId: string) {
    const prevTexto = datosVista?.sesiones.find(s => s.id === sesionId)?.incidenciaTexto ?? null;
    const guardado = await updateSesion(sesionId, { incidenciaTexto: null });
    if (!guardado.ok) { showToast(guardado.error); return; }
    await refrescarVista();
    showToast('Incidencia resuelta', {
      texto: 'Deshacer',
      onClick: async () => { await updateSesion(sesionId, { incidenciaTexto: prevTexto }); await refrescarVista(); },
    });
  }

  async function ejecutarOfrecerPlaza(sesionId: string) {
    const res = await fetch('/api/reservas/ofrecer-plaza', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data?.error ?? 'No se ha podido ofrecer la plaza'); return; }
    setDialogoAccion(null);
    await refrescarVista();
    showToast(data.resultado === 'confirmada' ? 'Plaza confirmada a la siguiente en la lista' : 'Oferta de plaza enviada');
  }

  async function ejecutarAjustarAforo(sesionId: string, nuevoAforo: number) {
    const s = datosVista?.sesiones.find(x => x.id === sesionId);
    const prevAforo = s?.aforoMaximo ?? nuevoAforo;
    const guardado = await updateSesion(sesionId, { aforoMaximo: nuevoAforo });
    if (!guardado.ok) { showToast(guardado.error); return; }
    setDialogoAccion(null);
    await refrescarVista();
    showToast(`Aforo ajustado a ${nuevoAforo}`, {
      texto: 'Deshacer',
      onClick: async () => { await updateSesion(sesionId, { aforoMaximo: prevAforo }); await refrescarVista(); },
    });
  }

  function accionParaBloque(d: DatoSesion): { texto: string; onClick: () => void } | null {
    const accion = accionParaSesion(d.sesion.id);
    if (!accion) return null;
    if (accion === 'CUBRIR') {
      const candidata = candidataParaSustitucion(d.sesion);
      if (!candidata) return null;
      return { texto: `Cubrir con ${candidata.nombre}`, onClick: () => setDialogoAccion({ tipo: 'CUBRIR', sesionId: d.sesion.id }) };
    }
    if (accion === 'PASAR_LISTA') return { texto: 'Pasar lista', onClick: () => void ejecutarPasarLista(d.sesion.id) };
    if (accion === 'RESOLVER') return { texto: 'Resolver', onClick: () => ejecutarResolverIncidencia(d.sesion.id).then(() => {}) };
    if (accion === 'MOVER') return { texto: 'Mover', onClick: () => { setSesionId(d.sesion.id); openEdit(); } };
    if (accion === 'OFRECER') return { texto: 'Ofrecer plaza', onClick: () => setDialogoAccion({ tipo: 'OFRECER', sesionId: d.sesion.id }) };
    if (accion === 'AJUSTAR_AFORO') return { texto: 'Ajustar aforo', onClick: () => setDialogoAccion({ tipo: 'AJUSTAR_AFORO', sesionId: d.sesion.id }) };
    return null;
  }

  function irADecision(sesionId: string) {
    setSesionId(sesionId);
    setPestanaPanel('clientas');
  }

  // ── Arrastrar y soltar (Fase 2) ──────────────────────────────────────────────
  const [confirmarArrastre, setConfirmarArrastre] = useState<{
    sesionId: string; nuevoSalaId: string; nuevoInicio: string; nuevoFin: string;
    apuntadas: number; horaTexto: string;
  } | null>(null);

  const arrastrableSesion = useCallback((d: DatoSesion) =>
    !d.sesion.cancelada && (!esInstructorTop || (!!yoTop && d.sesion.instructorId === yoTop.id)),
  [esInstructorTop, yoTop]);

  async function ejecutarMoverSesion(sesionId: string, nuevoSalaId: string, nuevoInicio: string, nuevoFin: string) {
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    if (!sesion) return;
    const cambioHora = new Date(sesion.inicio).getTime() !== new Date(nuevoInicio).getTime();
    const cambioSala = sesion.salaId !== nuevoSalaId;
    const guardado = await updateSesion(sesionId, { salaId: nuevoSalaId, inicio: nuevoInicio, fin: nuevoFin });
    if (!guardado.ok) { showToast(guardado.error); return; }
    if (cambioHora || cambioSala) {
      const d = new Date(nuevoInicio);
      void avisarCambioHorarioSala(
        sesionId,
        {
          clase: sesion.tipoClase.nombre, cuando: cuandoEstudio(d), d, sala: nombreSala(nuevoSalaId),
          instructora: nombreInstructor(sesion.instructorId), instructorActual: nombreInstructor(sesion.instructorId),
        },
        { cambioHora, cambioSala },
      );
    }
    showToast('Clase movida');
    void refrescarVista();
  }

  // Reutiliza detectarConflictos/hayConflicto — los mismos imports que ya usa
  // conflictosForm para el formulario de editar (page.tsx arriba), no una
  // comprobación nueva.
  function moverSesionArrastrada(
    sesionId: string,
    destino: { salaId?: string; diaColumna?: number; offsetYPx: number; pxPorHora: number },
  ) {
    if (guardandoSesion || !datosVista) return;
    const sesion = sesionesEnriquecidas.find(s => s.id === sesionId);
    if (!sesion || sesion.cancelada) return;
    if (esInstructorTop && (!yoTop || sesion.instructorId !== yoTop.id)) return;

    const horaAperturaMin = Number(datosVista.horaApertura.slice(0, 2)) * 60;
    const horaCierreMin = Number(datosVista.horaCierre.slice(0, 2)) * 60;
    const duracionMin = (new Date(sesion.fin).getTime() - new Date(sesion.inicio).getTime()) / 60000;
    const nuevoInicioMin = minutosDesdeOffset(destino.offsetYPx, destino.pxPorHora, horaAperturaMin);
    const { inicioMin, finMin } = nuevoHorarioArrastrado(duracionMin, nuevoInicioMin);
    if (inicioMin < horaAperturaMin || finMin > horaCierreMin) {
      showToast('Fuera del horario del estudio');
      return;
    }

    const baseDate = destino.diaColumna != null ? dias[destino.diaColumna] : new Date(sesion.inicio);
    if (!baseDate) return;
    const nuevoInicio = toISO(localDate(baseDate), mmA(inicioMin));
    const nuevoFin = toISO(localDate(baseDate), mmA(finMin));
    const nuevoSalaId = destino.salaId ?? sesion.salaId;
    if (nuevoInicio === sesion.inicio && nuevoSalaId === sesion.salaId) return;

    const conflicto = detectarConflictos(
      { salaId: nuevoSalaId, instructorId: sesion.instructorId, inicio: nuevoInicio, fin: nuevoFin },
      existentesSlot, sesionId,
    );
    if (hayConflicto(conflicto)) {
      showToast(`No se puede: ${nombreSala(nuevoSalaId)} o ${nombreInstructor(sesion.instructorId)} ya tienen clase a esa hora`);
      return;
    }

    const apuntadas = cuantasApuntadas(sesionId);
    if (apuntadas > 0) {
      // Un desliz en un iPad no debe reprogramar una clase con gente apuntada
      // y avisarla por email sin confirmación previa — a diferencia del
      // formulario de editar (que ya tiene su propia pausa: el botón Guardar).
      setConfirmarArrastre({ sesionId, nuevoSalaId, nuevoInicio, nuevoFin, apuntadas, horaTexto: mmA(inicioMin) });
      return;
    }
    void ejecutarMoverSesion(sesionId, nuevoSalaId, nuevoInicio, nuevoFin);
  }

  // ── Label ────────────────────────────────────────────────────────────────────
  const mesLabel = vista === 'semana'
    ? `${semana.toLocaleDateString('es-ES', { day: 'numeric' })} – ${addDays(semana, 6).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : vista === 'mes'
    ? mesVisto.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : diaSeleccionado.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Panel lateral: sesión seleccionada, vista de rol ────────────────────────
  const sesionVista = datosVista?.sesiones.find(s => s.id === sesionId) ?? null;
  const estadoVista = sesionVista ? (estadoPorSesion.get(sesionVista.id) ?? 'PROGRAMADA') : 'PROGRAMADA';

  const nombreClientaResolver = useCallback((socioId: string) => {
    const s = socios.find(x => x.id === socioId);
    return s ? `${s.nombre} ${s.apellidos}` : 'Clienta';
  }, [socios]);

  // ── Ficha clínica / semáforo / IA (sin cambios de fondo, solo reubicados) ──
  const rolCalendario = useRol();
  const verFichaClinica = puedeVerFichaClinica(rolCalendario);
  const verSemaforo = puedeVerSemaforo(rolCalendario);
  const { condicionesSalud, respuestasSesion, registrarRespuestaSesion } = useStudio();
  const esInstructor = rolCalendario === 'INSTRUCTOR';
  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;
  const esPropiaClase = sesionActual ? (!esInstructor || (!!yo && sesionActual.instructorId === yo.id)) : false;

  // Piloto de validación de captura por voz (ver lib/piloto-ficha-viva.ts) —
  // gateado a las instructoras del piloto, no visible al resto.
  const enPiloto = enPilotoVoz(yo?.id);
  const [notaVozSocioId, setNotaVozSocioId] = useState<string | null>(null);

  const hoyRef = useMemo(() => new Date(), [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const condicionesPorSocio = useMemo(() => {
    const m = new Map<string, typeof condicionesSalud>();
    if (!verFichaClinica) return m;
    for (const c of condicionesSalud) {
      const arr = m.get(c.socioId) ?? [];
      arr.push(c);
      m.set(c.socioId, arr);
    }
    return m;
  }, [condicionesSalud, verFichaClinica]);

  const nivelSemaforoPorSocio = useMemo(() => {
    const m = new Map<string, ReturnType<typeof semaforo>>();
    if (!verSemaforo) return m;
    const grupos = new Map<string, typeof condicionesSalud>();
    for (const c of condicionesSalud) {
      const arr = grupos.get(c.socioId) ?? [];
      arr.push(c);
      grupos.set(c.socioId, arr);
    }
    for (const [socioId, conds] of grupos) m.set(socioId, semaforo(conds));
    return m;
  }, [condicionesSalud, verSemaforo]);

  const semaforoRecepcion = useSemaforoRecepcion(rolCalendario);
  const semaforoParaMostrar = rolCalendario === 'RECEPCION' ? semaforoRecepcion : nivelSemaforoPorSocio;

  const alertasClase = useMemo(() => {
    if (!verFichaClinica) return [] as string[];
    return reservasActuales
      .filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA')
      .map(r => {
        const conds = condicionesPorSocio.get(r.socioId);
        if (!conds || !r.socio) return null;
        return alertaPreClase(r.socio.nombre, conds, hoyRef);
      })
      .filter((a): a is string => a !== null);
  }, [reservasActuales, condicionesPorSocio, verFichaClinica, hoyRef]);

  const respuestaPorSocio = useMemo(() => {
    const m = new Map<string, (typeof respuestasSesion)[number]>();
    if (!sesionActual) return m;
    for (const r of respuestasSesion) {
      if (r.sesionId === sesionActual.id) m.set(r.socioId, r);
    }
    return m;
  }, [respuestasSesion, sesionActual]);

  const [prepIA, setPrepIA] = useState<{ resumen: string; evitar: string[]; variantes: string[] } | null>(null);
  const [prepIALoading, setPrepIALoading] = useState(false);
  const [prepIAError, setPrepIAError] = useState(false);
  const [buscarSocia, setBuscarSocia] = useState('');
  const [showAnadir, setShowAnadir] = useState(false);

  useEffect(() => { setPrepIA(null); setPrepIAError(false); setShowAnadir(false); setBuscarSocia(''); }, [sesionId]);

  async function prepararClaseIA() {
    if (!sesionActual) return;
    setPrepIALoading(true);
    setPrepIA(null);
    setPrepIAError(false);
    try {
      const resumen = resumenSaludClase(
        reservasActuales.filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').map(r => condicionesPorSocio.get(r.socioId) ?? []),
      );
      const res = await fetch('/api/ai/ficha-clinica-clase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ tipoClase: sesionActual.tipoClase.nombre, resumen }),
      });
      if (!res.ok) { setPrepIAError(true); return; }
      const data = await res.json();
      setPrepIA(data);
    } catch {
      setPrepIAError(true);
    } finally {
      setPrepIALoading(false);
    }
  }

  const sociosDisponibles = useMemo(() => {
    const sociosEnClase = new Set(reservasActuales.filter(r => r.estado !== 'CANCELADA').map(r => r.socioId));
    return socios.filter(
      s => s.activo && !sociosEnClase.has(s.id) &&
      (buscarSocia === '' || `${s.nombre} ${s.apellidos}`.toLowerCase().includes(buscarSocia.toLowerCase()))
    );
  }, [reservasActuales, socios, buscarSocia]);

  const spotsActuales = sesionActual ? spots.filter(sp => sp.salaId === sesionActual.salaId) : [];

  const eventosHistorial = useMemo(() => {
    if (!datosVista || !sesionId) return [];
    const nombrePorId = new Map(datosVista.instructores.map(i => [i.id, i.nombre]));
    const desdeSesion = datosVista.sustituciones.filter(s => s.sesionId === sesionId);
    return historialSustituciones(desdeSesion, id => nombrePorId.get(id) ?? null);
  }, [datosVista, sesionId]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-full">
    <LienzoCalendario>
    <div className="flex flex-col flex-1 min-h-0 rounded-3xl bg-card border border-border shadow-[0_20px_50px_-24px_rgba(0,0,0,0.18)] overflow-hidden">
      {/* ── Top header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        className="shrink-0 px-4 lg:px-6 pt-4 lg:pt-5 pb-3 lg:pb-4 sm:items-center"
        title="Calendario"
        description={<span className="capitalize">{mesLabel}</span>}
        actions={
        <div className="flex items-center gap-2 flex-wrap">
          <BuscadorRapido candidatas={candidatasBusqueda} onSeleccionar={saltarAClase} />
          {gestionaClientas && (
            <Link
              href="/calendario/importar"
              title="Importar horario"
              aria-label="Importar horario"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 lg:px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Upload size={14} /><span className="hidden lg:inline">Importar horario</span>
            </Link>
          )}

          {/* Punto 2: Día (por sala) / Semana (7 columnas) — vistas distintas, no un breakpoint. */}
          <div className="flex items-center gap-0.5 bg-muted rounded-xl p-1">
            <button
              onClick={() => setVista('dia')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors', vista === 'dia' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
            >
              <Rows3 size={13} />Día
            </button>
            <button
              onClick={() => setVista('semana')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors', vista === 'semana' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
            >
              <LayoutGrid size={13} />Semana
            </button>
            <button
              onClick={() => setVista('mes')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors', vista === 'mes' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
            >
              <CalendarDays size={13} />Mes
            </button>
          </div>

          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
            <button
              onClick={() => vista === 'semana' ? cambiarSemana(-1) : vista === 'mes' ? cambiarMes(-1) : cambiarDia(-1)}
              aria-label={vista === 'semana' ? 'Semana anterior' : vista === 'mes' ? 'Mes anterior' : 'Día anterior'}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button onClick={irAHoy} className="px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors">
              Hoy
            </button>
            <button
              onClick={() => vista === 'semana' ? cambiarSemana(1) : vista === 'mes' ? cambiarMes(1) : cambiarDia(1)}
              aria-label={vista === 'semana' ? 'Semana siguiente' : vista === 'mes' ? 'Mes siguiente' : 'Día siguiente'}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {gestionaClientas ? (
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
                aria-label="Más opciones para crear clase"
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
          ) : creaClasesPropias && (
            <button
              onClick={() => openNueva()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-card/10 transition-colors"
            >
              <Plus size={15} />Nueva clase
            </button>
          )}
        </div>
        }
      />

      {/* ── Métricas (punto 8) ─────────────────────────────────────────────────── */}
      {/* Ocultas en móvil (igual que el StatsBar viejo, hidden lg:block): son
          agregados secundarios frente a "qué clase tengo ahora", y en una
          pantalla de 375px las 3 tarjetas apiladas se comían media pantalla
          antes de llegar a una sola clase. */}
      {/* Sin sentido en Mes: son agregados de la ventana de Día/Semana visible
          (metricasDia/metricasSemana), no del mes entero. */}
      {vista !== 'mes' && (
        <div className="hidden lg:block px-6 pb-3 shrink-0">
          <TarjetasMetricas tarjetas={tarjetas} />
        </div>
      )}

      {/* ── Filtros (punto 9) ──────────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6 pb-3 shrink-0">
        <FiltrosCalendario
          salas={datosVista?.salas ?? []}
          instructores={instructoresActivos}
          filtroSala={filtroSala}
          filtroInstructor={filtroInstructor}
          onSala={setFiltroSala}
          onInstructor={setFiltroInstructor}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
        />
      </div>

      {/* ── Franja de decisiones (punto 3) ─────────────────────────────────────── */}
      {/* Sin sentido en Mes: listaría cada clase pendiente del mes entero, no
          "lo de hoy/esta semana" que la franja está pensada para resumir. */}
      {vista !== 'mes' && decisionesResumen.length > 0 && (
        <div className="px-4 lg:px-6 pb-3 shrink-0">
          <FranjaDecisiones
            decisiones={decisionesResumen}
            indice={indiceDecision}
            onAnterior={() => setIndiceDecision(i => i - 1)}
            onSiguiente={() => setIndiceDecision(i => i + 1)}
            onVer={irADecision}
          />
        </div>
      )}

      {/* ── Día por salas / Semana 7 columnas / Mes ────────────────────────────── */}
      <div className="flex-1 min-h-0 px-4 lg:px-6 pb-4 lg:pb-6">
        {!datosVista ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>
        ) : vista === 'dia' ? (
          <VistaDiaSalas
            columnas={columnasDia}
            datos={datosPorSesionId}
            horaInicioMin={Number(datosVista.horaApertura.slice(0, 2)) * 60}
            horaFinMin={Number(datosVista.horaCierre.slice(0, 2)) * 60}
            pxPorHora={96}
            ahoraMin={localDate(diaSeleccionado) === todayStr ? now.getHours() * 60 + now.getMinutes() : null}
            seleccionadaId={sesionId}
            onSeleccionar={id => { setSesionId(prev => prev === id ? null : id); setPestanaPanel('clientas'); }}
            atenuada={atenuada}
            accionPara={accionParaBloque}
            arrastrable={arrastrableSesion}
            onMoverSesion={moverSesionArrastrada}
          />
        ) : vista === 'mes' ? (
          <VistaMes
            mesVisto={mesVisto}
            datos={diasMes}
            hoyStr={todayStr}
            onSeleccionarDia={onSeleccionarDia}
          />
        ) : (
          <VistaSemana
            columnas={columnasSemana}
            datos={datosPorSesionId}
            fechasSemana={dias}
            hoyIndex={dias.some(d => localDate(d) === todayStr) ? dias.findIndex(d => localDate(d) === todayStr) : null}
            ahoraMin={now.getHours() * 60 + now.getMinutes()}
            horaInicioMin={Number(datosVista.horaApertura.slice(0, 2)) * 60}
            horaFinMin={Number(datosVista.horaCierre.slice(0, 2)) * 60}
            pxPorHora={58}
            seleccionadaId={sesionId}
            onSeleccionar={id => { setSesionId(prev => prev === id ? null : id); setPestanaPanel('clientas'); }}
            atenuada={atenuada}
            arrastrable={arrastrableSesion}
            onMoverSesion={moverSesionArrastrada}
          />
        )}
      </div>
    </div>
    </LienzoCalendario>

      {/* ── Panel lateral de sesión (punto 5: 3 pestañas) ───────────────────────── */}
      {sesionActual && sesionId && !showForm && (
        <PanelSesion
          abierto
          onCerrar={() => setSesionId(null)}
          pestana={pestanaPanel}
          onCambiarPestana={setPestanaPanel}
          titulo={sesionActual.tipoClase.nombre}
          horaTexto={horaTextoSesion(sesionActual.inicio, sesionActual.fin)}
          estado={estadoVista}
          ocupacion={{ confirmadas: sesionActual.confirmadas, aforoMaximo: sesionActual.aforoMaximo }}
          accionesCabecera={esPropiaClase ? (
            <>
              <button onClick={openEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
                <Pencil size={12} />Editar
              </button>
              <button onClick={() => openDuplicar(sesionActual)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
                <Copy size={12} />Duplicar
              </button>
              {esInstructor ? (
                <button onClick={() => setShowNoPuedoAsistir(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
                  <UserCheck size={12} />No puedo asistir
                </button>
              ) : (
                <button onClick={() => setShowCobertura(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
                  <UserCheck size={12} />Buscar sustituta
                </button>
              )}
              <button onClick={() => abrirIncidencia(sesionActual.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
                <AlertTriangle size={12} />Incidencia
              </button>
              <button onClick={cancelarSesion} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:bg-muted transition-colors">
                <X size={12} />Cancelar
              </button>
              {!esInstructor && (
                <button onClick={eliminarSesion} aria-label="Eliminar sesión" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors ml-auto">
                  <Trash2 size={12} />
                </button>
              )}
            </>
          ) : null}
          clientas={{
            reservas: reservasActuales,
            nombreClienta: nombreClientaResolver,
            onCheckin: checkin, onNoShow: marcarNoShow,
            onDeshacerCheckin: deshacerCheckin, onRevertirNoShow: revertirNoShow,
            onAprobar: id => resolverPendiente(id, true), onRechazar: id => resolverPendiente(id, false),
            onQuitar: gestionaClientas ? cancelarReserva : undefined,
            semaforoPorSocio: verSemaforo ? (socioId => {
              const nivel = semaforoParaMostrar.get(socioId);
              return nivel ? { color: SEMAFORO_META[nivel].color, label: SEMAFORO_META[nivel].label } : undefined;
            }) : undefined,
            filaExtra: verFichaClinica ? (r => r.estado === 'ASISTIDA' ? (
              <div className="flex items-center gap-1 mt-1.5">
                {RESPUESTAS_ORDEN.map(resp => {
                  const rm = RESPUESTA_META[resp];
                  const activa = respuestaPorSocio.get(r.socioId)?.respuesta === resp;
                  return (
                    <button
                      key={resp}
                      onClick={() => registrarRespuestaSesion({ socioId: r.socioId, sesionId: sesionActual?.id ?? null, respuesta: resp })}
                      title={rm.label}
                      aria-label={rm.label}
                      aria-pressed={activa}
                      className={cn('w-6 h-6 rounded-md text-xs flex items-center justify-center transition-all', activa ? 'ring-2 scale-110' : 'opacity-45 hover:opacity-100')}
                      style={activa ? { backgroundColor: rm.bg, boxShadow: `0 0 0 2px ${rm.color}` } : { backgroundColor: rm.bg }}
                    >
                      {rm.emoji}
                    </button>
                  );
                })}
                {enPiloto && (
                  <button
                    onClick={() => setNotaVozSocioId(r.socioId)}
                    title="Nota de voz (piloto)"
                    aria-label="Nota de voz"
                    className="w-6 h-6 rounded-md text-xs flex items-center justify-center opacity-45 hover:opacity-100 transition-all"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 10%, var(--card))' }}
                  >
                    🎙
                  </button>
                )}
              </div>
            ) : null) : undefined,
          }}
          extraClientas={
            <>
              {alertasClase.length > 0 && (
                <div className="mb-3 rounded-xl border p-3" style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 12%, var(--card))', borderColor: '#FDE68A' }}>
                  <p className="text-[11px] font-bold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--warning)' }}>
                    <AlertTriangle size={13} /> Adaptaciones para esta clase
                  </p>
                  <ul className="space-y-1">
                    {alertasClase.map((a, i) => <li key={i} className="text-[11px] leading-snug" style={{ color: '#78350F' }}>· {a}</li>)}
                  </ul>
                </div>
              )}
              {verFichaClinica && alertasClase.length > 0 && (
                <div className="mb-3">
                  {!prepIA && (
                    <button
                      onClick={prepararClaseIA}
                      disabled={prepIALoading}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[11px] font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-50 transition-colors"
                    >
                      {prepIALoading ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
                      {prepIALoading ? 'Preparando…' : 'Preparar clase con IA'}
                    </button>
                  )}
                  {prepIAError && <p className="text-[11px] text-destructive mt-1.5">No se pudo generar la preparación. Inténtalo de nuevo.</p>}
                  {prepIA && (
                    <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-foreground leading-snug">{prepIA.resumen}</p>
                        <button onClick={() => setPrepIA(null)} title="Cerrar" className="text-muted-foreground hover:text-foreground shrink-0"><X size={13} /></button>
                      </div>
                      {prepIA.evitar.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Evitar</p>
                          <ul className="space-y-0.5">{prepIA.evitar.map((e, i) => <li key={i} className="text-[11px] text-foreground leading-snug">· {e}</li>)}</ul>
                        </div>
                      )}
                      {prepIA.variantes.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Variantes sugeridas</p>
                          <ul className="space-y-0.5">{prepIA.variantes.map((v, i) => <li key={i} className="text-[11px] text-foreground leading-snug">· {v}</li>)}</ul>
                        </div>
                      )}
                      <p className="text-[9px] text-muted-foreground italic">Sugerencia generada por IA — revísala antes de aplicarla. No es consejo médico.</p>
                    </div>
                  )}
                </div>
              )}
              {gestionaClientas && (!showAnadir ? (
                <button
                  onClick={() => setShowAnadir(true)}
                  className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border border-dashed border-border text-xs font-bold text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  <UserPlus size={13} />Añadir clienta a la clase
                </button>
              ) : (
                <div className="mb-3 space-y-2">
                  {sesionActual && sesionActual.confirmadas >= sesionActual.aforoMaximo && (
                    <p className="text-[11px] font-semibold text-warning">
                      Clase llena ({sesionActual.confirmadas}/{sesionActual.aforoMaximo}) — quien añadas entrará en lista de espera.
                    </p>
                  )}
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground"
                    placeholder="Buscar clienta..."
                    value={buscarSocia}
                    onChange={e => setBuscarSocia(e.target.value)}
                    autoFocus
                  />
                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                    {sociosDisponibles.slice(0, 8).map(s => (
                      <button
                        key={s.id}
                        onClick={() => { if (sesionActual) handleAddReserva(sesionActual.id, s.id); setShowAnadir(false); setBuscarSocia(''); }}
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
                      <p className="text-xs text-center py-3 text-muted-foreground">No hay clientas disponibles</p>
                    )}
                  </div>
                  <button onClick={() => { setShowAnadir(false); setBuscarSocia(''); }} className="w-full py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted">
                    Cancelar
                  </button>
                </div>
              ))}
              <Link href="/calendario/pase" className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
                <QrCode size={14} />Leer un pase
              </Link>
            </>
          }
          eventosHistorial={eventosHistorial}
          spots={spotsActuales.length > 0 ? spotsActuales : null}
          reservasConSocio={reservasActuales}
          socios={socios}
          onCheckinSpot={checkin}
          onLiberarSpot={liberarSpot}
          onAsignarSpot={(spotId, socioId) => sesionActual && asignarSpot(sesionActual.id, socioId, spotId)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} action={toastAction} />}

      {notaVozSocioId && sesionActual && yo && (
        <ModalNotaVoz
          socioId={notaVozSocioId}
          nombreSocia={nombreClientaResolver(notaVozSocioId)}
          instructorId={yo.id}
          sesionId={sesionActual.id}
          onClose={() => setNotaVozSocioId(null)}
        />
      )}

      <CoberturaDialog
        open={showCobertura}
        onOpenChange={setShowCobertura}
        sesion={sesionActual}
        sesiones={sesiones}
        instructores={instructoresActivos}
        ausencias={ausencias}
        onAsignar={asignarSustituta}
      />

      <NoPuedoAsistirDialog
        open={showNoPuedoAsistir}
        onOpenChange={setShowNoPuedoAsistir}
        sesion={sesionActual}
      />

      {/* ── Panel lateral crear / editar ────────────────────────────────────────── */}
      <DashboardDrawer open={!!showForm} onClose={() => setShowForm(null)} label={showForm === 'nueva' ? 'Nueva clase' : 'Editar clase'}>
        <>
            <div className="px-6 py-5 flex items-center justify-between border-b border-border shrink-0">
              <h2 className="text-lg font-extrabold text-foreground tracking-tight">
                {showForm === 'nueva' ? 'Nueva clase' : 'Editar clase'}
              </h2>
              <button onClick={() => setShowForm(null)} aria-label="Cerrar" className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-border transition-colors">
                <X size={16} className="text-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Tipo de clase">
                  <select
                    className={selectCls}
                    value={form.tipoClaseId}
                    onChange={e => setForm(f => ({
                      ...f,
                      tipoClaseId: e.target.value,
                      horaFin: finSegunDuracion(f.horaInicio, e.target.value),
                    }))}
                  >
                    {!form.tipoClaseId && (
                      <option value="">{tiposClase.length ? 'Elige un tipo de clase' : 'Todavía no tienes tipos de clase'}</option>
                    )}
                    {tiposClase.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </FormField>
                <FormField label="Sala">
                  <select className={selectCls} value={form.salaId} onChange={e => {
                    const salaId = e.target.value;
                    const cap = salas.find(x => x.id === salaId)?.capacidad;
                    setForm(f => ({
                      ...f,
                      salaId,
                      aforoMaximo: f.aforoTocado || cap == null ? f.aforoMaximo : cap,
                    }));
                  }}>
                    {!form.salaId && (
                      <option value="">{salas.length ? 'Elige una sala' : 'Todavía no tienes salas'}</option>
                    )}
                    {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </FormField>
              </div>
              {!(esInstructorTop && showForm === 'nueva') && (
              <FormField label="Instructora">
                <select className={selectCls} value={form.instructorId} onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}>
                  {!form.instructorId && (
                    <option value="">{instructoresForm.length ? 'Elige una instructora' : 'Todavía no tienes instructoras'}</option>
                  )}
                  {instructoresForm.map(i => { const au = ausenciaEnFecha(ausencias, i.id, form.fecha || new Date()); return <option key={i.id} value={i.id}>{i.nombre}{i.activo ? '' : ' · ya no está en el equipo'}{sufijoAusencia(au)}</option>; })}
                </select>
              </FormField>
              )}
              <FormField label="Fecha">
                <input type="date" className={inputCls} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Hora inicio">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.horaInicio}
                    onChange={e => setForm(f => ({
                      ...f,
                      horaInicio: e.target.value,
                      horaFin: finSegunDuracion(e.target.value, f.tipoClaseId),
                    }))}
                  />
                </FormField>
                <FormField label="Hora fin">
                  <input type="time" className={inputCls} value={form.horaFin} onChange={e => setForm(f => ({ ...f, horaFin: e.target.value }))} />
                </FormField>
              </div>
              {esInstructorTop && showForm === 'nueva' ? (
                <FormField label="Aforo máximo" description="Es el de la sala elegida.">
                  <input type="number" className={inputCls + ' opacity-60'} value={form.aforoMaximo} disabled readOnly />
                </FormField>
              ) : (
                <FormField label="Aforo máximo" description="Al llenarse, las siguientes reservas entran en lista de espera; no se bloquean.">
                  <input type="number" min={1} max={300} className={inputCls} value={form.aforoMaximo}
                    onChange={e => setForm(f => ({ ...f, aforoMaximo: Number(e.target.value), aforoTocado: true }))} />
                </FormField>
              )}
              <AvisoAforoSala salas={salas} salaId={form.salaId} aforo={form.aforoMaximo} />
              {showForm === 'nueva' && !esInstructorTop && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.repetir}
                  onClick={() => setForm(f => ({ ...f, repetir: !f.repetir }))}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-muted/60 border border-border cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <RefreshCw size={14} className="text-brand-medio" />
                    Repetir semanalmente
                  </span>
                  <span
                    className="w-11 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0"
                    style={{ backgroundColor: form.repetir ? 'var(--primary)' : 'var(--muted-foreground)' }}
                  >
                    <span
                      className="w-5 h-5 bg-card rounded-full shadow transition-transform"
                      style={{ transform: form.repetir ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </span>
                </button>
              )}
              {showForm === 'nueva' && form.repetir && (
                <div className="flex items-center gap-3 pl-1">
                  <span className="text-sm text-muted-foreground">durante</span>
                  <input
                    type="number" min={2} max={52}
                    aria-invalid={repetirInvalido}
                    className="w-20 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground text-center"
                    value={form.repetirSemanas}
                    onChange={e => {
                      const n = Number(e.target.value);
                      setForm(f => ({ ...f, repetirSemanas: Number.isNaN(n) ? f.repetirSemanas : Math.min(52, n) }));
                    }}
                  />
                  <span className="text-sm text-muted-foreground">semanas</span>
                  {repetirInvalido && (
                    <span className="text-xs text-warning">Mínimo 2 semanas.</span>
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

            {faltaConfigurar && (
              <div className="px-6 pb-1 shrink-0">
                <div className="rounded-xl px-3.5 py-2.5 text-xs bg-warning/10 border border-warning/30 text-amber-900 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
                  <div>
                    <p>Para crear la clase falta {faltaConfigurar.faltan.join(', ')}.</p>
                    {faltaConfigurar.sinCrear && (
                      <p className="mt-1">
                        Todavía no lo tienes creado.{' '}
                        <Link href="/configuracion?tab=clases" className="underline font-semibold">
                          Créalo en Mi estudio
                        </Link>{' '}
                        y vuelve aquí.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {horaInvalida && !faltaConfigurar && (
              <div className="px-6 pb-1 shrink-0">
                <div className="rounded-xl px-3.5 py-2.5 text-xs bg-destructive/10 border border-destructive/30 text-destructive flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
                  <p>La hora de fin debe ser posterior a la hora de inicio.</p>
                </div>
              </div>
            )}

            {(conflictosForm || aforoSobrante > 0) && (
              <div className="px-6 pb-1 shrink-0 space-y-2">
                {conflictosForm && (
                  <div className="rounded-xl px-3.5 py-2.5 text-xs bg-destructive/10 border border-destructive/30 text-destructive flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-destructive" />
                    <div className="space-y-0.5">
                      {conflictosForm.sala.length > 0 && (
                        <p><span className="font-bold">{nombreSala(form.salaId)}</span> ya está ocupada: {conflictosForm.sala.map(c => `${formatHora(c.inicio)}–${formatHora(c.fin)}`).join(', ')}</p>
                      )}
                      {conflictosForm.instructor.length > 0 && (
                        <p><span className="font-bold">{nombreInstructor(form.instructorId)}</span> ya tiene clase: {conflictosForm.instructor.map(c => `${formatHora(c.inicio)}–${formatHora(c.fin)}`).join(', ')}</p>
                      )}
                      <p>Cambia la hora, la sala o la instructora para poder guardar.</p>
                    </div>
                  </div>
                )}
                {aforoSobrante > 0 && (
                  <div className="rounded-xl px-3.5 py-2.5 text-xs bg-warning/10 border border-warning/30 text-warning flex gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
                    <p>Hay <span className="font-bold">{sesionActual?.confirmadas} confirmada{(sesionActual?.confirmadas ?? 0) !== 1 ? 's' : ''}</span> y bajas el aforo a {form.aforoMaximo}: {aforoSobrante} quedaría{aforoSobrante !== 1 ? 'n' : ''} por encima del cupo. No se moverán a lista de espera automáticamente.</p>
                  </div>
                )}
              </div>
            )}

            {showForm === 'editar' && sesionActual?.serieId ? (
              <div className="px-6 py-5 border-t border-border flex flex-col gap-2 shrink-0">
                <button
                  onClick={editarSesion}
                  disabled={horaInvalida || !!faltaConfigurar || !!conflictosForm}
                  className="w-full py-3 rounded-2xl text-sm font-extrabold text-brand-foreground transition-opacity hover:opacity-90 bg-brand disabled:opacity-50 disabled:pointer-events-none"
                >
                  Guardar solo esta clase
                </button>
                <button
                  onClick={editarSerie}
                  disabled={horaInvalida || !!faltaConfigurar || !!conflictosForm}
                  className="w-full py-3 rounded-2xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Guardar esta y las siguientes
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 border-t border-border shrink-0">
                {errorSesion && (
                  <p role="alert" className="mb-3 text-[13px] text-destructive">
                    No se ha creado. {errorSesion}
                  </p>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setShowForm(null)} disabled={guardandoSesion} className="flex-1 py-3 rounded-2xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={showForm === 'nueva' ? crearSesion : editarSesion}
                    disabled={horaInvalida || !!faltaConfigurar || repetirInvalido || !!conflictosForm || guardandoSesion}
                    className="flex-[2] py-3 rounded-2xl text-sm font-extrabold text-brand-foreground transition-opacity hover:opacity-90 bg-brand disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {guardandoSesion
                      ? 'Guardando…'
                      : showForm === 'nueva'
                        ? form.repetir
                          ? `Crear ${form.repetirSemanas} ${form.repetirSemanas === 1 ? 'clase' : 'clases'}`
                          : 'Crear clase'
                        : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            )}
        </>
      </DashboardDrawer>

      {/* ── Modal clases recurrentes ────────────────────────────────────────────── */}
      <ModalClasesRecurrentes
        ausencias={ausencias}
        open={showRecurrentes}
        onClose={() => setShowRecurrentes(false)}
        tiposClase={tiposClase}
        instructores={instructoresActivos}
        salas={salas}
        onCrear={crearClasesRecurrentes}
        sesionesExistentes={sesiones.map(s => ({
          id: s.id, salaId: s.salaId, instructorId: s.instructorId,
          inicio: s.inicio, fin: s.fin, cancelada: s.cancelada,
        }))}
      />

      {/* ── F0·E1: decisión al añadir a una socia sin bono válido ─────────────────── */}
      {avisoSinBono && (
        <AvisoSinBono
          open
          motivo={avisoSinBono.motivo}
          socioNombre={(() => { const s = socios.find(x => x.id === avisoSinBono.socioId); return s ? `${s.nombre} ${s.apellidos}` : 'La clienta'; })()}
          socioId={avisoSinBono.socioId}
          claseLabel={(() => { const ses = sesionesEnriquecidas.find(x => x.id === avisoSinBono.sesionId); const tc = ses ? tiposClase.find(t => t.id === ses.tipoClaseId) : null; return tc?.nombre ?? ''; })()}
          precioSuelta={precioSueltaDe(avisoSinBono.sesionId)}
          permiteCobrar={mueveDinero}
          onCobrarSuelta={handleCobrarSuelta}
          onCortesia={handleCortesiaSinBono}
          onClose={() => setAvisoSinBono(null)}
        />
      )}

      {/* Clase llena: se pregunta ANTES de dejar a nadie en lista de espera. */}
      <Dialog open={confirmarEspera !== null} onOpenChange={open => !open && setConfirmarEspera(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              Esta clase está llena
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground mt-2">
            <strong className="text-foreground">{confirmarEspera?.nombre}</strong> no entra en la
            clase: quedaría en <strong className="text-foreground">lista de espera, en el puesto nº {confirmarEspera?.posicion}</strong>.
            Solo entrará si alguien cancela.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setConfirmarEspera(null)}
            >
              No, déjalo
            </button>
            <button
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => {
                if (confirmarEspera) confirmarAddReserva(confirmarEspera.sesionId, confirmarEspera.socioId);
                setConfirmarEspera(null);
              }}
            >
              Sí, a la lista de espera
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* La clase ya está guardada; lo único que se decide aquí es si se avisa. */}
      <Dialog open={avisoInstructora !== null} onOpenChange={open => !open && setAvisoInstructora(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              ¿Aviso a {avisoInstructora?.apuntadas === 0
                ? 'las clientas apuntadas'
                : avisoInstructora?.apuntadas === 1 ? 'la clienta' : `las ${avisoInstructora?.apuntadas} clientas`}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground mt-2">
            Has cambiado quién da la clase{avisoInstructora?.instructora ? <> — ahora la da <strong className="text-foreground">{avisoInstructora.instructora}</strong></> : null}.
            {' '}Puedo avisarlas por email y por la app. El horario y la sala no cambian.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setAvisoInstructora(null)}
            >
              No hace falta
            </button>
            <button
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => {
                const aviso = avisoInstructora;
                setAvisoInstructora(null);
                if (!aviso) return;
                void avisarCambioInstructora(aviso);
              }}
            >
              Sí, avisar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fase 2: confirmación al arrastrar una clase con clientas apuntadas ──── */}
      <Dialog open={confirmarArrastre !== null} onOpenChange={open => !open && setConfirmarArrastre(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              ¿Mover a las {confirmarArrastre?.horaTexto} y avisar a{' '}
              {confirmarArrastre?.apuntadas === 1 ? 'la clienta' : `las ${confirmarArrastre?.apuntadas} clientas`}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground mt-2">
            Hay reservas confirmadas en esta clase — al moverla les avisamos por email del nuevo horario.
          </p>
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setConfirmarArrastre(null)}
            >
              Cancelar
            </button>
            <button
              className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity"
              onClick={() => {
                const c = confirmarArrastre;
                setConfirmarArrastre(null);
                if (!c) return;
                void ejecutarMoverSesion(c.sesionId, c.nuevoSalaId, c.nuevoInicio, c.nuevoFin);
              }}
            >
              Mover y avisar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Punto 4: diálogos de CUBRIR / OFRECER / AJUSTAR_AFORO ───────────────── */}
      {dialogoAccion?.tipo === 'CUBRIR' && (() => {
        const s = datosVista?.sesiones.find(x => x.id === dialogoAccion.sesionId);
        if (!s) return null;
        const candidata = candidataParaSustitucion(s);
        const n = (reservasPorSesion.get(s.id) ?? []).filter(r => r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA').length;
        return (
          <DialogoDecision
            abierto
            titulo={candidata ? `Cubrir con ${candidata.nombre}` : 'Cubrir clase'}
            cuerpo={<p>{preguntaAvisoCobertura(n)}</p>}
            onConfirmar={candidata ? () => void ejecutarCubrir(s.id, candidata.id) : null}
            textoConfirmar="Sí, cubrir y avisar"
            onCerrar={() => setDialogoAccion(null)}
          />
        );
      })()}

      {dialogoAccion?.tipo === 'OFRECER' && (
        <DialogoDecision
          abierto
          titulo="Ofrecer la plaza libre"
          cuerpo={<p>Se ofrecerá el hueco libre a la siguiente persona en lista de espera.</p>}
          onConfirmar={() => void ejecutarOfrecerPlaza(dialogoAccion.sesionId)}
          textoConfirmar="Ofrecer plaza"
          onCerrar={() => setDialogoAccion(null)}
        />
      )}

      {dialogoAccion?.tipo === 'AJUSTAR_AFORO' && (() => {
        const s = datosVista?.sesiones.find(x => x.id === dialogoAccion.sesionId);
        if (!s) return null;
        const sala = datosVista?.salas.find(x => x.id === s.salaId);
        if (!sala) return null;
        const r = reservasPorSesion.get(s.id) ?? [];
        const confirmadas = r.filter(x => x.estado === 'CONFIRMADA' || x.estado === 'ASISTIDA').length;
        const permitido = puedeAjustarAforoASalaCapacidad(confirmadas, sala.capacidad);
        return (
          <DialogoDecision
            abierto
            titulo={`Ajustar aforo a ${sala.capacidad}`}
            cuerpo={<p>{permitido
              ? `Se bajará el aforo de esta clase a ${sala.capacidad} (capacidad de ${sala.nombre}). No afecta a ninguna clienta confirmada.`
              : motivoAforoBloqueado(confirmadas, sala.capacidad)}</p>}
            onConfirmar={permitido ? () => void ejecutarAjustarAforo(s.id, sala.capacidad) : null}
            textoConfirmar="Ajustar"
            onCerrar={() => setDialogoAccion(null)}
          />
        );
      })()}

      {/* ── Reportar/editar incidencia (necesario para que el estado INCIDENCIA sea alcanzable) ── */}
      <Dialog open={dialogoIncidencia !== null} onOpenChange={open => !open && setDialogoIncidencia(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">Incidencia de esta clase</DialogTitle>
          </DialogHeader>
          <textarea
            className={inputCls + ' resize-none h-24 mt-2'}
            placeholder="Ej. sala sin luz, reformer averiado..."
            value={dialogoIncidencia?.texto ?? ''}
            onChange={e => setDialogoIncidencia(prev => prev && { ...prev, texto: e.target.value })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">Déjalo en blanco y guarda para borrar la incidencia.</p>
          <div className="flex gap-2 mt-4">
            <button className="flex-1 justify-center py-2.5 rounded-xl border border-border text-[13px] font-medium text-foreground hover:bg-muted transition-colors" onClick={() => setDialogoIncidencia(null)}>
              Cancelar
            </button>
            <button className="flex-1 justify-center py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold hover:opacity-90 transition-opacity" onClick={guardarIncidencia}>
              Guardar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
