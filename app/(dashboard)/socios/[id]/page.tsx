'use client';

import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft, Phone, Mail, CreditCard, Calendar, Pencil, Trash2,
  AlertTriangle, Plus, Tag, MessageSquare, Pause, Play, X, Clock,
  ChevronDown, Send, CheckCircle2, Filter, RotateCcw, ShieldCheck, FileSignature,
  Bot, Loader2, Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';

// ─── Constants ────────────────────────────────────────────────────────────────

const TAGS_OPTIONS = [
  { label: 'VIP', bg: '#FFF2F7', text: '#7AA80E' },
  { label: 'Prueba', bg: '#FEF3C7', text: '#92400E' },
  { label: 'Lesión', bg: '#FEE2E2', text: '#B91C1C' },
  { label: 'Embarazo', bg: '#D1FAE5', text: '#059669' },
  { label: 'Baja temp.', bg: 'var(--muted)', text: 'var(--muted-foreground)' },
  { label: 'Online', bg: '#E0F2FE', text: '#0369A1' },
  { label: 'Profesora', bg: '#FEF9C3', text: '#713F12' },
];

const AVATAR_COLORS = [
  { bg: '#FFF2F7', text: '#7AA80E' },
  { bg: '#D1FAE5', text: '#059669' },
  { bg: '#FEF3C7', text: '#92400E' },
  { bg: '#FCE7F3', text: '#9D174D' },
  { bg: '#EDE9FE', text: '#5B21B6' },
  { bg: '#FEE2E2', text: '#991B1B' },
];

const BADGE_RECIBO: Record<string, string> = {
  COBRADO: 'bg-emerald-100 text-emerald-800',
  PENDIENTE: 'bg-amber-100 text-amber-800',
  DEVUELTO: 'bg-red-100 text-red-700',
  EN_CURSO: 'bg-blue-100 text-blue-800',
};
const LABEL_RECIBO: Record<string, string> = {
  COBRADO: 'Cobrado', PENDIENTE: 'Pendiente', DEVUELTO: 'Devuelto', EN_CURSO: 'En curso',
};

