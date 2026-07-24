'use client';

import { useState, useMemo, useEffect, useRef, useId, isValidElement, cloneElement, type ReactElement, type ReactNode, type ElementType, type MouseEvent } from 'react';
import { dbStatsClientas } from '@/lib/supabase-data';
import { useCampoAsociado } from '@/components/ui/use-campo-asociado';
import { useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeVerFichaClinica } from '@/lib/permisos';
import { semaforo, SEMAFORO_META } from '@/lib/ficha-clinica';
import { enviarEmailBienvenida } from '@/lib/api-client';
import type { Socio, NivelSemaforo } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Search, Plus, Users, UserCheck, AlertCircle, Clock,
  ChevronUp, ChevronDown, ChevronsUpDown, Mail, Pencil,
  Trash2, AlertTriangle, CheckCircle2, Upload, X, UserX,
  Tag, Bookmark, FileText, PenLine, ArrowLeft, ShieldCheck
} from 'lucide-react';
import { cn, formatFechaLarga as formatDate } from '@/lib/utils';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { CamposExtraFields } from '@/components/socios/campos-extra-fields';
import { PageHeader } from '@/components/ui/page-header';

// ─── Shared style tokens ────────────────────────────────────────────────────
const inputCls =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground focus:outline-none focus:border-muted-foreground transition-colors placeholder:text-muted-foreground';
const selectCls = inputCls + ' appearance-none';

// ─── Types ───────────────────────────────────────────────────────────────────
type SmartFilter = 'todas' | 'activas' | 'sin_bono' | 'bono_expirado' | 'inactivas_30d';
type SortKey = 'nombre' | 'ultima_visita' | 'sesiones_restantes' | 'fecha_registro';
type SortDir = 'asc' | 'desc';

type FormSocia = {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  nif: string;
  planId: string;
  camposExtra: Record<string, string | number | boolean | null>;
};

