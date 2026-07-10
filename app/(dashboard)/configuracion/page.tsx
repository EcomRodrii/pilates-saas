'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Check, AlertTriangle, RotateCcw, FileSpreadsheet, ExternalLink, Ticket, Dumbbell, HeartPulse, Activity, Users2, KeyRound, BellRing, Monitor, Calendar as CalendarLinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { PlanTarifa, Sala, TipoClase, TipoIntegracion, Studio } from '@/lib/types';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { TabRecompensas } from '@/components/configuracion/tab-recompensas';
import { TabLogros } from '@/components/configuracion/tab-logros';
import { TabNiveles } from '@/components/configuracion/tab-niveles';
import { TabRetos } from '@/components/configuracion/tab-retos';
import { TabBackups } from '@/components/configuracion/tab-backups';
import { dbInsertSoporteSolicitud } from '@/lib/supabase-data';
import { StripeIcon, PayPalIcon, WhatsAppIcon, ZoomIcon, GoogleCalendarIcon, ResendIcon } from '@/components/icons/brand-icons';
import { useAuth } from '@/lib/auth-context';
import { subirFotoClase, eliminarFotoClase } from '@/lib/portal-storage';
import { authHeader } from '@/lib/api-client';

// ─── Design tokens ────────────────────────────────────────────────────────────
export const inputCls =
  'rounded-lg border border-border px-3 py-2 text-[13px] w-full focus:outline-none focus:ring-2 focus:ring-black/10';
export const labelCls = 'text-[12px] font-medium text-foreground block mb-1';
export const btnPrimary =
  'bg-brand text-brand-foreground rounded-lg px-4 py-2 text-[13px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const btnSecondary =
  'bg-card border border-border rounded-lg px-4 py-2 text-[13px] text-foreground hover:bg-muted transition-colors';
export const cardCls = 'bg-card border border-border rounded-xl';

// ─── Shared micro-components ──────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        on ? 'bg-primary' : 'bg-muted-foreground/40'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-card shadow ring-0 transition-transform duration-200',
          on ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 shrink-0"
      />
      <input
        className={cn(inputCls, 'flex-1')}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#1A1A1A"
        maxLength={7}
      />
    </div>
  );
}

function ColorSwatch({ color, size = 'md' }: { color: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-4 h-4 rounded-full' : 'w-6 h-6 rounded-lg';
  return (
    <span
      className={cn(cls, 'inline-block border border-black/10 shrink-0')}
      style={{ backgroundColor: color }}
    />
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-12 h-12 rounded-xl bg-[#FEE2E2] flex items-center justify-center">
            <AlertTriangle size={20} className="text-[#DC2626]" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground mb-1">{title}</h3>
            <p className="text-[13px] text-muted-foreground">{description}</p>
          </div>
          <div className="flex gap-2 w-full">
            <button
              className={cn(btnSecondary, 'flex-1 justify-center')}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </button>
            <button
              className="flex-1 bg-[#DC2626] text-white rounded-lg px-4 py-2 text-[13px] font-medium hover:bg-red-700 transition-colors"
              onClick={() => { onConfirm(); onOpenChange(false); }}
            >
              Eliminar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand text-brand-foreground text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-none">
      <Check size={14} className="text-[#34D399]" />
      {message}
    </div>
  );
}

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((msg: string) => setMessage(msg), []);
  const dismiss = useCallback(() => setMessage(null), []);
  return { message, show, dismiss };
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function TipoPlanBadge({ tipo }: { tipo: PlanTarifa['tipo'] }) {
  const map: Record<string, string> = {
    MENSUAL: 'bg-purple-50 text-purple-700',
    BONO: 'bg-blue-50 text-blue-700',
    PUNTUAL: 'bg-background text-muted-foreground',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', map[tipo])}>
      {tipo}
    </span>
  );
}

function NivelBadge({ nivel }: { nivel: TipoClase['nivel'] }) {
  const map: Record<string, string> = {
    TODOS: 'bg-background text-muted-foreground',
    PRINCIPIANTE: 'bg-green-50 text-green-700',
    MEDIO: 'bg-amber-50 text-amber-700',
    AVANZADO: 'bg-red-50 text-red-600',
  };
  const labels: Record<string, string> = {
    TODOS: 'Todos',
    PRINCIPIANTE: 'Principiante',
    MEDIO: 'Medio',
    AVANZADO: 'Avanzado',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', map[nivel])}>
      {labels[nivel]}
    </span>
  );
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
        activo ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-background text-muted-foreground'
      )}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabId = 'planes' | 'clases' | 'salas' | 'recompensas' | 'logros' | 'niveles' | 'retos' | 'integraciones' | 'estudio' | 'backups' | 'perfil';

const TABS: { id: TabId; label: string }[] = [
  { id: 'planes',      label: 'Planes y tarifas' },
  { id: 'clases',      label: 'Clases' },
  { id: 'salas',       label: 'Salas' },
  { id: 'recompensas', label: 'Recompensas' },
  { id: 'logros',      label: 'Logros' },
  { id: 'niveles',     label: 'Niveles' },
  { id: 'retos',       label: 'Retos' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'estudio',     label: 'Estudio' },
  { id: 'backups',     label: 'Copias de seguridad' },
  { id: 'perfil',      label: 'Mi perfil' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('planes');
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const searchParams = useSearchParams();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.id === tab)) setActiveTab(tab as TabId);
  }, [searchParams]);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-foreground">Configuración</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Gestiona los planes, clases, salas, instructores e integraciones de tu estudio
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 bg-card border border-border rounded-xl overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-brand text-brand-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'planes'      && <TabPlanes      showToast={showToast} />}
      {activeTab === 'clases'      && <TabClases       showToast={showToast} />}
      {activeTab === 'salas'       && <TabSalas        showToast={showToast} />}
      {activeTab === 'recompensas' && <TabRecompensas  showToast={showToast} />}
      {activeTab === 'logros'      && <TabLogros       showToast={showToast} />}
      {activeTab === 'niveles'     && <TabNiveles      showToast={showToast} />}
      {activeTab === 'retos'       && <TabRetos        showToast={showToast} />}
      {activeTab === 'backups'     && <TabBackups      showToast={showToast} />}
      {activeTab === 'integraciones' && <TabIntegraciones showToast={showToast} />}
      {activeTab === 'estudio'     && <TabEstudio      showToast={showToast} />}
      {activeTab === 'perfil'      && <TabPerfil       showToast={showToast} />}

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: PLANES Y TARIFAS
// ─────────────────────────────────────────────────────────────────────────────