const BADGE_RESERVA: Record<string, { bg: string; text: string; label: string }> = {
  CONFIRMADA:   { bg: '#FFF2F7', text: '#7AA80E', label: 'Confirmada' },
  ASISTIDA:     { bg: '#D1FAE5', text: '#059669', label: 'Asistida' },
  LISTA_ESPERA: { bg: '#FEF3C7', text: '#92400E', label: 'En espera' },
  CANCELADA:    { bg: 'var(--muted)', text: 'var(--muted-foreground)', label: 'Cancelada' },
  NO_ASISTIO:   { bg: '#FFF1F2', text: '#B91C1C', label: 'No asistió' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tagStyle(label: string) {
  return TAGS_OPTIONS.find(t => t.label === label) ?? { bg: 'var(--muted)', text: 'var(--muted-foreground)' };
}

function avatarColor(id: string) {
  const idx = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function localDate(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-foreground transition-colors";
const selectCls = inputCls + " appearance-none";

function FF({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card border border-border rounded-xl p-5', className)}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">{children}</h3>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onHide }: { message: string; onHide: () => void }) {
  useEffect(() => {
    const t = setTimeout(onHide, 3000);
    return () => clearTimeout(t);
  }, [onHide]);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-brand text-brand-foreground px-4 py-3 rounded-xl shadow-xl text-sm font-semibold animate-in slide-in-from-bottom-2">
      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
      {message}
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function AttendanceSparkline({ weeks }: { weeks: boolean[] }) {
  const streak = (() => {
    let s = 0;
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i]) s++; else break;
    }
    return s;
  })();
  const attended = weeks.filter(Boolean).length;

  return (
    <div>
      <div className="flex items-end gap-1">
        {weeks.map((attended, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all duration-300"
            style={{
              height: attended ? '28px' : '10px',
              backgroundColor: attended ? '#059669' : 'var(--border)',
            }}
            title={attended ? 'Asistió' : 'No asistió'}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs font-medium text-muted-foreground">
          {attended} de {weeks.length} semanas
        </p>
        {streak >= 2 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#D1FAE5', color: '#059669' }}>
            {streak} sem. racha
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = 'resumen' | 'reservas' | 'pagos' | 'comunicaciones';

function TabBar({ active, onChange, verFinanzas }: { active: Tab; onChange: (t: Tab) => void; verFinanzas: boolean }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'reservas', label: 'Reservas' },
    ...(verFinanzas ? [{ id: 'pagos' as Tab, label: 'Pagos' }] : []),
    { id: 'comunicaciones', label: 'Comunicaciones' },
  ];
  return (
    <div className="flex border-b border-border bg-card rounded-t-xl overflow-hidden">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap',
            active === t.id
              ? 'text-foreground border-b-2 border-foreground -mb-px'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DetalleSocio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const rol = useRol();
  const verFinanzas = rol !== 'INSTRUCTOR';

  const {
    socios, suscripciones, planesTarifa, recibos, reservas, sesiones,
    tiposClase, salas, instructores, notasInternas,
    updateSocio, deleteSocio, assignPlan, marcarCobrado, addRecibo, cobrarTodosPendientes,
    addTagSocio, removeTagSocio, pausarSuscripcion, reanudarSuscripcion,
    addNota, deleteNota,
    notasProgreso, addNotaProgreso,
  } = useStudio();

  // ── Hydration fix ──────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const now = mounted ? new Date() : new Date('2026-06-29');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('resumen');
  const [showEdit, setShowEdit] = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showAddRecibo, setShowAddRecibo] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [notaText, setNotaText] = useState('');
  const [reservaFilter, setReservaFilter] = useState<'todas' | 'confirmadas' | 'asistidas' | 'canceladas'>('todas');
  const [reservasPage, setReservasPage] = useState(20);
  const [toast, setToast] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  // ── AI instructor notes ────────────────────────────────────────────────────
  const [aiNoteText, setAiNoteText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    progreso: string | null;
    alertas: string | null;
    planProximaSesion: string | null;
    ejerciciosCasa: string | null;
  } | null>(null);
  const [msgForm, setMsgForm] = useState({ asunto: '', cuerpo: '' });
  const [editForm, setEditForm] = useState({ nombre: '', apellidos: '', email: '', telefono: '', nif: '' });
  const [reciboForm, setReciboForm] = useState({ concepto: '', importe: '', fechaVencimiento: localDate(new Date()) });

  // ── Fake communications log (stored locally per socia) ─────────────────────
  const [comunicaciones, setComunicaciones] = useState<Array<{
    id: string; asunto: string; cuerpo: string; fecha: string; tipo: 'EMAIL';
  }>>([]);

  const socio = socios.find(s => s.id === id);

  if (!socio) {
    return (
      <div className="text-center py-20">
        <p className="font-medium text-muted-foreground">Socia no encontrada.</p>
        <Link href="/socios" className="text-sm mt-3 inline-block font-semibold text-brand-secondary">
          ← Volver a socias
        </Link>
      </div>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const suscripcion = suscripciones.find(s => s.socioId === id && (s.estado === 'ACTIVA' || s.estado === 'PAUSADA'));
  const plan = suscripcion ? planesTarifa.find(p => p.id === suscripcion.planId) : null;
  const tags = socio.tags ?? [];
  const misNotas = notasInternas.filter(n => n.socioId === id).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const misRecibos = recibos.filter(r => r.socioId === id).sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento));
  const misReservas = reservas.filter(r => r.socioId === id).sort((a, b) => {
    const sa = sesiones.find(s => s.id === a.sesionId);
    const sb = sesiones.find(s => s.id === b.sesionId);
    return (sb?.inicio ?? '').localeCompare(sa?.inicio ?? '');
  });

  const proximasReservas = misReservas.filter(r => {
    const ses = sesiones.find(s => s.id === r.sesionId);
    return ses && new Date(ses.inicio) > now && (r.estado === 'CONFIRMADA' || r.estado === 'LISTA_ESPERA');
  }).slice(0, 3);

  const asistidas = misReservas.filter(r => r.estado === 'ASISTIDA').length;
  const estesMes = misReservas.filter(r => {
    const ses = sesiones.find(s => s.id === r.sesionId);
    if (!ses) return false;
    const d = new Date(ses.inicio);
    return r.estado === 'ASISTIDA' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const bonosComprados = suscripciones.filter(s => s.socioId === id).length;
  const totalGastado = misRecibos.filter(r => r.estado === 'COBRADO').reduce((acc, r) => acc + r.importe, 0);
  const pendientes = misRecibos.filter(r => r.estado === 'PENDIENTE');

  // ── Ficha rápida (CRM) ──────────────────────────────────────────────────────
  const ultimaAsistidaFecha = misReservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesiones.find(s => s.id === r.sesionId))
    .filter((s): s is typeof sesiones[number] => !!s)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))[0]?.inicio ?? null;
  const diasSinVenir = ultimaAsistidaFecha ? Math.floor((now.getTime() - new Date(ultimaAsistidaFecha).getTime()) / 86400000) : null;
  const suscripcionActiva = suscripciones.find(s => s.socioId === id && s.estado === 'ACTIVA') ?? null;
  const planActivo = suscripcionActiva ? planesTarifa.find(p => p.id === suscripcionActiva.planId) ?? null : null;
  const bonosActivos = suscripciones.filter(s => s.socioId === id && s.estado === 'ACTIVA').length;
  const pendientesImporte = pendientes.reduce((acc, r) => acc + r.importe, 0);
  const cumpleanos = socio.fechaNacimiento
    ? new Date(socio.fechaNacimiento).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    : null;

  // 12-week attendance sparkline
  const sparklineWeeks = Array.from({ length: 12 }, (_, i) => {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (11 - i) * 7 - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return misReservas.some(r => {
      const ses = sesiones.find(s => s.id === r.sesionId);
      if (!ses) return false;
      const d = new Date(ses.inicio);
      return r.estado === 'ASISTIDA' && d >= weekStart && d < weekEnd;
    });
  });

  // Filtered reservas for "Reservas" tab
  const filteredReservas = misReservas.filter(r => {
    if (reservaFilter === 'todas') return true;
    if (reservaFilter === 'confirmadas') return r.estado === 'CONFIRMADA';
    if (reservaFilter === 'asistidas') return r.estado === 'ASISTIDA';
    if (reservaFilter === 'canceladas') return r.estado === 'CANCELADA' || r.estado === 'NO_ASISTIO';
    return true;
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const tagsDisponibles = TAGS_OPTIONS.filter(t => !tags.includes(t.label));

  function getReservaInfo(r: typeof misReservas[0]) {
    const ses = sesiones.find(x => x.id === r.sesionId);
    if (!ses) return { label: 'Clase eliminada', color: '#BFDBFE', date: '', time: '', sala: '', instructor: '' };
    const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
    const sala = salas.find(x => x.id === ses.salaId);
    const instructor = instructores.find(x => x.id === ses.instructorId);
    return {
      label: tipo?.nombre ?? 'Clase',
      color: tipo?.color ?? '#BFDBFE',
      date: new Date(ses.inicio).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      time: formatHora(ses.inicio),
      sala: sala?.nombre ?? '',
      instructor: instructor?.nombre ?? '',
    };
  }

  function openEdit() {
    setEditForm({
      nombre: socio!.nombre,
      apellidos: socio!.apellidos,
      email: socio!.email,
      telefono: socio!.telefono ?? '',
      nif: socio!.nif ?? '',
    });
    setShowEdit(true);
  }

  function saveEdit() {
    updateSocio(id, {
      nombre: editForm.nombre.trim(),
      apellidos: editForm.apellidos.trim(),
      email: editForm.email.trim(),
      telefono: editForm.telefono || null,
      nif: editForm.nif || null,
    });
    setShowEdit(false);
    setToast('Socia actualizada');
  }

  function handleDelete() {
    deleteSocio(id);
    window.location.href = '/socios';
  }

  function handleAddRecibo() {
    addRecibo({
      socioId: id,
      suscripcionId: suscripcion?.id ?? null,
      concepto: reciboForm.concepto.trim(),
      importe: parseFloat(reciboForm.importe),
      fechaVencimiento: reciboForm.fechaVencimiento,
    });
    setReciboForm({ concepto: '', importe: '', fechaVencimiento: localDate(new Date()) });
    setShowAddRecibo(false);
    setToast('Cobro creado');
  }

  function handleAddNota() {
    if (!notaText.trim()) return;
    addNota(id, notaText);
    setNotaText('');
  }

  async function handleAiNote() {
    if (!aiNoteText.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch('/api/ai/instructor-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: aiNoteText,
          socioId: id,
          instructorId: instructores[0]?.id ?? 'inst-1',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setAiResult({
        progreso: data.progreso,
        alertas: data.alertas,
        planProximaSesion: data.planProximaSesion,
        ejerciciosCasa: data.ejerciciosCasa,
      });
    } catch (err) {
      setToast('Error al procesar con IA');
    } finally {
      setAiLoading(false);
    }
  }

  function handleSaveAiNote() {
    if (!aiResult) return;
    addNotaProgreso({
      socioId: id,
      instructorId: instructores[0]?.id ?? 'inst-1',
      sesionId: null,
      textoLibre: aiNoteText,
      progreso: aiResult.progreso,
      alertas: aiResult.alertas,
      planProximaSesion: aiResult.planProximaSesion,
      ejerciciosCasa: aiResult.ejerciciosCasa,
    });
    setAiNoteText('');
    setAiResult(null);
    setToast('Nota guardada');
  }

  function handleSendMessage() {
    if (!msgForm.asunto.trim() || !msgForm.cuerpo.trim()) return;
    setComunicaciones(prev => [{
      id: `msg-${Date.now()}`,
      asunto: msgForm.asunto,
      cuerpo: msgForm.cuerpo,
      fecha: new Date().toISOString(),
      tipo: 'EMAIL' as const,
    }, ...prev]);
    setMsgForm({ asunto: '', cuerpo: '' });
    setShowSendMessage(false);
    setToast('Email enviado');
  }

  // ── Sessions progress ──────────────────────────────────────────────────────
  const sesionesRestantes = suscripcion?.sesionesRestantes ?? null;
  const sesionesTotales = plan?.sesiones ?? null;
  const sesionesColor =
    sesionesRestantes === 0 ? '#DC2626' :
    sesionesRestantes !== null && sesionesRestantes <= 2 ? '#D97706' :
    '#059669';

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      {/* Back nav */}
      <div className="px-6 pt-6 pb-0">
        <Link href="/socios" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft size={15} />
          Volver a socias
        </Link>
      </div>

      {/* 2-column layout (stacked below lg, side-by-side on desktop) */}
      <div className="px-4 sm:px-6 pb-10 flex flex-col lg:flex-row gap-6 items-start max-w-7xl">

        {/* ────────────── LEFT: main content ────────────── */}
        <div className="flex-1 min-w-0 space-y-0">

          {/* Tab bar + panels */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <TabBar active={activeTab} onChange={setActiveTab} verFinanzas={verFinanzas} />

            <div className="p-5">

              {/* ═══ TAB: RESUMEN ═══════════════════════════════════════════ */}
              {activeTab === 'resumen' && (
                <div className="space-y-5">

                  {/* Current plan card */}
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 bg-muted border-b border-border">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Plan activo</span>
                      {verFinanzas && (
                        <button
                          onClick={() => setShowChangePlan(true)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                          style={{ backgroundColor: '#FFF2F7', color: '#7AA80E' }}
                        >
                          {plan ? 'Cambiar plan' : 'Asignar plan'}
                        </button>
                      )}
                    </div>
                    <div className="p-5">
                      {plan && suscripcion ? (
                        <>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-bold text-foreground text-base">{plan.nombre}</p>
                              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                                {plan.tipo === 'MENSUAL' ? 'Mensual ilimitado' : plan.tipo === 'BONO' ? `Bono ${plan.sesiones ?? ''} sesiones` : 'Puntual'}
                                {' · '}Desde {fecha(suscripcion.fechaInicio)}
                              </p>
                              {suscripcion.estado === 'PAUSADA' && (
                                <span className="inline-block mt-2 text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>Pausada</span>
                              )}
                            </div>
                            {verFinanzas && (
                              <div className="text-right shrink-0">
                                <p className="text-2xl font-extrabold text-foreground">{plan.precio} €</p>
                                <p className="text-xs font-medium text-muted-foreground">{plan.tipo === 'MENSUAL' ? '/ mes' : 'bono'}</p>
                              </div>
                            )}
                          </div>

                          {/* Sessions remaining — BIG colored number */}
                          {sesionesTotales !== null && sesionesRestantes !== null && (
                            <div className="mt-5">
                              <div className="flex items-end gap-3 mb-2">
                                <span
                                  className="text-5xl font-extrabold leading-none tabular-nums"
                                  style={{ color: sesionesColor }}
                                >
                                  {sesionesRestantes}
                                </span>
                                <span className="text-sm font-medium text-muted-foreground mb-1.5">
                                  de {sesionesTotales} sesiones restantes
                                </span>
                              </div>
                              <div className="h-2 rounded-full overflow-hidden bg-muted">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min((sesionesRestantes / sesionesTotales) * 100, 100)}%`,
                                    backgroundColor: sesionesColor,
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Alert banners */}
                          {sesionesRestantes === 0 && (
                            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: '#FFF1F2', border: '1.5px solid #FECDD3' }}>
                              <AlertTriangle size={16} className="text-red-500 shrink-0" />
                              <span className="text-sm font-bold text-red-600 flex-1">Bono agotado — sin sesiones disponibles</span>
                              <button
                                onClick={() => setShowChangePlan(true)}
                                className="text-xs font-bold px-3.5 py-2 rounded-lg text-white shrink-0"
                                style={{ backgroundColor: '#DC2626' }}
                              >
                                Renovar bono
                              </button>
                            </div>
                          )}
                          {sesionesRestantes !== null && sesionesRestantes > 0 && sesionesRestantes <= 2 && (
                            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
                              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                              <span className="text-sm font-semibold text-amber-700 flex-1">Quedan solo {sesionesRestantes} sesiones</span>
                              <button
                                onClick={() => setShowChangePlan(true)}
                                className="text-xs font-bold px-3.5 py-2 rounded-lg shrink-0"
                                style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
                              >
                                Renovar
                              </button>
                            </div>
                          )}

                          <div className="mt-4 flex gap-2">
                            {suscripcion.estado === 'ACTIVA' ? (
                              <button
                                onClick={() => pausarSuscripcion(suscripcion.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border hover:bg-muted transition-colors text-muted-foreground"
                              >
                                <Pause size={12} />Pausar
                              </button>
                            ) : (
                              <button
                                onClick={() => reanudarSuscripcion(suscripcion.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
                              >
                                <Play size={12} />Reanudar
                              </button>
                            )}
                            <button
                              onClick={() => assignPlan(id, null)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors text-muted-foreground"
                            >
                              Cancelar suscripción
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="py-6 text-center">
                          <p className="text-sm font-medium text-muted-foreground">Sin suscripción activa</p>
                          <button
                            onClick={() => setShowChangePlan(true)}
                            className="mt-3 text-sm font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors"
                          >
                            Asignar plan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attendance sparkline */}
                  <div className="border border-border rounded-xl p-5">
                    <SectionTitle>Constancia — últimas 12 semanas</SectionTitle>
                    <AttendanceSparkline weeks={sparklineWeeks} />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Clases asistidas', value: String(asistidas), color: 'var(--foreground)' },
                      { label: 'Clases este mes', value: String(estesMes), color: 'var(--foreground)' },
                      { label: 'Bonos comprados', value: String(bonosComprados), color: 'var(--foreground)' },
                      ...(verFinanzas ? [{ label: 'Gasto total', value: `${totalGastado.toFixed(0)} €`, color: '#059669' }] : []),
                    ].map(stat => (
                      <div key={stat.label} className="border border-border bg-card rounded-xl p-4">
                        <p className="text-2xl font-extrabold" style={{ color: stat.color }}>{stat.value}</p>
                        <p className="text-xs font-medium text-muted-foreground mt-1 leading-snug">{stat.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Proximas reservas */}
                  {proximasReservas.length > 0 && (
                    <div className="border border-border rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Clock size={15} className="text-[#7AA80E]" />
                        <SectionTitle>Próximas reservas</SectionTitle>
                      </div>
                      <div className="space-y-2">
                        {proximasReservas.map(r => {
                          const info = getReservaInfo(r);
                          const badge = BADGE_RESERVA[r.estado] ?? BADGE_RESERVA.CANCELADA;
                          return (
                            <div key={r.id} className="flex items-center gap-3 py-3 px-3.5 rounded-xl bg-muted">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{info.label}</p>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {info.date}{info.time ? ` · ${info.time}` : ''}{info.sala ? ` · ${info.sala}` : ''}
                                </p>
                              </div>
                              <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: badge.bg, color: badge.text }}>
                                {badge.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Internal notes */}
                  <div className="border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <MessageSquare size={15} className="text-muted-foreground" />
                      <SectionTitle>Notas internas</SectionTitle>
                    </div>
                    <div className="mb-4 rounded-xl border border-border overflow-hidden focus-within:border-foreground transition-colors">
                      <textarea
                        rows={2}
                        placeholder="Añadir nota interna… (solo visible para el equipo)"
                        value={notaText}
                        onChange={e => setNotaText(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none resize-none bg-transparent"
                      />
                      {notaText.trim() && (
                        <div className="flex justify-end px-3 pb-2">
                          <button onClick={handleAddNota} className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-primary-foreground bg-primary">
                            Guardar nota
                          </button>
                        </div>
                      )}
                    </div>
                    {misNotas.length === 0 ? (
                      <p className="text-sm text-center py-4 text-muted-foreground font-medium">Sin notas aún.</p>
                    ) : (
                      <div className="space-y-3">
                        {misNotas.map(nota => (
                          <div key={nota.id} className="flex gap-3">
                            <div className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
                              style={nota.tipo === 'SISTEMA' ? { backgroundColor: '#FFF2F7', color: '#7AA80E' } : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                              {nota.tipo === 'SISTEMA' ? '⚙' : 'MS'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-bold text-foreground">{nota.tipo === 'SISTEMA' ? 'Sistema' : 'María Soler'}</span>
                                <span className="text-[10px] font-medium text-muted-foreground">{fecha(nota.creadoEn)}</span>
                              </div>
                              <p className="text-sm mt-0.5" style={{ color: nota.tipo === 'SISTEMA' ? 'var(--muted-foreground)' : 'var(--foreground)' }}>{nota.texto}</p>
                            </div>
                            {nota.tipo === 'NOTA' && (
                              <button onClick={() => deleteNota(nota.id)} className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors mt-0.5">
                                <X size={11} className="text-red-400" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI Instructor Notes */}
                  <div className="border border-border rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Bot size={15} className="text-muted-foreground" />
                      <SectionTitle>Nota de sesión IA</SectionTitle>
                      <span className="ml-auto text-[10px] bg-brand/10 text-brand-secondary px-2 py-0.5 rounded-full font-semibold">Beta</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Dicta o escribe lo que pasó en la sesión. La IA estructura automáticamente la nota de progreso.
                    </p>
                    <div className="rounded-xl border border-border overflow-hidden focus-within:border-foreground transition-colors mb-3">
                      <textarea
                        rows={3}
                        placeholder='Ej: "Laura estuvo bien hoy, mejoró la alineación en el rollup. Sigue con tensión cervical. La próxima sesión trabajaremos la movilidad torácica. Le mando ejercicios de respiración para casa."'
                        value={aiNoteText}
                        onChange={e => setAiNoteText(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none bg-transparent"
                      />
                    </div>
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={handleAiNote}
                        disabled={aiLoading || !aiNoteText.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-brand text-brand-foreground rounded-xl text-xs font-bold hover:brightness-95 disabled:opacity-40 transition-colors"
                      >
                        {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
                        {aiLoading ? 'Procesando...' : 'Generar nota IA'}
                      </button>
                    </div>
                    {aiResult && (
                      <div className="rounded-xl border border-border bg-brand/10 p-4 space-y-3">
                        <p className="text-xs font-bold text-brand-secondary uppercase tracking-wide mb-2">Nota estructurada</p>
                        {aiResult.progreso && (
                          <div>
                            <p className="text-[10px] font-bold text-brand-secondary uppercase tracking-wide mb-0.5">Progreso</p>
                            <p className="text-sm text-foreground">{aiResult.progreso}</p>
                          </div>
                        )}
                        {aiResult.alertas && (
                          <div>
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">Alertas / Limitaciones</p>
                            <p className="text-sm text-foreground">{aiResult.alertas}</p>
                          </div>
                        )}
                        {aiResult.planProximaSesion && (
                          <div>
                            <p className="text-[10px] font-bold text-brand-secondary uppercase tracking-wide mb-0.5">Próxima sesión</p>
                            <p className="text-sm text-foreground">{aiResult.planProximaSesion}</p>
                          </div>
                        )}
                        {aiResult.ejerciciosCasa && (
                          <div>
                            <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-0.5">Ejercicios casa</p>
                            <p className="text-sm text-foreground">{aiResult.ejerciciosCasa}</p>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2 border-t border-border">
                          <button
                            onClick={handleSaveAiNote}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-[#2A2A24] transition-colors"
                          >
                            <CheckCircle2 size={12} /> Guardar nota
                          </button>
                          <button
                            onClick={() => setAiResult(null)}
                            className="px-3 py-1.5 border border-border text-foreground rounded-lg text-xs font-bold hover:bg-muted transition-colors"
                          >
                            Descartar
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Previous AI notes */}
                    {notasProgreso.filter(n => n.socioId === id).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-muted">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Historial de notas IA</p>
                        <div className="space-y-2">
                          {notasProgreso.filter(n => n.socioId === id).slice(0, 3).map(nota => (
                            <div key={nota.id} className="rounded-lg bg-muted border border-border px-3 py-2.5">
                              <p className="text-[10px] text-muted-foreground mb-1">{fecha(nota.creadaEn)}</p>
                              {nota.progreso && <p className="text-xs text-foreground line-clamp-2">{nota.progreso}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ═══ TAB: RESERVAS ══════════════════════════════════════════ */}
              {activeTab === 'reservas' && (
                <div>
                  {/* Filter row */}
                  <div className="flex items-center gap-2 mb-4">
                    <Filter size={14} className="text-muted-foreground" />
                    {(['todas', 'confirmadas', 'asistidas', 'canceladas'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => { setReservaFilter(f); setReservasPage(20); }}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors',
                          reservaFilter === f ? 'bg-brand text-brand-foreground' : 'border border-border text-muted-foreground hover:border-muted-foreground'
                        )}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                    <span className="ml-auto text-xs font-medium text-muted-foreground">
                      {filteredReservas.length} reservas
                    </span>
                  </div>

                  {/* Table */}
                  {filteredReservas.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Sin reservas para este filtro.</p>
                    </div>
                  ) : (
                    <>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted border-b border-border">
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Fecha</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Clase</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Instructora</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Sala</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted">
                            {filteredReservas.slice(0, reservasPage).map(r => {
                              const info = getReservaInfo(r);
                              const badge = BADGE_RESERVA[r.estado] ?? BADGE_RESERVA.CANCELADA;
                              return (
                                <tr key={r.id} className="hover:bg-muted transition-colors">
                                  <td className="px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                                    {info.date}<br />
                                    <span className="text-muted-foreground">{info.time}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                                      <span className="font-semibold text-foreground">{info.label}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{info.instructor}</td>
                                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{info.sala}</td>
                                  <td className="px-4 py-3 text-right">
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: badge.bg, color: badge.text }}>
                                      {badge.label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {filteredReservas.length > reservasPage && (
                        <button
                          onClick={() => setReservasPage(p => p + 20)}
                          className="mt-3 w-full py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Ver más ({filteredReservas.length - reservasPage} restantes)
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ═══ TAB: PAGOS ═════════════════════════════════════════════ */}
              {activeTab === 'pagos' && verFinanzas && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAddRecibo(true)}
                        className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors"
                      >
                        <Plus size={13} />Nuevo cobro
                      </button>
                      {pendientes.length > 0 && (
                        <button
                          onClick={() => { cobrarTodosPendientes(); setToast(`${pendientes.length} recibo(s) cobrados`); }}
                          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg transition-colors"
                          style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
                        >
                          <CheckCircle2 size={13} />Cobrar pendientes ({pendientes.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {misRecibos.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Sin recibos todavía.</p>
                    </div>
                  ) : (
                    <>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted border-b border-border">
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Fecha</th>
                              <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Concepto</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Importe</th>
                              <th className="text-right px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Estado</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted">
                            {misRecibos.map(r => (
                              <tr key={r.id} className="hover:bg-muted transition-colors">
                                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                  {fecha(r.fechaVencimiento)}
                                </td>
                                <td className="px-4 py-3 font-semibold text-foreground max-w-[200px] truncate">
                                  {r.concepto}
                                </td>
                                <td className="px-4 py-3 text-right font-extrabold text-foreground tabular-nums">
                                  {r.importe.toFixed(2)} €
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full', BADGE_RECIBO[r.estado])}>
                                    {LABEL_RECIBO[r.estado]}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {r.estado === 'PENDIENTE' && (
                                    <button
                                      onClick={() => { marcarCobrado(r.id); setToast('Recibo cobrado'); }}
                                      className="text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
                                      style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
                                    >
                                      Cobrar
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end mt-3 pt-3 border-t border-muted">
                        <div className="text-right">
                          <p className="text-xs font-medium text-muted-foreground">Total cobrado</p>
                          <p className="text-xl font-extrabold text-foreground">{totalGastado.toFixed(2)} €</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ═══ TAB: COMUNICACIONES ════════════════════════════════════ */}
              {activeTab === 'comunicaciones' && (
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {comunicaciones.length} mensaje(s) enviado(s)
                    </p>
                    <button
                      onClick={() => setShowSendMessage(true)}
                      className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors"
                    >
                      <Send size={13} />Enviar mensaje
                    </button>
                  </div>

                  {comunicaciones.length === 0 ? (
                    <div className="py-16 text-center border border-dashed border-border rounded-xl">
                      <Mail size={28} className="mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm font-semibold text-muted-foreground">Sin comunicaciones enviadas</p>
                      <p className="text-xs text-muted-foreground mt-1">Los emails enviados a esta socia aparecerán aquí.</p>
                      <button
                        onClick={() => setShowSendMessage(true)}
                        className="mt-4 text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors"
                      >
                        Enviar primer mensaje
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {comunicaciones.map(c => (
                        <div key={c.id} className="border border-border rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#FFF2F7' }}>
                                <Mail size={14} style={{ color: '#7AA80E' }} />
                              </div>
                              <div>
                                <p className="font-semibold text-foreground text-sm">{c.asunto}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.cuerpo}</p>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#D1FAE5', color: '#059669' }}>
                                Enviado
                              </span>
                              <p className="text-[10px] text-muted-foreground mt-1">{fecha(c.fecha)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ────────────── RIGHT: sidebar ────────────── */}
        <div className="w-full lg:w-72 shrink-0 space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] overflow-y-auto pb-4 lg:pr-1 order-first lg:order-none">

          {/* Avatar + identity */}
          <Card>
            {/* Avatar */}
            <div className="flex flex-col items-center text-center mb-5">
              <button onClick={() => setShowAvatarPicker(v => !v)} className="mb-3">
                <ProfileAvatar avatarId={socio.avatar} nombre={socio.nombre} apellidos={socio.apellidos} size="xl" />
              </button>
              {showAvatarPicker && (
                <div className="w-full text-left mb-3 p-3 rounded-xl border border-border bg-[#F8F9FB]">
                  <AvatarPicker value={socio.avatar ?? null} onChange={id => updateSocio(socio.id, { avatar: id })} />
                </div>
              )}
              <h2 className="text-base font-bold text-foreground leading-tight">
                {socio.nombre} {socio.apellidos}
              </h2>
              {/* Status badge */}
              <span
                className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mt-2"
                style={socio.activo ? { backgroundColor: '#D1FAE5', color: '#059669' } : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: socio.activo ? '#059669' : 'var(--muted-foreground)' }} />
                {socio.activo ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            {/* Contact info */}
            <div className="space-y-2.5 border-t border-muted pt-4">
              <div className="flex items-center gap-2.5">
                <Mail size={13} className="text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-foreground truncate flex-1">{socio.email}</span>
              </div>
              {socio.telefono && (
                <div className="flex items-center gap-2.5">
                  <Phone size={13} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-foreground">{socio.telefono}</span>
                </div>
              )}
              {socio.nif && (
                <div className="flex items-center gap-2.5">
                  <CreditCard size={13} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-foreground">{socio.nif}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5">
                <Calendar size={13} className="text-muted-foreground shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">Alta: {fecha(socio.fechaAlta)}</span>
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4 pt-4 border-t border-muted">
                {tags.map(tag => {
                  const style = tagStyle(tag);
                  return (
                    <span key={tag} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: style.bg, color: style.text }}>
                      {tag}
                      <button onClick={() => removeTagSocio(id, tag)} className="hover:opacity-60 transition-opacity">
                        <X size={9} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => setShowAddTag(true)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border border-dashed border-border hover:border-muted-foreground transition-colors text-muted-foreground"
            >
              <Tag size={10} />+ Etiqueta
            </button>

            {/* Actions */}
            <div className="space-y-2 mt-4 pt-4 border-t border-muted">
              <button
                onClick={() => { setActiveTab('comunicaciones'); setShowSendMessage(true); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border border-border text-foreground hover:bg-muted transition-colors"
              >
                <Mail size={14} />Enviar email
              </button>
              <button
                onClick={openEdit}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 transition-colors"
              >
                <Pencil size={14} />Editar socia
              </button>
              <button
                onClick={() => updateSocio(id, { activo: !socio.activo })}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                {socio.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />Eliminar socia
              </button>
            </div>
          </Card>

          {/* Ficha rápida (CRM) */}
          <Card>
            <SectionTitle>Ficha rápida</SectionTitle>
            <div className="space-y-2.5 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Última asistencia</span>
                <span className="text-xs font-bold" style={{ color: diasSinVenir != null && diasSinVenir >= 30 ? '#DC2626' : 'var(--foreground)' }}>
                  {diasSinVenir == null ? 'Nunca' : diasSinVenir === 0 ? 'Hoy' : `Hace ${diasSinVenir} días`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Membresía</span>
                <span className="text-xs font-bold text-foreground">{planActivo?.nombre ?? 'Sin plan'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Bonos activos</span>
                <span className="text-xs font-bold text-foreground">{bonosActivos}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pagos pendientes</span>
                <span className="text-xs font-bold" style={{ color: pendientesImporte > 0 ? '#DC2626' : 'var(--foreground)' }}>
                  {pendientesImporte.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
                </span>
              </div>
              {cumpleanos && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cumpleaños</span>
                  <span className="text-xs font-bold text-foreground">{cumpleanos}</span>
                </div>
              )}
            </div>
            {misNotas.length > 0 && (
              <div className="mt-3 pt-3 border-t border-muted">
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {misNotas.filter(n => n.tipo === 'NOTA').slice(0, 2).map(n => `• ${n.texto}`).join('\n') || 'Sin notas.'}
                </p>
              </div>
            )}
          </Card>

          {/* Quick plan summary */}
          {plan && suscripcion && (
            <Card>
              <SectionTitle>Plan</SectionTitle>
              <p className="text-sm font-bold text-foreground">{plan.nombre}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {plan.tipo === 'MENSUAL' ? 'Ilimitado' : sesionesRestantes !== null ? `${sesionesRestantes} sesiones restantes` : ''}
              </p>
              {suscripcion.fechaFin && (
                <p className="text-xs text-muted-foreground mt-0.5">Expira: {fecha(suscripcion.fechaFin)}</p>
              )}
              <button
                onClick={() => setShowChangePlan(true)}
                className="mt-3 w-full text-xs font-bold py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Cambiar plan
              </button>
            </Card>
          )}

          {/* Contract acceptance */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={14} className={socio.aceptacionContrato ? 'text-[#059669]' : 'text-muted-foreground'} />
              <SectionTitle>Contrato</SectionTitle>
            </div>
            {socio.aceptacionContrato ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#D1FAE5]">
                  <CheckCircle2 size={13} className="text-[#059669] shrink-0" />
                  <span className="text-xs font-bold text-[#059669]">Contrato firmado</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <FileSignature size={11} className="shrink-0" />
                    <span className="font-medium text-foreground truncate">{socio.aceptacionContrato.firma}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar size={11} className="shrink-0" />
                    <span>{fecha(socio.aceptacionContrato.fecha)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sin contrato firmado.</p>
            )}
          </Card>

        </div>
      </div>

      {/* ═══════════════ MODALS ════════════════════════════════════════════════ */}

      {/* Add Tag */}
      <Dialog open={showAddTag} onOpenChange={setShowAddTag}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">Añadir etiqueta</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mt-3">
            {tagsDisponibles.map(t => (
              <button
                key={t.label}
                onClick={() => { addTagSocio(id, t.label); setShowAddTag(false); }}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105"
                style={{ backgroundColor: t.bg, color: t.text }}
              >
                {t.label}
              </button>
            ))}
            {tagsDisponibles.length === 0 && (
              <p className="text-sm text-muted-foreground">Todas las etiquetas ya están asignadas.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit socia */}
      <Dialog open={showEdit} onOpenChange={open => !open && setShowEdit(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Editar socia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <FF label="Nombre">
                <input className={inputCls} value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </FF>
              <FF label="Apellidos">
                <input className={inputCls} value={editForm.apellidos} onChange={e => setEditForm(f => ({ ...f, apellidos: e.target.value }))} />
              </FF>
            </div>
            <FF label="Email">
              <input type="email" className={inputCls} value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </FF>
            <div className="grid grid-cols-2 gap-4">
              <FF label="Teléfono">
                <input className={inputCls} value={editForm.telefono} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} />
              </FF>
              <FF label="NIF (opcional)">
                <input className={inputCls} value={editForm.nif} onChange={e => setEditForm(f => ({ ...f, nif: e.target.value }))} />
              </FF>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowEdit(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={saveEdit}
              disabled={!editForm.nombre || !editForm.apellidos || !editForm.email}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 transition-colors"
            >
              Guardar cambios
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change plan */}
      <Dialog open={showChangePlan && verFinanzas} onOpenChange={open => !open && setShowChangePlan(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">{plan ? 'Cambiar plan' : 'Asignar plan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-3">
            <button
              onClick={() => { assignPlan(id, null); setShowChangePlan(false); }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold text-left transition-colors hover:bg-muted"
              style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
            >
              <span>Sin plan</span>
              {!plan && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted">Actual</span>}
            </button>
            {planesTarifa.filter(p => p.activo).map(p => (
              <button
                key={p.id}
                onClick={() => { assignPlan(id, p.id); setShowChangePlan(false); setToast(`Plan "${p.nombre}" asignado`); }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-semibold text-left transition-colors hover:bg-brand/10"
                style={{
                  borderColor: suscripcion?.planId === p.id ? '#BFDBFE' : 'var(--border)',
                  backgroundColor: suscripcion?.planId === p.id ? 'color-mix(in srgb, var(--brand) 10%, var(--card))' : 'white',
                }}
              >
                <div>
                  <p className="font-bold text-foreground">{p.nombre}</p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {p.precio} € {p.tipo === 'MENSUAL' ? '/ mes' : p.sesiones ? `· ${p.sesiones} sesiones` : ''}
                  </p>
                </div>
                {suscripcion?.planId === p.id && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFF2F7', color: '#7AA80E' }}>Actual</span>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add recibo */}
      <Dialog open={showAddRecibo} onOpenChange={open => !open && setShowAddRecibo(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Nuevo cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Concepto">
              <input
                className={inputCls}
                placeholder="Mensual Jul 2026"
                value={reciboForm.concepto}
                onChange={e => setReciboForm(f => ({ ...f, concepto: e.target.value }))}
              />
            </FF>
            <div className="grid grid-cols-2 gap-4">
              <FF label="Importe (€)">
                <input
                  type="number" min="0" step="0.01" className={inputCls}
                  placeholder="85.00"
                  value={reciboForm.importe}
                  onChange={e => setReciboForm(f => ({ ...f, importe: e.target.value }))}
                />
              </FF>
              <FF label="Vencimiento">
                <input
                  type="date" className={inputCls}
                  value={reciboForm.fechaVencimiento}
                  onChange={e => setReciboForm(f => ({ ...f, fechaVencimiento: e.target.value }))}
                />
              </FF>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowAddRecibo(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={handleAddRecibo}
              disabled={!reciboForm.concepto || !reciboForm.importe}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 transition-colors"
            >
              Crear cobro
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send message */}
      <Dialog open={showSendMessage} onOpenChange={open => !open && setShowSendMessage(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-foreground">Enviar mensaje a {socio.nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">Para: {socio.email}</p>
          <div className="space-y-4 mt-3">
            <FF label="Asunto">
              <input
                className={inputCls}
                placeholder="Recordatorio de clase…"
                value={msgForm.asunto}
                onChange={e => setMsgForm(f => ({ ...f, asunto: e.target.value }))}
              />
            </FF>
            <FF label="Mensaje">
              <textarea
                rows={5}
                className={inputCls + ' resize-none'}
                placeholder="Escribe tu mensaje aquí…"
                value={msgForm.cuerpo}
                onChange={e => setMsgForm(f => ({ ...f, cuerpo: e.target.value }))}
              />
            </FF>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setShowSendMessage(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!msgForm.asunto.trim() || !msgForm.cuerpo.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
            >
              <Send size={14} />Enviar email
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={showConfirmDelete} onOpenChange={open => !open && setShowConfirmDelete(false)}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-red-50">
              <Trash2 size={24} className="text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">Eliminar socia</h3>
              <p className="text-sm text-muted-foreground">
                Se eliminará {socio.nombre} {socio.apellidos}, su suscripción y todo su historial. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setShowConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted">
                Cancelar
              </button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && <Toast message={toast} onHide={() => setToast(null)} />}
    </div>
  );
}