const emptyForm = (): FormSocia => ({
  nombre: '',
  apellidos: '',
  email: '',
  telefono: '',
  nif: '',
  planId: '',
  camposExtra: {},
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function initials(nombre: string, apellidos: string) {
  return `${nombre[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

function avatarColor(str: string) {
  const colors = [
    ['#E0E7FF', '#6E9E0A'],
    ['#D1FAE5', '#065F46'],
    ['#FEF3C7', '#92400E'],
    ['#FCE7F3', '#9D174D'],
    ['#E0F2FE', '#0369A1'],
    ['#F3E8FF', '#6B21A8'],
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`;
  if (days < 365) return `Hace ${Math.floor(days / 30)} meses`;
  return `Hace ${Math.floor(days / 365)} año${Math.floor(days / 365) > 1 ? 's' : ''}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
// `description` es lo que faltaba: antes este wrapper solo aceptaba
// { label, children } y no había dónde explicar, p.ej., para qué se usa el
// email o qué pasa al elegir un plan aquí mismo. Mismo mecanismo que en
// Configuración: id + aria-describedby inyectados en el control real, así el
// lector de pantalla lee la explicación junto con el nombre del campo.
function FF({
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
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {description && (
        <p id={idDesc} className="text-xs leading-relaxed text-muted-foreground text-balance">
          {description}
        </p>
      )}
      {controlDescrito}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + '1A' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[22px] font-bold text-foreground leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={11} className="text-muted-foreground ml-1 inline" />;
  return dir === 'asc'
    ? <ChevronUp size={11} className="text-foreground ml-1 inline" />
    : <ChevronDown size={11} className="text-foreground ml-1 inline" />;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Socios() {
  const router = useRouter();
  const { socios, suscripciones, planesTarifa, reservas, sesiones, addSocio, updateSocio, deleteSocio, assignPlan, studioConfig, condicionesSalud, camposPersonalizados } =
    useStudio();
  const verFichaClinica = puedeVerFichaClinica(useRol());

  // Semáforo de salud por clienta (solo el color; el motivo vive en el detalle).
  // FICHA-CLINICA.md §1, §11 — RECEPCIÓN no ve ni el color.
  const semaforoPorSocio = useMemo(() => {
    const porSocio = new Map<string, NivelSemaforo>();
    if (!verFichaClinica) return porSocio;
    const grupos = new Map<string, typeof condicionesSalud>();
    for (const c of condicionesSalud) {
      const arr = grupos.get(c.socioId) ?? [];
      arr.push(c);
      grupos.set(c.socioId, arr);
    }
    for (const [socioId, conds] of grupos) {
      const nivel = semaforo(conds);
      if (nivel !== 'VERDE') porSocio.set(socioId, nivel);
    }
    return porSocio;
  }, [condicionesSalud, verFichaClinica]);

  // Filter & sort state
  const [busqueda, setBusqueda] = useState('');
  const [smartFilter, setSmartFilter] = useState<SmartFilter>('todas');
  // P0-34: paginación — no montar miles de filas (× 2 variantes responsive) a la
  // vez en el DOM. Se muestran de PAGE en PAGE con "Ver más".
  const PAGE = 50;
  const [visibles, setVisibles] = useState(PAGE);
  const [sortKey, setSortKey] = useState<SortKey>('nombre');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAsignarPlan, setShowAsignarPlan] = useState(false);
  const [asignarPlanId, setAsignarPlanId] = useState('');

  // Create / edit modal
  const [showForm, setShowForm] = useState<'nueva' | 'editar' | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormSocia>(emptyForm());
  const [confirmEliminar, setConfirmEliminar] = useState<string | null>(null);

  // Multi-step "nueva clienta" contract flow
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [firma, setFirma] = useState('');
  const [aceptado, setAceptado] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const contratoRef = useRef<HTMLDivElement>(null);

  // Reset selection when filters change
  useEffect(() => { setSelected(new Set()); }, [busqueda, smartFilter, sortKey, sortDir]);

  // Auto-open create modal when ?nuevo=1 in URL (linked from dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('nuevo') === '1') {
      setForm(emptyForm());
      setShowForm('nueva');
      window.history.replaceState({}, '', '/clientas');
    }
  }, []);

  // ── Índices precomputados (P0-34) ──────────────────────────────────────────
  // Antes cada helper escaneaba suscripciones/reservas/sesiones ENTERAS, y se
  // llamaban por cada socio en stats, en el filtro y en el comparador del sort:
  // O(socios² × reservas × sesiones). Ahora todo es O(1) por socio.
  const sesionById = useMemo(() => new Map(sesiones.map((s) => [s.id, s])), [sesiones]);
  const activeSusPorSocio = useMemo(() => {
    const m = new Map<string, typeof suscripciones[number]>();
    for (const s of suscripciones) {
      if ((s.estado === 'ACTIVA' || s.estado === 'PAUSADA') && !m.has(s.socioId)) m.set(s.socioId, s);
    }
    return m;
  }, [suscripciones]);
  const expiradaPorSocio = useMemo(() => {
    const m = new Set<string>();
    for (const s of suscripciones) if (s.estado === 'EXPIRADA') m.add(s.socioId);
    return m;
  }, [suscripciones]);
  const ultimaVisitaPorSocio = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reservas) {
      if (r.estado !== 'ASISTIDA') continue;
      const ses = sesionById.get(r.sesionId);
      if (!ses) continue;
      const prev = m.get(r.socioId);
      if (!prev || ses.inicio > prev) m.set(r.socioId, ses.inicio);
    }
    return m;
  }, [reservas, sesionById]);

  // ── Derived helpers (O(1) por socio con los índices de arriba) ─────────────
  function getActiveSus(socioId: string) {
    return activeSusPorSocio.get(socioId);
  }

  function getPlan(planId: string | undefined) {
    if (!planId) return null;
    return planesTarifa.find((p) => p.id === planId) ?? null;
  }

  function getLastVisit(socioId: string): string | null {
    return ultimaVisitaPorSocio.get(socioId) ?? null;
  }

  function isInactiva30d(socioId: string): boolean {
    const last = getLastVisit(socioId);
    if (!last) return true;
    return Date.now() - new Date(last).getTime() > 30 * 86400000;
  }

  function isBonoExpirado(socioId: string): boolean {
    return expiradaPorSocio.has(socioId) && !getActiveSus(socioId);
  }

  function estadoBadgeInfo(s: Socio): { label: string; bg: string; color: string; Icon?: typeof AlertCircle } {
    if (!s.activo) return { label: 'Inactiva', bg: 'var(--muted)', color: 'var(--muted-foreground)' };
    if (isBonoExpirado(s.id)) return { label: 'Bono expirado', bg: 'color-mix(in srgb, var(--destructive) 12%, var(--card))', color: 'var(--destructive)', Icon: AlertCircle };
    if (isInactiva30d(s.id)) return { label: 'Sin asistencia', bg: 'color-mix(in srgb, var(--warning) 12%, var(--card))', color: 'var(--warning)', Icon: Clock };
    return { label: 'Activa', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', color: 'var(--success)' };
  }

  function EstadoBadge({ s }: { s: Socio }) {
    const { label, bg, color, Icon } = estadoBadgeInfo(s);
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md" style={{ backgroundColor: bg, color }}>
        {Icon ? <Icon size={10} /> : <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </span>
    );
  }

  // ── Stats (F1 · B1: contadores del SERVIDOR, count() SQL sin cap 1000) ───────
  const [stats, setStats] = useState({ total: 0, activas: 0, conBono: 0, inactivas30d: 0 });
  useEffect(() => {
    let cancel = false;
    void dbStatsClientas().then((r) => { if (!cancel) setStats(r); });
    return () => { cancel = true; };
    // re-fetch cuando cambian los datos locales (alta/edición/reserva)
  }, [socios, suscripciones, reservas]);

  // ── Filtered + sorted list ─────────────────────────────────────────────────
  const lista = useMemo(() => {
    const q = busqueda.toLowerCase();
    const filtered = socios.filter((s) => {
      // Search
      const matchB =
        !q ||
        `${s.nombre} ${s.apellidos} ${s.email} ${s.telefono ?? ''}`.toLowerCase().includes(q);
      // Smart filter
      let matchF = true;
      if (smartFilter === 'activas') matchF = s.activo;
      if (smartFilter === 'sin_bono') matchF = !getActiveSus(s.id);
      if (smartFilter === 'bono_expirado') matchF = isBonoExpirado(s.id);
      if (smartFilter === 'inactivas_30d') matchF = isInactiva30d(s.id);
      return matchB && matchF;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'nombre') {
        cmp = `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`, 'es');
      } else if (sortKey === 'ultima_visita') {
        const la = getLastVisit(a.id);
        const lb = getLastVisit(b.id);
        if (!la && !lb) cmp = 0;
        else if (!la) cmp = 1;
        else if (!lb) cmp = -1;
        else cmp = new Date(lb).getTime() - new Date(la).getTime();
      } else if (sortKey === 'sesiones_restantes') {
        const sa = getActiveSus(a.id)?.sesionesRestantes ?? -1;
        const sb = getActiveSus(b.id)?.sesionesRestantes ?? -1;
        cmp = sb - sa;
      } else if (sortKey === 'fecha_registro') {
        cmp = new Date(b.fechaAlta).getTime() - new Date(a.fechaAlta).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socios, suscripciones, reservas, sesiones, busqueda, smartFilter, sortKey, sortDir]);

  // ── Sort toggle ────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  // Al cambiar filtros/búsqueda/orden, volver a la primera página.
  useEffect(() => { setVisibles(PAGE); }, [busqueda, smartFilter, sortKey, sortDir]);
  const listaVisible = useMemo(() => lista.slice(0, visibles), [lista, visibles]);

  // ── Bulk helpers ───────────────────────────────────────────────────────────
  // "Seleccionar todo" opera sobre TODA la lista filtrada (no solo la página
  // montada): la selección es un Set de ids independiente del render, y las
  // acciones masivas (email, asignar plan) deben cubrir todo lo filtrado, no
  // saltarse en silencio lo que aún no se ha paginado.
  const allFiltradosIds = useMemo(() => lista.map((s) => s.id), [lista]);
  const allSelected = allFiltradosIds.length > 0 && allFiltradosIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(allFiltradosIds));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleEnviarEmail() {
    const recipients = socios.filter((s) => selected.has(s.id) && s.email);
    recipients.forEach((s) => {
      enviarEmailBienvenida({ to: s.email, toName: `${s.nombre} ${s.apellidos}` });
    });
    setSelected(new Set());
  }

  function handleAsignarPlan() {
    if (!asignarPlanId) return;
    selected.forEach((id) => assignPlan(id, asignarPlanId));
    setSelected(new Set());
    setShowAsignarPlan(false);
    setAsignarPlanId('');
  }

  // ── Create / edit ──────────────────────────────────────────────────────────
  function resetModal() {
    setShowForm(null);
    setEditandoId(null);
    setForm(emptyForm());
    setFormStep(1);
    setFirma('');
    setAceptado(false);
    setScrolledToBottom(false);
  }

  function handleCrear() {
    const versionTexto = [studioConfig.politicaPrivacidad, studioConfig.terminosServicio].join('\n\n---\n\n');
    addSocio({
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      telefono: form.telefono || null,
      nif: form.nif || null,
      activo: true,
      camposExtra: form.camposExtra,
      planId: form.planId || undefined,
      aceptacionContrato: {
        fecha: new Date().toISOString(),
        firma: firma.trim(),
        versionTexto,
      },
    });
    if (form.email.trim()) {
      const plan = planesTarifa.find((p) => p.id === form.planId);
      enviarEmailBienvenida({
        to: form.email.trim(),
        toName: `${form.nombre.trim()} ${form.apellidos.trim()}`,
        planNombre: plan?.nombre,
      });
    }
    resetModal();
  }

  function handleEditar() {
    if (!editandoId) return;
    updateSocio(editandoId, {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      telefono: form.telefono || null,
      nif: form.nif || null,
      camposExtra: form.camposExtra,
    });
    if (form.planId) assignPlan(editandoId, form.planId);
    resetModal();
  }

  function openEdit(s: Socio, e: MouseEvent) {
    e.stopPropagation();
    const sus = suscripciones.find((x) => x.socioId === s.id && x.estado === 'ACTIVA');
    setForm({
      nombre: s.nombre,
      apellidos: s.apellidos,
      email: s.email,
      telefono: s.telefono ?? '',
      nif: s.nif ?? '',
      planId: sus?.planId ?? '',
      camposExtra: s.camposExtra ?? {},
    });
    setFormStep(1);
    setFirma('');
    setAceptado(false);
    setEditandoId(s.id);
    setShowForm('editar');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const SMART_FILTERS: { id: SmartFilter; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'activas', label: 'Activas' },
    { id: 'sin_bono', label: 'Sin bono' },
    { id: 'bono_expirado', label: 'Bono expirado' },
    { id: 'inactivas_30d', label: 'Sin asistencia 30d' },
  ];

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'ultima_visita', label: 'Última visita' },
    { key: 'sesiones_restantes', label: 'Sesiones rest.' },
    { key: 'fecha_registro', label: 'Fecha registro' },
  ];

  return (
    <div className="space-y-5 min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <PageHeader
        title="Clientas"
        description="Gestiona y haz seguimiento de todas tus clientas"
        actions={
          <>
            <button
              onClick={() => router.push('/clientas/importar')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-foreground bg-card border border-border hover:bg-muted transition-colors"
            >
              <Upload size={14} />
              Importar
            </button>
            <button
              onClick={() => { setForm(emptyForm()); setShowForm('nueva'); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-primary-foreground bg-primary hover:brightness-95 transition-colors shadow-sm"
            >
              <Plus size={14} />
              Nueva clienta
            </button>
          </>
        }
      />

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="Total clientas" value={stats.total} color="var(--muted-foreground)" />
        <StatCard icon={UserCheck} label="Activas" value={stats.activas} color="var(--success)" />
        <StatCard icon={Bookmark} label="Con bono vigente" value={stats.conBono} color="#6E9E0A" />
        <StatCard icon={Clock} label="Inactivas 30d" value={stats.inactivas30d} color="var(--warning)" />
      </div>

      {/* ── Search + filters ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o teléfono…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 text-[13px] bg-card rounded-xl border border-border focus:outline-none focus:border-muted-foreground transition-colors placeholder:text-muted-foreground shadow-sm"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              aria-label="Borrar búsqueda"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Smart filter chips + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {SMART_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setSmartFilter(f.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border',
                  smartFilter === f.id
                    ? 'bg-brand text-brand-foreground border-foreground shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort select */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">Ordenar:</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground focus:outline-none appearance-none cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
              className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
              title={sortDir === 'asc' ? 'Ascendente' : 'Descendente'}
            >
              {sortDir === 'asc'
                ? <ChevronUp size={13} className="text-muted-foreground" />
                : <ChevronDown size={13} className="text-muted-foreground" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-brand text-brand-foreground rounded-xl shadow-lg">
          <span className="text-[12px] font-medium text-muted-foreground mr-1">
            {selected.size} seleccionada{selected.size !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleEnviarEmail}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-card/10 hover:bg-card/20 transition-colors"
          >
            <Mail size={12} />
            Enviar email
          </button>
          <button
            onClick={() => { setAsignarPlanId(''); setShowAsignarPlan(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-card/10 hover:bg-card/20 transition-colors"
          >
            <Tag size={12} />
            Cambiar plan
          </button>
          <button
            onClick={() => setSelected(new Set())}
            aria-label="Quitar selección"
            className="ml-1 text-muted-foreground hover:text-white transition-colors p-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-x-auto shadow-sm">
        {lista.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Users size={28} className="text-muted-foreground" />
            </div>
            <h3 className="text-[15px] font-semibold text-foreground mb-1">
              {busqueda || smartFilter !== 'todas'
                ? 'No hay resultados'
                : 'Aún no hay clientas'}
            </h3>
            <p className="text-[13px] text-muted-foreground mb-5 max-w-xs">
              {busqueda || smartFilter !== 'todas'
                ? 'Prueba con otros filtros o términos de búsqueda.'
                : 'Añade tu primera clienta para empezar a gestionar el estudio.'}
            </p>
            {!busqueda && smartFilter === 'todas' && (
              <button
                onClick={() => { setForm(emptyForm()); setShowForm('nueva'); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-primary-foreground bg-primary hover:brightness-95 transition-colors"
              >
                <Plus size={14} />
                Añadir primera clienta
              </button>
            )}
            {(busqueda || smartFilter !== 'todas') && (
              <button
                onClick={() => { setBusqueda(''); setSmartFilter('todas'); }}
                className="text-[12px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <>
          <table className="w-full hidden sm:table">
            <thead>
              <tr className="border-b border-muted bg-muted">
                {/* Checkbox */}
                <th className="pl-4 pr-2 py-3 w-9">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-muted-foreground accent-foreground cursor-pointer"
                  />
                </th>
                {/* Clienta */}
                <th className="text-left px-4 py-3">
                  <button
                    onClick={() => toggleSort('nombre')}
                    className="flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clienta
                    <SortIcon active={sortKey === 'nombre'} dir={sortDir} />
                  </button>
                </th>
                {/* Plan */}
                <th className="text-left px-4 py-3 hidden sm:table-cell">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Plan actual
                  </span>
                </th>
                {/* Sesiones restantes */}
                <th className="text-left px-4 py-3 hidden md:table-cell">
                  <button
                    onClick={() => toggleSort('sesiones_restantes')}
                    className="flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Ses. rest.
                    <SortIcon active={sortKey === 'sesiones_restantes'} dir={sortDir} />
                  </button>
                </th>
                {/* Última asistencia */}
                <th className="text-left px-4 py-3 hidden lg:table-cell">
                  <button
                    onClick={() => toggleSort('ultima_visita')}
                    className="flex items-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Última asistencia
                    <SortIcon active={sortKey === 'ultima_visita'} dir={sortDir} />
                  </button>
                </th>
                {/* Estado */}
                <th className="text-left px-4 py-3 hidden md:table-cell">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Estado
                  </span>
                </th>
                {/* Actions */}
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>

            <tbody className="divide-y divide-muted">
              {listaVisible.map((s) => {
                const sus = getActiveSus(s.id);
                const plan = getPlan(sus?.planId);
                const lastVisit = getLastVisit(s.id);
                const sesRest = sus?.sesionesRestantes;
                const isSelected = selected.has(s.id);
                const [, avatarText] = avatarColor(`${s.nombre}${s.apellidos}`);

                // Sesiones badge color
                let sesColor = 'var(--success)';
                let sesBg = 'color-mix(in srgb, var(--success) 12%, var(--card))';
                if (sesRest != null) {
                  if (sesRest <= 0) { sesColor = 'var(--destructive)'; sesBg = 'color-mix(in srgb, var(--destructive) 12%, var(--card))'; }
                  else if (sesRest <= 2) { sesColor = 'var(--warning)'; sesBg = 'color-mix(in srgb, var(--warning) 12%, var(--card))'; }
                }

                return (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/clientas/${s.id}`)}
                    className={cn(
                      'hover:bg-muted transition-colors group cursor-pointer',
                      isSelected && 'bg-brand/10',
                    )}
                  >
                    {/* Checkbox */}
                    <td className="pl-4 pr-2 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(s.id)}
                        className="rounded border-muted-foreground accent-foreground cursor-pointer"
                      />
                    </td>

                    {/* Avatar + nombre */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar avatarId={s.avatar} nombre={s.nombre} apellidos={s.apellidos} color={avatarText} size="sm" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-foreground truncate flex items-center gap-1.5">
                            {semaforoPorSocio.has(s.id) && (
                              <span className="w-2 h-2 rounded-full shrink-0" title={SEMAFORO_META[semaforoPorSocio.get(s.id)!].label}
                                style={{ backgroundColor: SEMAFORO_META[semaforoPorSocio.get(s.id)!].color }} />
                            )}
                            <span className="truncate">{s.nombre} {s.apellidos}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-3.5 hidden sm:table-cell">
                      {plan ? (
                        <div>
                          <p className="text-[12px] font-medium text-foreground">{plan.nombre}</p>
                          {sus?.estado === 'PAUSADA' && (
                            <p className="text-[10px] font-medium text-warning">Pausada</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Sesiones restantes */}
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {sesRest != null ? (
                        <span
                          className="inline-block text-[12px] font-semibold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: sesBg, color: sesColor }}
                        >
                          {sesRest}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Última asistencia */}
                    <td className="px-4 py-3.5 text-[12px] text-muted-foreground hidden lg:table-cell">
                      {relativeTime(lastVisit)}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3.5 hidden md:table-cell"><EstadoBadge s={s} /></td>

                    {/* Row actions */}
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => openEdit(s, e)}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          title="Editar"
                        >
                          <Pencil size={13} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateSocio(s.id, { activo: !s.activo }); }}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          title={s.activo ? 'Desactivar' : 'Activar'}
                        >
                          {s.activo
                            ? <UserX size={13} className="text-muted-foreground" />
                            : <UserCheck size={13} className="text-success" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmEliminar(s.id); }}
                          className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={13} className="text-destructive" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-muted">
            {listaVisible.map(s => {
              const sus = getActiveSus(s.id);
              const plan = getPlan(sus?.planId);
              const lastVisit = getLastVisit(s.id);
              const sesRest = sus?.sesionesRestantes;
              const [, avatarText] = avatarColor(`${s.nombre}${s.apellidos}`);
              return (
                <div
                  key={s.id}
                  onClick={() => router.push(`/clientas/${s.id}`)}
                  className="flex items-start gap-3 px-4 py-3.5 active:bg-muted transition-colors cursor-pointer"
                >
                  <ProfileAvatar avatarId={s.avatar} nombre={s.nombre} apellidos={s.apellidos} color={avatarText} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-foreground truncate flex items-center gap-1.5">
                          {semaforoPorSocio.has(s.id) && (
                            <span className="w-2 h-2 rounded-full shrink-0" title={SEMAFORO_META[semaforoPorSocio.get(s.id)!].label}
                              style={{ backgroundColor: SEMAFORO_META[semaforoPorSocio.get(s.id)!].color }} />
                          )}
                          <span className="truncate">{s.nombre} {s.apellidos}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmEliminar(s.id); }}
                        className="p-1.5 -mr-1.5 rounded-md hover:bg-destructive/10 shrink-0"
                        title="Eliminar"
                      >
                        <Trash2 size={13} className="text-destructive" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <EstadoBadge s={s} />
                      {plan && <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-muted text-foreground">{plan.nombre}</span>}
                      {sesRest != null && (
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: sesRest <= 0 ? 'color-mix(in srgb, var(--destructive) 12%, var(--card))' : sesRest <= 2 ? 'color-mix(in srgb, var(--warning) 12%, var(--card))' : 'color-mix(in srgb, var(--success) 12%, var(--card))', color: sesRest <= 0 ? 'var(--destructive)' : sesRest <= 2 ? 'var(--warning)' : 'var(--success)' }}
                        >
                          {sesRest} ses.
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">Última visita: {relativeTime(lastVisit)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* Table footer — paginación (P0-34) */}
        {lista.length > 0 && (
          <div className="px-5 py-3 border-t border-muted bg-muted flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              Mostrando {listaVisible.length} de {lista.length}
              {lista.length !== socios.length ? ` (de ${socios.length})` : ''} clientas
            </p>
            {visibles < lista.length && (
              <button
                onClick={() => setVisibles((v) => v + PAGE)}
                className="text-[12px] font-semibold text-brand hover:underline"
              >
                Ver más ({Math.min(PAGE, lista.length - visibles)})
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Nueva / Editar clienta ─────────────────────────────────────── */}
      <Dialog
        open={showForm !== null}
        onOpenChange={(open) => { if (!open) resetModal(); }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              {showForm === 'nueva' && formStep === 2 && (
                <button onClick={() => setFormStep(1)} aria-label="Paso anterior" className="p-0.5 rounded hover:bg-muted">
                  <ArrowLeft size={15} className="text-muted-foreground" />
                </button>
              )}
              {showForm === 'nueva'
                ? formStep === 1 ? 'Nueva clienta' : 'Política y contrato'
                : 'Editar clienta'}
            </DialogTitle>
          </DialogHeader>

          {/* ── Step indicator (nueva only) ─── */}
          {showForm === 'nueva' && (
            <div className="flex items-center gap-2 mt-1 mb-2">
              {[{ n: 1, label: 'Datos' }, { n: 2, label: 'Contrato' }].map(({ n, label }) => (
                <div key={n} className="flex items-center gap-1.5">
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                    formStep >= n ? 'bg-brand text-brand-foreground' : 'bg-border text-muted-foreground',
                  )}>
                    {formStep > n ? <CheckCircle2 size={11} /> : n}
                  </div>
                  <span className={cn(
                    'text-[11px] font-medium',
                    formStep >= n ? 'text-foreground' : 'text-muted-foreground',
                  )}>{label}</span>
                  {n < 2 && <div className="w-6 h-px bg-border mx-0.5" />}
                </div>
              ))}
            </div>
          )}

          {/* ── Step 1: Datos de la clienta ─── */}
          {(showForm === 'editar' || formStep === 1) && (
            <div className="space-y-3.5 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <FF label="Nombre">
                  <input
                    className={inputCls}
                    placeholder="Laura"
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  />
                </FF>
                <FF label="Apellidos">
                  <input
                    className={inputCls}
                    placeholder="Martínez García"
                    value={form.apellidos}
                    onChange={(e) => setForm((f) => ({ ...f, apellidos: e.target.value }))}
                  />
                </FF>
              </div>
              <FF label="Email" description="Con esto entra al portal y recibe recordatorios y facturas.">
                <input
                  type="email"
                  className={inputCls}
                  placeholder="laura@email.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </FF>
              <div className="grid grid-cols-2 gap-3">
                <FF label="Teléfono" description="Para avisos por WhatsApp, si el estudio los tiene activados.">
                  <input
                    className={inputCls}
                    placeholder="+34 600 000 000"
                    value={form.telefono}
                    onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  />
                </FF>
                <FF label="NIF (opcional)" description="Solo hace falta si vas a facturarle. Se puede añadir más adelante.">
                  <input
                    className={inputCls}
                    placeholder="12345678A"
                    value={form.nif}
                    onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                  />
                </FF>
              </div>
              {camposPersonalizados.some(c => c.activo) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <CamposExtraFields
                    campos={camposPersonalizados}
                    values={form.camposExtra}
                    onChange={(id, v) => setForm(f => ({ ...f, camposExtra: { ...f.camposExtra, [id]: v } }))}
                    inputClassName={inputCls}
                  />
                </div>
              )}
              <FF label="Plan / Tarifa" description="Si eliges uno, se le genera la primera factura automáticamente al guardar.">
                <select
                  className={selectCls}
                  value={form.planId}
                  onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))}
                >
                  <option value="">Sin plan</option>
                  {planesTarifa.filter((p) => p.activo).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — {p.precio} €
                    </option>
                  ))}
                </select>
              </FF>
              {form.planId && showForm === 'nueva' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border border-success/20 rounded-lg">
                  <CheckCircle2 size={13} className="text-success shrink-0" />
                  <p className="text-[12px] text-success">
                    Se generará factura automática al completar la inscripción
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Política de privacidad + contrato ─── */}
          {showForm === 'nueva' && formStep === 2 && (
            <div className="space-y-3.5 mt-2">
              {/* Scrollable policy + terms */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <FileText size={11} />
                    Política de privacidad y condiciones
                  </label>
                  {!scrolledToBottom && (
                    <span className="text-[10px] text-muted-foreground">Desplaza hasta el final ↓</span>
                  )}
                  {scrolledToBottom && (
                    <span className="text-[10px] text-success font-medium flex items-center gap-1">
                      <CheckCircle2 size={10} /> Leído
                    </span>
                  )}
                </div>
                <div
                  ref={contratoRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                    if (nearBottom) setScrolledToBottom(true);
                  }}
                  className="h-52 overflow-y-auto rounded-lg border border-border bg-muted p-3 text-[11px] text-foreground leading-relaxed whitespace-pre-wrap font-mono"
                >
                  {studioConfig.politicaPrivacidad}
                  {'\n\n─────────────────────────────────────\n\n'}
                  {studioConfig.terminosServicio}
                </div>
              </div>

              {/* Acceptance checkbox */}
              <label className={cn(
                'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                aceptado ? 'border-success bg-success/10' : 'border-border bg-card hover:border-muted-foreground',
              )}>
                <input
                  type="checkbox"
                  checked={aceptado}
                  onChange={(e) => setAceptado(e.target.checked)}
                  className="mt-0.5 accent-success"
                />
                <span className="text-[12px] text-foreground leading-snug">
                  He leído y acepto la política de privacidad y las condiciones del servicio del estudio
                </span>
              </label>

              {/* Digital signature */}
              <FF label="Firma (nombre completo como firma digital)">
                <div className="relative">
                  <PenLine size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className={inputCls + ' pl-8 font-medium italic'}
                    placeholder="Escribe tu nombre completo como firma…"
                    value={firma}
                    onChange={(e) => setFirma(e.target.value)}
                  />
                </div>
              </FF>

              {/* Acceptance summary */}
              {aceptado && firma.trim() && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-success/10 border border-success/20 rounded-lg">
                  <ShieldCheck size={14} className="text-success shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-semibold text-success">Contrato listo para firmar</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Firmado digitalmente por <span className="font-medium text-foreground">{firma.trim()}</span> —{' '}
                      {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Actions ─── */}
          <div className="flex gap-2 mt-5">
            <button
              onClick={resetModal}
              className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            {showForm === 'nueva' && formStep === 1 ? (
              <button
                onClick={() => { setScrolledToBottom(false); setFormStep(2); }}
                disabled={!form.nombre || !form.apellidos || !form.email}
                className="flex-1 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95 transition-colors"
              >
                Siguiente — Contrato
              </button>
            ) : (
              <button
                onClick={showForm === 'nueva' ? handleCrear : handleEditar}
                disabled={
                  showForm === 'nueva'
                    ? !aceptado || !firma.trim()
                    : !form.nombre || !form.apellidos || !form.email
                }
                className="flex-1 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95 transition-colors"
              >
                {showForm === 'nueva' ? 'Crear clienta y firmar' : 'Guardar cambios'}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Asignar plan (bulk) ──────────────────────────────────────── */}
      <Dialog
        open={showAsignarPlan}
        onOpenChange={(open) => { if (!open) { setShowAsignarPlan(false); setAsignarPlanId(''); } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              Cambiar plan — {selected.size} clienta{selected.size !== 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FF label="Plan / Tarifa">
              <select
                className={selectCls}
                value={asignarPlanId}
                onChange={(e) => setAsignarPlanId(e.target.value)}
              >
                <option value="">Selecciona un plan…</option>
                {planesTarifa.filter((p) => p.activo).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} — {p.precio} €</option>
                ))}
              </select>
            </FF>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAsignarPlan(false); setAsignarPlanId(''); }}
                className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAsignarPlan}
                disabled={!asignarPlanId}
                className="flex-1 py-2 rounded-xl text-[13px] font-medium text-primary-foreground bg-primary disabled:opacity-40 hover:brightness-95 transition-colors"
              >
                Asignar plan
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Confirmar eliminar ───────────────────────────────────────── */}
      <Dialog
        open={!!confirmEliminar}
        onOpenChange={(open) => !open && setConfirmEliminar(null)}
      >
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-3 py-2">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle size={22} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground mb-1">
                ¿Dar de baja a esta clienta?
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Se anonimizan sus datos personales y su ficha de salud. Las facturas y recibos se conservan por obligación fiscal. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setConfirmEliminar(null)}
                className="flex-1 py-2 rounded-xl text-[13px] font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmEliminar) { deleteSocio(confirmEliminar); setConfirmEliminar(null); }
                }}
                className="flex-1 py-2 rounded-xl text-[13px] font-medium text-white bg-destructive hover:bg-destructive transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