type PlanForm = {
  nombre: string;
  descripcion: string;
  precio: string;
  tipo: PlanTarifa['tipo'];
  sesiones: string;
  activo: boolean;
};

const emptyPlanForm = (): PlanForm => ({
  nombre: '',
  descripcion: '',
  precio: '',
  tipo: 'MENSUAL',
  sesiones: '',
  activo: true,
});

function planToForm(p: PlanTarifa): PlanForm {
  return {
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    precio: String(p.precio),
    tipo: p.tipo,
    sesiones: p.sesiones !== null ? String(p.sesiones) : '',
    activo: p.activo,
  };
}

function TabPlanes({ showToast }: { showToast: (m: string) => void }) {
  const { planesTarifa, addPlan, updatePlan, deletePlan } = useStudio();

  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyPlanForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const openNuevo = useCallback(() => {
    setForm(emptyPlanForm());
    setEditId(null);
    setModal('nuevo');
  }, []);

  const openEditar = useCallback((p: PlanTarifa) => {
    setForm(planToForm(p));
    setEditId(p.id);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const guardar = useCallback(() => {
    const fields = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      precio: parseFloat(form.precio) || 0,
      tipo: form.tipo,
      sesiones:
        form.tipo !== 'MENSUAL' && form.sesiones
          ? parseInt(form.sesiones, 10)
          : null,
      activo: form.activo,
    };
    if (modal === 'nuevo') {
      addPlan(fields);
      showToast('Plan creado correctamente');
    } else if (editId) {
      updatePlan(editId, fields);
      showToast('Plan actualizado');
    }
    setModal(null);
  }, [modal, editId, form, addPlan, updatePlan, showToast]);

  const toggleActivo = useCallback(
    (id: string, current: boolean) => {
      updatePlan(id, { activo: !current });
      showToast(!current ? 'Plan activado' : 'Plan desactivado');
    },
    [updatePlan, showToast]
  );

  const handleDelete = useCallback(() => {
    if (confirmDel) {
      deletePlan(confirmDel);
      showToast('Plan eliminado');
    }
  }, [confirmDel, deletePlan, showToast]);

  const sesionesRequeridas = form.tipo === 'BONO' || form.tipo === 'PUNTUAL';
  const canGuardar = form.nombre.trim() && form.precio;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{planesTarifa.length} planes configurados</p>
        <button className={btnPrimary} onClick={openNuevo}>
          <Plus size={13} />
          Nuevo plan
        </button>
      </div>

      <div className={cn(cardCls, 'p-0 overflow-hidden')}>
        {planesTarifa.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No hay planes creados. Haz clic en &quot;Nuevo plan&quot; para empezar.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full text-[13px] hidden sm:table">
              <thead>
                <tr className="border-b border-border">
                  {['Nombre', 'Tipo', 'Precio', 'Sesiones', 'Estado', 'Acciones'].map(h => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planesTarifa.map(plan => (
                  <tr
                    key={plan.id}
                    className={cn(
                      'border-b border-background last:border-0 hover:bg-muted transition-colors',
                      !plan.activo && 'opacity-50'
                    )}
                  >
                    <td className="px-5 py-3 font-medium text-foreground">{plan.nombre}</td>
                    <td className="px-5 py-3">
                      <TipoPlanBadge tipo={plan.tipo} />
                    </td>
                    <td className="px-5 py-3 font-semibold text-foreground">{plan.precio} €</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {plan.sesiones !== null ? plan.sesiones : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Toggle
                        on={plan.activo}
                        onChange={() => toggleActivo(plan.id, plan.activo)}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditar(plan)}
                          className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Editar plan"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setConfirmDel(plan.id)}
                          className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground hover:text-[#DC2626] transition-colors"
                          aria-label="Eliminar plan"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-background">
              {planesTarifa.map(plan => (
                <div key={plan.id} className={cn('p-4 space-y-2', !plan.activo && 'opacity-50')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground text-[14px]">{plan.nombre}</p>
                      <div className="mt-1"><TipoPlanBadge tipo={plan.tipo} /></div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditar(plan)} className="p-1.5 rounded-lg hover:bg-background text-muted-foreground" aria-label="Editar plan">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setConfirmDel(plan.id)} className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground" aria-label="Eliminar plan">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{plan.precio} €</span>
                      {plan.sesiones !== null && ` · ${plan.sesiones} sesiones`}
                    </p>
                    <Toggle on={plan.activo} onChange={() => toggleActivo(plan.id, plan.activo)} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal nuevo/editar */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              {modal === 'nuevo' ? 'Nuevo plan' : 'Editar plan'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field label="Nombre del plan">
              <input
                className={inputCls}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Mensual ilimitado"
              />
            </Field>
            <Field label="Descripción (opcional)">
              <textarea
                className={cn(inputCls, 'resize-none h-16')}
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Breve descripción del plan..."
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <select
                  className={inputCls}
                  value={form.tipo}
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      tipo: e.target.value as PlanTarifa['tipo'],
                      sesiones: e.target.value === 'MENSUAL' ? '' : f.sesiones,
                    }))
                  }
                >
                  <option value="MENSUAL">MENSUAL</option>
                  <option value="BONO">BONO</option>
                  <option value="PUNTUAL">PUNTUAL</option>
                </select>
              </Field>
              <Field label="Precio (€)">
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.precio}
                  onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                  placeholder="0.00"
                />
              </Field>
            </div>
            {sesionesRequeridas && (
              <Field label="Número de sesiones">
                <input
                  className={inputCls}
                  type="number"
                  min={1}
                  value={form.sesiones}
                  onChange={e => setForm(f => ({ ...f, sesiones: e.target.value }))}
                  placeholder="Ej: 10"
                />
              </Field>
            )}
            <div className="flex items-center justify-between py-1">
              <span className={labelCls}>Plan activo</span>
              <Toggle on={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={closeModal}>
              Cancelar
            </button>
            <button
              className={cn(btnPrimary, 'flex-1 justify-center')}
              onClick={guardar}
              disabled={!canGuardar}
            >
              {modal === 'nuevo' ? 'Crear plan' : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        title="¿Eliminar plan?"
        description="Esta acción no se puede deshacer. Los socios con este plan no se verán afectados."
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: CLASES (tipos de clase)
// ─────────────────────────────────────────────────────────────────────────────

type ClaseForm = {
  nombre: string;
  color: string;
  duracionMinutos: string;
  nivel: TipoClase['nivel'];
  descripcion: string;
};

const emptyClaseForm = (): ClaseForm => ({
  nombre: '',
  color: '#F7A6C4',
  duracionMinutos: '60',
  nivel: 'TODOS',
  descripcion: '',
});

function claseToForm(t: TipoClase): ClaseForm {
  return {
    nombre: t.nombre,
    color: t.color,
    duracionMinutos: String(t.duracionMinutos),
    nivel: t.nivel,
    descripcion: t.descripcion ?? '',
  };
}

const NIVEL_LABELS: Record<TipoClase['nivel'], string> = {
  TODOS: 'Todos los niveles',
  PRINCIPIANTE: 'Principiante',
  MEDIO: 'Medio',
  AVANZADO: 'Avanzado',
};

function TabClases({ showToast }: { showToast: (m: string) => void }) {
  const { tiposClase, addTipoClase, updateTipoClase, deleteTipoClase } = useStudio();

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClaseForm>(emptyClaseForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const editando = editId ? tiposClase.find(t => t.id === editId) ?? null : null;

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editId) return;
    if (!file.type.startsWith('image/')) { showToast('Elige un archivo de imagen'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('La imagen no puede superar 5 MB'); return; }
    setSubiendoFoto(true);
    const result = await subirFotoClase(editId, file);
    setSubiendoFoto(false);
    if ('error' in result) { showToast(result.error); return; }
    updateTipoClase(editId, { fotoUrl: result.url });
  }

  async function handleEliminarFoto() {
    if (!editId) return;
    setSubiendoFoto(true);
    const result = await eliminarFotoClase(editId);
    setSubiendoFoto(false);
    if ('error' in result) { showToast(result.error); return; }
    updateTipoClase(editId, { fotoUrl: null });
  }

  const openNueva = useCallback(() => {
    setForm(emptyClaseForm());
    setEditId(null);
    setModal('nueva');
  }, []);

  const openEditar = useCallback((t: TipoClase) => {
    setForm(claseToForm(t));
    setEditId(t.id);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const guardar = useCallback(() => {
    const fields = {
      nombre: form.nombre.trim(),
      color: form.color,
      duracionMinutos: parseInt(form.duracionMinutos, 10) || 60,
      nivel: form.nivel,
      descripcion: form.descripcion.trim() || null,
    };
    if (modal === 'nueva') {
      addTipoClase({ ...fields, fotoUrl: null });
      showToast('Tipo de clase creado');
    } else if (editId) {
      updateTipoClase(editId, fields);
      showToast('Tipo de clase actualizado');
    }
    setModal(null);
  }, [modal, editId, form, addTipoClase, updateTipoClase, showToast]);

  const handleDelete = useCallback(() => {
    if (confirmDel) {
      deleteTipoClase(confirmDel);
      showToast('Tipo de clase eliminado');
    }
  }, [confirmDel, deleteTipoClase, showToast]);

  const canGuardar = form.nombre.trim() && form.duracionMinutos;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{tiposClase.length} tipos de clase configurados</p>
        <button className={btnPrimary} onClick={openNueva}>
          <Plus size={13} />
          Nueva clase
        </button>
      </div>

      {tiposClase.length === 0 && (
        <div className={cn(cardCls, 'p-10 text-center text-[13px] text-muted-foreground')}>
          No hay tipos de clase creados. Haz clic en &quot;Nueva clase&quot; para empezar.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiposClase.map(tc => (
          <div key={tc.id} className={cn(cardCls, 'p-4 flex flex-col gap-3')}>
            {/* Color + nombre */}
            <div className="flex items-center gap-3">
              <ColorSwatch color={tc.color} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">{tc.nombre}</p>
                <p className="text-[11px] text-muted-foreground">{tc.duracionMinutos} min</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <NivelBadge nivel={tc.nivel} />
              {tc.descripcion && (
                <p className="text-[11px] text-muted-foreground truncate ml-2 flex-1 text-right">
                  {tc.descripcion}
                </p>
              )}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1 pt-1 border-t border-background">
              <button
                onClick={() => openEditar(tc)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
              >
                <Pencil size={11} />
                Editar
              </button>
              <button
                onClick={() => setConfirmDel(tc.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-[#FEE2E2] hover:text-[#DC2626] transition-colors ml-auto"
              >
                <Trash2 size={11} />
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              {modal === 'nueva' ? 'Nueva clase' : 'Editar clase'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field label="Nombre">
              <input
                className={inputCls}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Reformer Avanzado"
              />
            </Field>
            <Field label="Foto de la clase">
              {editId ? (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                    {editando?.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={editando.fotoUrl} alt={form.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <ColorSwatch color={form.color} size="md" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      disabled={subiendoFoto}
                      className="text-[12px] font-semibold text-brand-secondary underline underline-offset-2 disabled:opacity-50"
                    >
                      {subiendoFoto ? 'Subiendo…' : editando?.fotoUrl ? 'Cambiar foto' : 'Subir foto'}
                    </button>
                    {editando?.fotoUrl && (
                      <button type="button" onClick={handleEliminarFoto} className="text-[12px] text-muted-foreground text-left">
                        Quitar foto
                      </button>
                    )}
                  </div>
                  <input ref={fotoInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">Podrás añadir una foto una vez creada la clase.</p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duración (min)">
                <input
                  className={inputCls}
                  type="number"
                  min={15}
                  step={5}
                  value={form.duracionMinutos}
                  onChange={e => setForm(f => ({ ...f, duracionMinutos: e.target.value }))}
                />
              </Field>
              <Field label="Nivel">
                <select
                  className={inputCls}
                  value={form.nivel}
                  onChange={e => setForm(f => ({ ...f, nivel: e.target.value as TipoClase['nivel'] }))}
                >
                  {(Object.keys(NIVEL_LABELS) as TipoClase['nivel'][]).map(n => (
                    <option key={n} value={n}>{NIVEL_LABELS[n]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Color">
              <ColorInput
                value={form.color}
                onChange={v => setForm(f => ({ ...f, color: v }))}
              />
            </Field>
            <Field label="Descripción (opcional)">
              <textarea
                className={cn(inputCls, 'resize-none h-16')}
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Breve descripción de la clase..."
              />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={closeModal}>
              Cancelar
            </button>
            <button
              className={cn(btnPrimary, 'flex-1 justify-center')}
              onClick={guardar}
              disabled={!canGuardar}
            >
              {modal === 'nueva' ? 'Crear clase' : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        title="¿Eliminar tipo de clase?"
        description="Se eliminará este tipo de clase. Las sesiones existentes no se verán afectadas."
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: SALAS
// ─────────────────────────────────────────────────────────────────────────────

type SalaForm = {
  nombre: string;
  capacidad: string;
  color: string;
};

const emptySalaForm = (): SalaForm => ({
  nombre: '',
  capacidad: '10',
  color: '#F7A6C4',
});

function salaToForm(s: Sala): SalaForm {
  return {
    nombre: s.nombre,
    capacidad: String(s.capacidad),
    color: s.color,
  };
}

function TabSalas({ showToast }: { showToast: (m: string) => void }) {
  const { salas, addSala, updateSala, deleteSala } = useStudio();

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SalaForm>(emptySalaForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const openNueva = useCallback(() => {
    setForm(emptySalaForm());
    setEditId(null);
    setModal('nueva');
  }, []);

  const openEditar = useCallback((s: Sala) => {
    setForm(salaToForm(s));
    setEditId(s.id);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const guardar = useCallback(() => {
    const fields = {
      nombre: form.nombre.trim(),
      capacidad: parseInt(form.capacidad, 10) || 1,
      color: form.color,
    };
    if (modal === 'nueva') {
      addSala(fields);
      showToast('Sala creada correctamente');
    } else if (editId) {
      updateSala(editId, fields);
      showToast('Sala actualizada');
    }
    setModal(null);
  }, [modal, editId, form, addSala, updateSala, showToast]);

  const handleDelete = useCallback(() => {
    if (confirmDel) {
      deleteSala(confirmDel);
      showToast('Sala eliminada');
    }
  }, [confirmDel, deleteSala, showToast]);

  const canGuardar = form.nombre.trim() && form.capacidad;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">{salas.length} salas configuradas</p>
        <button className={btnPrimary} onClick={openNueva}>
          <Plus size={13} />
          Nueva sala
        </button>
      </div>

      <div className={cn(cardCls, 'p-0 overflow-hidden')}>
        {salas.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No hay salas creadas. Haz clic en &quot;Nueva sala&quot; para empezar.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full text-[13px] hidden sm:table">
              <thead>
                <tr className="border-b border-border">
                  {['Nombre', 'Capacidad', 'Color', 'Acciones'].map(h => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salas.map(sala => (
                  <tr
                    key={sala.id}
                    className="border-b border-background last:border-0 hover:bg-muted transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-foreground">{sala.nombre}</td>
                    <td className="px-5 py-3 text-muted-foreground">{sala.capacidad} personas</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <ColorSwatch color={sala.color} size="sm" />
                        <span className="text-[12px] text-muted-foreground font-mono">{sala.color}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditar(sala)}
                          className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Editar sala"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setConfirmDel(sala.id)}
                          className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground hover:text-[#DC2626] transition-colors"
                          aria-label="Eliminar sala"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-background">
              {salas.map(sala => (
                <div key={sala.id} className="p-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ColorSwatch color={sala.color} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-[14px] truncate">{sala.nombre}</p>
                      <p className="text-[12px] text-muted-foreground">{sala.capacidad} personas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditar(sala)} className="p-1.5 rounded-lg hover:bg-background text-muted-foreground" aria-label="Editar sala">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmDel(sala.id)} className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground" aria-label="Eliminar sala">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              {modal === 'nueva' ? 'Nueva sala' : 'Editar sala'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field label="Nombre de la sala">
              <input
                className={inputCls}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Sala Reformer"
              />
            </Field>
            <Field label="Capacidad (personas)">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={200}
                value={form.capacidad}
                onChange={e => setForm(f => ({ ...f, capacidad: e.target.value }))}
              />
            </Field>
            <Field label="Color identificador">
              <ColorInput value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={closeModal}>
              Cancelar
            </button>
            <button
              className={cn(btnPrimary, 'flex-1 justify-center')}
              onClick={guardar}
              disabled={!canGuardar}
            >
              {modal === 'nueva' ? 'Crear sala' : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        title="¿Eliminar sala?"
        description="Se eliminará esta sala. Las sesiones futuras en esta sala no se verán afectadas automáticamente."
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: INTEGRACIONES
// ─────────────────────────────────────────────────────────────────────────────

type CampoIntegracion = { key: string; label: string; placeholder: string; tipo?: 'text' | 'password' };

type CatalogoIntegracion = {
  tipo: TipoIntegracion;
  nombre: string;
  descripcion: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  campos: CampoIntegracion[];
  secretoEnv?: string;
  docsUrl?: string;
  accion?: 'exportar';
  categoria?: string;
  proximamente?: boolean;
};

const CATALOGO_INTEGRACIONES: CatalogoIntegracion[] = [
  {
    tipo: 'STRIPE',
    nombre: 'Stripe',
    descripcion: 'Cobra suscripciones y bonos con tarjeta o SEPA. El dinero va directo a tu propia cuenta de Stripe — conéctala con un clic, sin claves.',
    Icon: StripeIcon,
    color: '#635BFF',
    bg: '#F5F5F5',
    campos: [],
  },
  {
    tipo: 'RESEND',
    nombre: 'Resend',
    descripcion: 'Envía emails de bienvenida, recibos y campañas desde tu propio dominio.',
    Icon: ResendIcon,
    color: 'var(--foreground)',
    bg: '#F5F5F5',
    campos: [
      { key: 'fromEmail', label: 'Email remitente', placeholder: 'hola@tentare.es' },
      { key: 'fromName', label: 'Nombre remitente', placeholder: 'Tentare' },
    ],
    secretoEnv: 'RESEND_API_KEY',
    docsUrl: 'https://resend.com/api-keys',
  },
  {
    tipo: 'GOOGLE_CALENDAR',
    nombre: 'Google Calendar',
    descripcion: 'Sincroniza las clases del estudio con el calendario de Google de la propietaria. Conexión OAuth — no necesitas pegar ninguna clave.',
    Icon: GoogleCalendarIcon,
    color: '#4285F4',
    bg: '#F5F5F5',
    categoria: 'Calendario',
    campos: [],
  },
  {
    tipo: 'WHATSAPP',
    nombre: 'WhatsApp Business',
    descripcion: 'Envía recordatorios y automatizaciones por WhatsApp con la API de Meta.',
    Icon: WhatsAppIcon,
    color: '#25D366',
    bg: '#F5F5F5',
    categoria: 'Mensajería',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'EXCEL',
    nombre: 'Exportar a Excel',
    descripcion: 'Descarga tus socias, suscripciones y recibos en un archivo compatible con Excel.',
    Icon: FileSpreadsheet,
    color: '#1D6F42',
    bg: '#E7F4EC',
    campos: [],
    accion: 'exportar',
  },
  {
    tipo: 'PAYPAL',
    nombre: 'PayPal',
    descripcion: 'Acepta pagos con una de las soluciones FinTech más usadas del mundo.',
    Icon: PayPalIcon,
    color: '#003087',
    bg: '#F5F5F5',
    categoria: 'Pagos',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'CLASSPASS',
    nombre: 'ClassPass',
    descripcion: 'Gana visibilidad entre miles de usuarios con la mayor red de fitness y bienestar.',
    Icon: Ticket,
    color: '#8B5CF6',
    bg: '#F3EEFF',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'URBAN_SPORTS_CLUB',
    nombre: 'Urban Sports Club',
    descripcion: 'Forma parte de una de las suscripciones deportivas más populares de Europa.',
    Icon: Dumbbell,
    color: '#111827',
    bg: '#F1F1EC',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'WELLHUB',
    nombre: 'Wellhub',
    descripcion: 'Conecta con una red global de profesionales del bienestar y atrae clientes vía programas corporativos.',
    Icon: HeartPulse,
    color: '#EE5A6F',
    bg: '#FFF0F2',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'EGYM_WELLPASS',
    nombre: 'EGYM Wellpass',
    descripcion: 'Accede a una red en crecimiento de profesionales preocupados por su salud.',
    Icon: Activity,
    color: '#059669',
    bg: '#E7F7F0',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'MYCLUBS',
    nombre: 'myclubs',
    descripcion: 'Integra tu estudio con uno de los principales agregadores de fitness en Austria y Suiza.',
    Icon: Users2,
    color: '#EA580C',
    bg: '#FFF1E7',
    categoria: 'Agregadores',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'ZOOM',
    nombre: 'Zoom',
    descripcion: 'Lleva tus clases más allá del estudio y ofrece sesiones en cualquier momento y lugar.',
    Icon: ZoomIcon,
    color: '#0B5CFF',
    bg: '#F5F5F5',
    categoria: 'Contenido digital',
    campos: [],
    proximamente: true,
  },
  {
    tipo: 'KISI',
    nombre: 'Kisi',
    descripcion: 'Ofrece acceso seguro y rápido a tu estudio. Gestiona el estado de tus clientes en tiempo real.',
    Icon: KeyRound,
    color: '#4F46E5',
    bg: '#EEF0FE',
    categoria: 'Control de acceso',
    campos: [],
    proximamente: true,
  },
];

function toCsv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(';')).join('\r\n');
}

function descargarCsv(nombre: string, contenido: string) {
  // BOM para que Excel reconozca UTF-8
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TabIntegraciones({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio, integraciones, upsertIntegracion, socios, suscripciones, planesTarifa, recibos } = useStudio();
  const [editando, setEditando] = useState<TipoIntegracion | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const getIntegracion = (tipo: TipoIntegracion) => integraciones.find(i => i.tipo === tipo) ?? null;

  // Stripe no usa el modal genérico de API keys: se conecta vía OAuth (Stripe
  // Connect) para que cada estudio cobre en su propia cuenta, sin tocar
  // ninguna clave.
  const stripeConectado = !!studio?.stripeAccountId;
  const stripeClientId = process.env.NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const stripeConnectUrl = stripeClientId && studio
    ? `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${stripeClientId}&scope=read_write&redirect_uri=${encodeURIComponent(`${appUrl}/api/stripe/connect/callback`)}&state=${studio.id}`
    : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('stripe_connected')) {
      showToast('Stripe conectado — ya puedes cobrar en tu propia cuenta');
      window.history.replaceState({}, '', '/configuracion');
    } else if (params.get('stripe_connect_error')) {
      showToast(`Error al conectar Stripe: ${params.get('stripe_connect_error')}`);
      window.history.replaceState({}, '', '/configuracion');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarStripe = () => {
    updateStudio({ stripeAccountId: null });
    showToast('Stripe desconectado');
  };

  // Google Calendar: OAuth real (ver lib/google-calendar.ts). A diferencia de
  // Stripe, desconectar y sincronizar pasan por rutas de servidor
  // autenticadas (no solo estado local) — ver app/api/integrations/google-calendar/*.
  const googleConectado = !!studio?.googleCalendarEmail;
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const googleConnectUrl = googleClientId && studio
    ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(`${appUrl}/api/integrations/google-calendar/callback`)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email')}&access_type=offline&prompt=consent&state=${studio.id}`
    : null;
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_calendar_connected')) {
      showToast('Google Calendar conectado');
      window.history.replaceState({}, '', '/configuracion');
    } else if (params.get('google_calendar_error')) {
      showToast(`Error al conectar Google Calendar: ${params.get('google_calendar_error')}`);
      window.history.replaceState({}, '', '/configuracion');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarGoogle = async () => {
    const res = await fetch('/api/integrations/google-calendar/disconnect', { method: 'POST', headers: await authHeader() });
    if (res.ok) {
      updateStudio({ googleCalendarEmail: null });
      showToast('Google Calendar desconectado');
    } else {
      const data = await res.json().catch(() => null);
      showToast(`No se pudo desconectar: ${data?.error ?? 'error desconocido'}`);
    }
  };

  const sincronizarGoogle = async () => {
    setSincronizando(true);
    try {
      const res = await fetch('/api/integrations/google-calendar/sync', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) { showToast(`Error al sincronizar: ${data.error}`); return; }
      showToast(`Sincronizado: ${data.creadas} clases nuevas, ${data.actualizadas} actualizadas, ${data.borradas} eliminadas`);
    } finally {
      setSincronizando(false);
    }
  };

  const abrirConfig = (cat: CatalogoIntegracion) => {
    const actual = getIntegracion(cat.tipo);
    setForm(actual?.config ?? {});
    setEditando(cat.tipo);
  };

  const guardar = (cat: CatalogoIntegracion) => {
    const rellenos = cat.campos.some(c => (form[c.key] ?? '').trim() !== '');
    upsertIntegracion(cat.tipo, rellenos, form);
    setEditando(null);
    showToast(`${cat.nombre} ${rellenos ? 'conectado' : 'actualizado'}`);
  };

  const desconectar = (cat: CatalogoIntegracion) => {
    upsertIntegracion(cat.tipo, false, {});
    setEditando(null);
    showToast(`${cat.nombre} desconectado`);
  };

  const [avisado, setAvisado] = useState<Set<TipoIntegracion>>(new Set());
  const avisarme = (cat: CatalogoIntegracion) => {
    dbInsertSoporteSolicitud({
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tipo: 'MEJORA',
      mensaje: `Quiero que se avise cuando esté disponible la integración con ${cat.nombre}.`,
      contacto: null,
      creadoEn: new Date().toISOString(),
    });
    setAvisado(prev => new Set(prev).add(cat.tipo));
    showToast(`Te avisaremos cuando ${cat.nombre} esté disponible`);
  };

  const exportarExcel = () => {
    const fmtEur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Hoja socias con su plan y estado de suscripción
    const rows: (string | number | null)[][] = [
      ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'NIF', 'Alta', 'Activa', 'Plan', 'Estado suscripción', 'Sesiones restantes'],
    ];
    for (const s of socios) {
      const sus = suscripciones.find(x => x.socioId === s.id && x.estado === 'ACTIVA')
        ?? suscripciones.filter(x => x.socioId === s.id).slice(-1)[0] ?? null;
      const plan = sus ? planesTarifa.find(p => p.id === sus.planId) ?? null : null;
      rows.push([
        s.nombre, s.apellidos, s.email, s.telefono ?? '', s.nif ?? '',
        s.fechaAlta?.slice(0, 10) ?? '', s.activo ? 'Sí' : 'No',
        plan?.nombre ?? '', sus?.estado ?? '', sus?.sesionesRestantes ?? '',
      ]);
    }
    descargarCsv(`tentare-socias-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));

    // Hoja recibos
    const rRows: (string | number | null)[][] = [
      ['Concepto', 'Socia', 'Importe (€)', 'Estado', 'Vencimiento', 'Cobro'],
    ];
    for (const r of recibos) {
      const s = socios.find(x => x.id === r.socioId);
      rRows.push([
        r.concepto, s ? `${s.nombre} ${s.apellidos}` : '', fmtEur(r.importe),
        r.estado, r.fechaVencimiento?.slice(0, 10) ?? '', r.fechaCobro?.slice(0, 10) ?? '',
      ]);
    }
    descargarCsv(`tentare-recibos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rRows));
    showToast('Exportación descargada (socias y recibos)');
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-[14px] font-semibold text-foreground">Integraciones del negocio</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Conecta Tentare con las herramientas que ya usas. Cada negocio configura las suyas.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CATALOGO_INTEGRACIONES.map(cat => {
          const intg = getIntegracion(cat.tipo);
          const conectado = cat.tipo === 'STRIPE' ? stripeConectado : cat.tipo === 'GOOGLE_CALENDAR' ? googleConectado : !!intg?.activo;
          return (
            <div key={cat.tipo} className={cn(cardCls, 'p-4 flex flex-col')}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.bg }}>
                  <cat.Icon size={20} style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-foreground">{cat.nombre}</p>
                    {cat.proximamente ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF7ED] text-[#B45309]">
                        Próximamente
                      </span>
                    ) : cat.accion !== 'exportar' && (
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold',
                        conectado ? 'bg-[#DCFCE7] text-[#059669]' : 'bg-muted text-muted-foreground',
                      )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', conectado ? 'bg-[#059669]' : 'bg-muted-foreground')} />
                        {conectado ? 'Conectado' : 'No conectado'}
                      </span>
                    )}
                  </div>
                  {cat.categoria && <p className="text-[10px] font-bold uppercase tracking-wide text-[#B8B8AE] mt-0.5">{cat.categoria}</p>}
                  <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{cat.descripcion}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-[#F1F1F4] flex items-center gap-2">
                {cat.proximamente ? (
                  <button
                    onClick={() => avisarme(cat)}
                    disabled={avisado.has(cat.tipo)}
                    className={cn(btnSecondary, avisado.has(cat.tipo) && 'opacity-50')}
                  >
                    <BellRing size={14} /> {avisado.has(cat.tipo) ? 'Ya te avisaremos' : 'Avísame cuando esté disponible'}
                  </button>
                ) : cat.accion === 'exportar' ? (
                  <button onClick={exportarExcel} className={btnPrimary}>
                    <FileSpreadsheet size={14} /> Descargar Excel
                  </button>
                ) : cat.tipo === 'STRIPE' ? (
                  stripeConectado ? (
                    <button onClick={desconectarStripe} className={btnSecondary}>Desconectar</button>
                  ) : stripeConnectUrl ? (
                    <a href={stripeConnectUrl} className={cn(btnPrimary, 'no-underline')}>Conectar con Stripe</a>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID</code>
                    </p>
                  )
                ) : cat.tipo === 'GOOGLE_CALENDAR' ? (
                  googleConectado ? (
                    <>
                      <button onClick={sincronizarGoogle} disabled={sincronizando} className={cn(btnPrimary, sincronizando && 'opacity-50')}>
                        {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
                      </button>
                      <button onClick={desconectarGoogle} className={btnSecondary}>Desconectar</button>
                    </>
                  ) : googleConnectUrl ? (
                    <a href={googleConnectUrl} className={cn(btnPrimary, 'no-underline')}>Conectar con Google</a>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Falta configurar <code className="font-mono bg-muted px-1 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>
                    </p>
                  )
                ) : (
                  <>
                    <button onClick={() => abrirConfig(cat)} className={conectado ? btnSecondary : btnPrimary}>
                      {conectado ? 'Gestionar' : 'Conectar'}
                    </button>
                    {cat.docsUrl && (
                      <a href={cat.docsUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        Docs <ExternalLink size={11} />
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Config modal */}
      {editando && (() => {
        const cat = CATALOGO_INTEGRACIONES.find(c => c.tipo === editando)!;
        const conectado = !!getIntegracion(cat.tipo)?.activo;
        return (
          <Dialog open onOpenChange={() => setEditando(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: cat.bg }}>
                    <cat.Icon size={15} style={{ color: cat.color }} />
                  </span>
                  Configurar {cat.nombre}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {cat.campos.map(campo => (
                  <div key={campo.key}>
                    <label className={labelCls}>{campo.label}</label>
                    <input
                      className={inputCls}
                      type={campo.tipo ?? 'text'}
                      value={form[campo.key] ?? ''}
                      placeholder={campo.placeholder}
                      onChange={e => setForm(p => ({ ...p, [campo.key]: e.target.value }))}
                    />
                  </div>
                ))}
                {cat.secretoEnv && (
                  <div className="flex items-start gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3">
                    <AlertTriangle size={14} className="text-[#D97706] shrink-0 mt-0.5" />
                    <p className="text-[11px] text-[#92400E] leading-snug">
                      Por seguridad, la clave secreta no se guarda aquí. Añádela como variable de entorno{' '}
                      <code className="font-mono bg-[#FEF3C7] px-1 rounded">{cat.secretoEnv}</code> en tu proveedor de despliegue (Vercel).
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  {conectado ? (
                    <button onClick={() => desconectar(cat)} className="text-[13px] font-medium text-[#DC2626] hover:underline">
                      Desconectar
                    </button>
                  ) : <span />}
                  <div className="flex gap-2">
                    <button onClick={() => setEditando(null)} className={btnSecondary}>Cancelar</button>
                    <button onClick={() => guardar(cat)} className={btnPrimary}>
                      <Check size={14} /> Guardar
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

type StudioForm = {
  nombre: string; razonSocial: string; nif: string;
  direccion: string; ciudad: string; codigoPostal: string;
  telefono: string; email: string;
};

function studioToForm(s: Studio | null): StudioForm {
  return {
    nombre: s?.nombre ?? '',
    razonSocial: s?.razonSocial ?? '',
    nif: s?.nif ?? '',
    direccion: s?.direccion ?? '',
    ciudad: s?.ciudad ?? '',
    codigoPostal: s?.codigoPostal ?? '',
    telefono: s?.telefono ?? '',
    email: s?.email ?? '',
  };
}

type PoliticaForm = {
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  reservaExigirPlan: boolean;
  reservaMaxSimultaneas: number | null;
};

function studioToPolitica(s: Studio | null): PoliticaForm {
  return {
    cancelacionVentanaHoras: s?.cancelacionVentanaHoras ?? 12,
    cancelacionDevolverBonoTardia: s?.cancelacionDevolverBonoTardia ?? false,
    reservaExigirPlan: s?.reservaExigirPlan ?? false,
    reservaMaxSimultaneas: s?.reservaMaxSimultaneas ?? null,
  };
}

function TabEstudio({ showToast }: { showToast: (m: string) => void }) {
  const { resetDatosPilates, studioConfig, updateStudioConfig, studio, updateStudio } = useStudio();
  const [confirmReset, setConfirmReset] = useState(false);
  const [politica, setPolitica] = useState(studioConfig.politicaPrivacidad);
  const [terminos, setTerminos] = useState(studioConfig.terminosServicio);
  const [form, setForm] = useState<StudioForm>(() => studioToForm(studio));
  // Política de reservas/cancelaciones (C-2/C-4). Estado propio, tarjeta aparte.
  const [pol, setPol] = useState(() => studioToPolitica(studio));

  useEffect(() => { setForm(studioToForm(studio)); }, [studio]);
  useEffect(() => { setPol(studioToPolitica(studio)); }, [studio]);

  const handleReset = useCallback(() => {
    resetDatosPilates();
    showToast('Datos restablecidos al estado de demo');
  }, [resetDatosPilates, showToast]);

  function guardarEstudio() {
    updateStudio(form);
    showToast('Datos del estudio guardados');
  }

  function guardarPolitica() {
    updateStudio(pol);
    showToast('Política de reservas guardada');
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Studio info — editable */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-4">Información del estudio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className={labelCls}>Nombre del estudio</p>
            <input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Razón social</p>
            <input className={inputCls} value={form.razonSocial} onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>NIF / CIF</p>
            <input className={inputCls} value={form.nif} onChange={e => setForm(f => ({ ...f, nif: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Teléfono</p>
            <input className={inputCls} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Dirección</p>
            <input className={inputCls} value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Ciudad</p>
            <input className={inputCls} value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Código postal</p>
            <input className={inputCls} value={form.codigoPostal} onChange={e => setForm(f => ({ ...f, codigoPostal: e.target.value }))} />
          </div>
          <div>
            <p className={labelCls}>Email de contacto</p>
            <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <button onClick={guardarEstudio} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar datos del estudio
        </button>
      </div>

      {/* Reservas y cancelaciones (C-2/C-4) */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Reservas y cancelaciones</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Reglas que se aplican cuando una socia reserva o cancela desde el portal público.
        </p>
        <div className="space-y-4">
          <div>
            <p className={labelCls}>Ventana de cancelación (horas)</p>
            <input
              type="number" min={0} max={168} className={inputCls}
              value={pol.cancelacionVentanaHoras}
              onChange={e => setPol(p => ({ ...p, cancelacionVentanaHoras: Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Cancelar con menos antelación se considera tardío. 0 = sin penalización.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Devolver la sesión del bono en cancelaciones tardías
              <span className="block text-[11px] text-muted-foreground">Desactivado: una cancelación tardía pierde la sesión (recomendado).</span>
            </span>
            <Toggle on={pol.cancelacionDevolverBonoTardia} onChange={v => setPol(p => ({ ...p, cancelacionDevolverBonoTardia: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Exigir plan o bono activo para reservar
              <span className="block text-[11px] text-muted-foreground">La socia necesita una suscripción activa o bono con sesiones para reservar.</span>
            </span>
            <Toggle on={pol.reservaExigirPlan} onChange={v => setPol(p => ({ ...p, reservaExigirPlan: v }))} />
          </label>
          <div>
            <p className={labelCls}>Máximo de reservas simultáneas por socia</p>
            <input
              type="number" min={0} max={99} className={inputCls}
              placeholder="Sin límite"
              value={pol.reservaMaxSimultaneas ?? ''}
              onChange={e => setPol(p => ({ ...p, reservaMaxSimultaneas: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Reservas activas en clases futuras. Vacío = sin límite.
            </p>
          </div>
        </div>
        <button onClick={guardarPolitica} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors">
          Guardar política de reservas
        </button>
      </div>

      {/* Enlaces públicos */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Enlaces públicos</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Páginas de tu estudio para compartir con clientas o usar en tablet.
        </p>
        <div className="space-y-2">
          <a
            href={`/reservar/${studio?.slug ?? ''}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <CalendarLinkIcon size={15} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Portal de reservas</p>
              <p className="text-[11px] text-muted-foreground">Página pública para que cualquiera reserve una clase</p>
            </div>
            <ExternalLink size={13} className="text-muted-foreground shrink-0" />
          </a>
          <a
            href={`/kiosk/${studio?.slug ?? ''}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            <Monitor size={15} className="text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Modo quiosco</p>
              <p className="text-[11px] text-muted-foreground">Pantalla de check-in para dejar en una tablet en recepción</p>
            </div>
            <ExternalLink size={13} className="text-muted-foreground shrink-0" />
          </a>
        </div>
      </div>

      {/* Privacy policy */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Política de privacidad</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Este texto se muestra a las socias al registrarse y deben aceptarlo antes de completar la inscripción.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={politica}
          onChange={(e) => setPolitica(e.target.value)}
        />
        <button
          onClick={() => { updateStudioConfig({ politicaPrivacidad: politica }); showToast('Política de privacidad guardada'); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar política
        </button>
      </div>

      {/* Terms of service */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">Términos y condiciones</h3>
        <p className="text-[12px] text-muted-foreground mb-3">
          Contrato que acepta cada socia al inscribirse. Queda registrado con su firma digital.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] font-mono text-foreground focus:outline-none focus:border-muted-foreground transition-colors resize-y"
          value={terminos}
          onChange={(e) => setTerminos(e.target.value)}
        />
        <button
          onClick={() => { updateStudioConfig({ terminosServicio: terminos }); showToast('Términos y condiciones guardados'); }}
          className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors"
        >
          Guardar términos
        </button>
      </div>

      {/* Danger zone */}
      <div className={cn(cardCls, 'p-6 border-[#FCA5A5]')}>
        <h3 className="text-[14px] font-semibold text-[#DC2626] mb-1">Zona de riesgo</h3>
        <p className="text-[13px] text-muted-foreground mb-4">
          Las acciones de esta sección son irreversibles. Procede con precaución.
        </p>
        <div className="flex items-center justify-between p-4 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Restablecer datos de demo</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Borra todos los cambios y vuelve al estado inicial de demostración.
            </p>
          </div>
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#DC2626] text-[#DC2626] text-[12px] font-medium hover:bg-[#DC2626] hover:text-white transition-colors shrink-0 ml-4"
          >
            <RotateCcw size={12} />
            Restablecer
          </button>
        </div>
      </div>

      {/* Confirm reset dialog */}
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-12 h-12 rounded-xl bg-[#FEF3C7] flex items-center justify-center">
              <AlertTriangle size={20} className="text-[#D97706]" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground mb-1">
                ¿Restablecer datos de demo?
              </h3>
              <p className="text-[13px] text-muted-foreground">
                Todos los socios, sesiones, pagos y configuraciones que hayas creado se perderán.
                Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <button
                className={cn(btnSecondary, 'flex-1 justify-center')}
                onClick={() => setConfirmReset(false)}
              >
                Cancelar
              </button>
              <button
                className="flex-1 bg-[#D97706] text-white rounded-lg px-4 py-2 text-[13px] font-medium hover:bg-amber-700 transition-colors"
                onClick={() => { handleReset(); setConfirmReset(false); }}
              >
                Sí, restablecer
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: MI PERFIL
// ─────────────────────────────────────────────────────────────────────────────

const ROL_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  PROPIETARIO: { label: 'Propietaria', bg: '#F3EEFF', text: '#6D28D9' },
  INSTRUCTOR: { label: 'Instructora', bg: '#FFF2F7', text: '#B57A8E' },
  RECEPCION: { label: 'Recepción', bg: '#EAF6FF', text: '#0369A1' },
};

function TabPerfil({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateAvatarAdmin, updateStudio, instructores, updateInstructor, sesiones } = useStudio();
  const { user } = useAuth();

  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;
  const rol = yo?.rol ?? 'PROPIETARIO';
  const rolInfo = ROL_LABEL[rol];

  const [form, setForm] = useState({
    nombre: yo?.nombre ?? 'Propietaria',
    email: yo?.email ?? user?.email ?? '',
    telefono: yo?.telefono ?? '',
  });
  const [guardado, setGuardado] = useState(false);

  const now = new Date();
  const clasesImpartidas = yo ? sesiones.filter(s => s.instructorId === yo.id && new Date(s.inicio) < now) : [];
  const clasesEsteMes = clasesImpartidas.filter(s => {
    const d = new Date(s.inicio);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const proximaClase = yo
    ? sesiones.filter(s => s.instructorId === yo.id && new Date(s.inicio) > now).sort((a, b) => a.inicio.localeCompare(b.inicio))[0]
    : null;

  function guardar() {
    if (!yo) return;
    updateInstructor(yo.id, { nombre: form.nombre.trim(), email: form.email.trim() || null, telefono: form.telefono.trim() || null });
    setGuardado(true);
    showToast('Perfil actualizado');
    setTimeout(() => setGuardado(false), 2000);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <div className="flex items-center gap-4 mb-1">
          <ProfileAvatar avatarId={studio?.avatarAdmin} nombre={form.nombre || 'Admin'} size="xl" />
          <div>
            <p className="text-[15px] font-bold text-foreground">{form.nombre || 'Sin nombre'}</p>
            <p className="text-[12px] text-muted-foreground">{form.email}</p>
            <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: rolInfo.bg, color: rolInfo.text }}>
              {rolInfo.label}
            </span>
          </div>
        </div>
        <div className="mt-5">
          <AvatarPicker
            value={studio?.avatarAdmin ?? null}
            onChange={id => { updateAvatarAdmin(id); showToast('Avatar actualizado'); }}
          />
        </div>
      </div>

      {rol === 'INSTRUCTOR' && yo && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { v: clasesEsteMes, l: 'Este mes' },
            { v: clasesImpartidas.length, l: 'Impartidas' },
            { v: proximaClase ? new Date(proximaClase.inicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—', l: 'Próxima clase' },
          ].map(({ v, l }) => (
            <div key={l} className={cn(cardCls, 'p-4 text-center')}>
              <p className="text-[20px] font-extrabold text-foreground leading-none">{v}</p>
              <p className="text-[10px] font-bold text-muted-foreground mt-1.5 uppercase tracking-wider">{l}</p>
            </div>
          ))}
        </div>
      )}

      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-4">Tus datos</h3>
        {yo ? (
          <>
            <div className="space-y-3.5">
              <div>
                <p className={labelCls}>Nombre</p>
                <input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Email</p>
                <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <p className={labelCls}>Teléfono</p>
                <input type="tel" className={inputCls} value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
            </div>
            <button onClick={guardar} className="mt-4 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors flex items-center gap-1.5">
              {guardado && <Check size={13} />}
              {guardado ? 'Guardado' : 'Guardar cambios'}
            </button>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Cuenta: {form.email}. Tu nombre y datos de contacto de propietaria se gestionan en Configuración &gt; Estudio.
          </p>
        )}
      </div>
    </div>
  );
}
