'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Check, AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { PlanTarifa, Sala, TipoClase, Instructor } from '@/lib/types';

// ─── Design tokens ────────────────────────────────────────────────────────────
const inputCls =
  'rounded-lg border border-[#E8EAED] px-3 py-2 text-[13px] w-full focus:outline-none focus:ring-2 focus:ring-black/10';
const labelCls = 'text-[12px] font-medium text-[#374151] block mb-1';
const btnPrimary =
  'bg-[#111827] text-white rounded-lg px-4 py-2 text-[13px] font-medium flex items-center gap-1.5 hover:bg-[#1f2937] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const btnSecondary =
  'bg-white border border-[#E8EAED] rounded-lg px-4 py-2 text-[13px] text-[#374151] hover:bg-gray-50 transition-colors';
const cardCls = 'bg-white border border-[#E8EAED] rounded-xl';

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
        on ? 'bg-[#111827]' : 'bg-[#D1D5DB]'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200',
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
        className="w-9 h-9 rounded-lg border border-[#E8EAED] cursor-pointer p-0.5 shrink-0"
      />
      <input
        className={cn(inputCls, 'flex-1')}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="#111827"
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
            <h3 className="text-[14px] font-semibold text-[#111827] mb-1">{title}</h3>
            <p className="text-[13px] text-[#6B7280]">{description}</p>
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#111827] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-none">
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
    PUNTUAL: 'bg-[#F4F5F7] text-[#6B7280]',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium', map[tipo])}>
      {tipo}
    </span>
  );
}

function NivelBadge({ nivel }: { nivel: TipoClase['nivel'] }) {
  const map: Record<string, string> = {
    TODOS: 'bg-[#F4F5F7] text-[#6B7280]',
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
        activo ? 'bg-[#D1FAE5] text-[#059669]' : 'bg-[#F4F5F7] text-[#6B7280]'
      )}
    >
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  );
}

// ─── Tab definition ───────────────────────────────────────────────────────────

type TabId = 'planes' | 'clases' | 'salas' | 'instructores' | 'estudio';

const TABS: { id: TabId; label: string }[] = [
  { id: 'planes',      label: 'Planes y tarifas' },
  { id: 'clases',      label: 'Clases' },
  { id: 'salas',       label: 'Salas' },
  { id: 'instructores', label: 'Instructores' },
  { id: 'estudio',     label: 'Estudio' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('planes');
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-bold text-[#111827]">Configuración</h1>
        <p className="text-[13px] text-[#6B7280] mt-0.5">
          Gestiona los planes, clases, salas e instructores de tu estudio
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 bg-white border border-[#E8EAED] rounded-xl overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-[#111827] text-white'
                : 'text-[#6B7280] hover:text-[#111827] hover:bg-[#F4F5F7]'
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
      {activeTab === 'instructores' && <TabInstructores showToast={showToast} />}
      {activeTab === 'estudio'     && <TabEstudio      showToast={showToast} />}

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
        <p className="text-[13px] text-[#6B7280]">{planesTarifa.length} planes configurados</p>
        <button className={btnPrimary} onClick={openNuevo}>
          <Plus size={13} />
          Nuevo plan
        </button>
      </div>

      <div className={cn(cardCls, 'p-0 overflow-hidden')}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E8EAED]">
              {['Nombre', 'Tipo', 'Precio', 'Sesiones', 'Estado', 'Acciones'].map(h => (
                <th
                  key={h}
                  className="text-left px-5 py-3 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planesTarifa.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-[#6B7280]">
                  No hay planes creados. Haz clic en &quot;Nuevo plan&quot; para empezar.
                </td>
              </tr>
            )}
            {planesTarifa.map(plan => (
              <tr
                key={plan.id}
                className={cn(
                  'border-b border-[#F4F5F7] last:border-0 hover:bg-[#F9FAFB] transition-colors',
                  !plan.activo && 'opacity-50'
                )}
              >
                <td className="px-5 py-3 font-medium text-[#111827]">{plan.nombre}</td>
                <td className="px-5 py-3">
                  <TipoPlanBadge tipo={plan.tipo} />
                </td>
                <td className="px-5 py-3 font-semibold text-[#111827]">{plan.precio} €</td>
                <td className="px-5 py-3 text-[#6B7280]">
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
                      className="p-1.5 rounded-lg hover:bg-[#F4F5F7] text-[#6B7280] hover:text-[#111827] transition-colors"
                      aria-label="Editar plan"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDel(plan.id)}
                      className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#6B7280] hover:text-[#DC2626] transition-colors"
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
      </div>

      {/* Modal nuevo/editar */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[#111827]">
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
  color: '#6366F1',
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
      addTipoClase(fields);
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
        <p className="text-[13px] text-[#6B7280]">{tiposClase.length} tipos de clase configurados</p>
        <button className={btnPrimary} onClick={openNueva}>
          <Plus size={13} />
          Nueva clase
        </button>
      </div>

      {tiposClase.length === 0 && (
        <div className={cn(cardCls, 'p-10 text-center text-[13px] text-[#6B7280]')}>
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
                <p className="text-[13px] font-semibold text-[#111827] truncate">{tc.nombre}</p>
                <p className="text-[11px] text-[#6B7280]">{tc.duracionMinutos} min</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <NivelBadge nivel={tc.nivel} />
              {tc.descripcion && (
                <p className="text-[11px] text-[#9CA3AF] truncate ml-2 flex-1 text-right">
                  {tc.descripcion}
                </p>
              )}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1 pt-1 border-t border-[#F4F5F7]">
              <button
                onClick={() => openEditar(tc)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#6B7280] hover:bg-[#F4F5F7] hover:text-[#111827] transition-colors"
              >
                <Pencil size={11} />
                Editar
              </button>
              <button
                onClick={() => setConfirmDel(tc.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#6B7280] hover:bg-[#FEE2E2] hover:text-[#DC2626] transition-colors ml-auto"
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
            <DialogTitle className="text-[15px] font-semibold text-[#111827]">
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
  color: '#6366F1',
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
        <p className="text-[13px] text-[#6B7280]">{salas.length} salas configuradas</p>
        <button className={btnPrimary} onClick={openNueva}>
          <Plus size={13} />
          Nueva sala
        </button>
      </div>

      <div className={cn(cardCls, 'p-0 overflow-hidden')}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E8EAED]">
              {['Nombre', 'Capacidad', 'Color', 'Acciones'].map(h => (
                <th
                  key={h}
                  className="text-left px-5 py-3 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {salas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-[13px] text-[#6B7280]">
                  No hay salas creadas. Haz clic en &quot;Nueva sala&quot; para empezar.
                </td>
              </tr>
            )}
            {salas.map(sala => (
              <tr
                key={sala.id}
                className="border-b border-[#F4F5F7] last:border-0 hover:bg-[#F9FAFB] transition-colors"
              >
                <td className="px-5 py-3 font-medium text-[#111827]">{sala.nombre}</td>
                <td className="px-5 py-3 text-[#6B7280]">{sala.capacidad} personas</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <ColorSwatch color={sala.color} size="sm" />
                    <span className="text-[12px] text-[#6B7280] font-mono">{sala.color}</span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditar(sala)}
                      className="p-1.5 rounded-lg hover:bg-[#F4F5F7] text-[#6B7280] hover:text-[#111827] transition-colors"
                      aria-label="Editar sala"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDel(sala.id)}
                      className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#6B7280] hover:text-[#DC2626] transition-colors"
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
      </div>

      {/* Modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[#111827]">
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
// TAB 4: INSTRUCTORES
// ─────────────────────────────────────────────────────────────────────────────

type InstructorForm = {
  nombre: string;
  email: string;
  telefono: string;
  color: string;
  activo: boolean;
};

const emptyInstructorForm = (): InstructorForm => ({
  nombre: '',
  email: '',
  telefono: '',
  color: '#6366F1',
  activo: true,
});

function instructorToForm(i: Instructor): InstructorForm {
  return {
    nombre: i.nombre,
    email: i.email ?? '',
    telefono: i.telefono ?? '',
    color: i.color,
    activo: i.activo,
  };
}

function InstructorAvatar({
  nombre,
  color,
  size = 'md',
}: {
  nombre: string;
  color: string;
  size?: 'sm' | 'md';
}) {
  const initial = nombre.charAt(0).toUpperCase();
  const cls =
    size === 'sm'
      ? 'w-7 h-7 text-[11px]'
      : 'w-8 h-8 text-[13px]';
  return (
    <span
      className={cn(
        cls,
        'inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0'
      )}
      style={{ backgroundColor: color }}
    >
      {initial}
    </span>
  );
}

function TabInstructores({ showToast }: { showToast: (m: string) => void }) {
  const { instructores, addInstructor, updateInstructor, deleteInstructor } = useStudio();

  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<InstructorForm>(emptyInstructorForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const openNuevo = useCallback(() => {
    setForm(emptyInstructorForm());
    setEditId(null);
    setModal('nuevo');
  }, []);

  const openEditar = useCallback((i: Instructor) => {
    setForm(instructorToForm(i));
    setEditId(i.id);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const guardar = useCallback(() => {
    const fields = {
      nombre: form.nombre.trim(),
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      color: form.color,
      activo: form.activo,
    };
    if (modal === 'nuevo') {
      addInstructor(fields);
      showToast('Instructor creado correctamente');
    } else if (editId) {
      updateInstructor(editId, fields);
      showToast('Instructor actualizado');
    }
    setModal(null);
  }, [modal, editId, form, addInstructor, updateInstructor, showToast]);

  const toggleActivo = useCallback(
    (id: string, current: boolean) => {
      updateInstructor(id, { activo: !current });
      showToast(!current ? 'Instructor activado' : 'Instructor desactivado');
    },
    [updateInstructor, showToast]
  );

  const handleDelete = useCallback(() => {
    if (confirmDel) {
      deleteInstructor(confirmDel);
      showToast('Instructor eliminado');
    }
  }, [confirmDel, deleteInstructor, showToast]);

  const canGuardar = form.nombre.trim();

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#6B7280]">{instructores.length} instructores configurados</p>
        <button className={btnPrimary} onClick={openNuevo}>
          <Plus size={13} />
          Nuevo instructor
        </button>
      </div>

      <div className={cn(cardCls, 'p-0 overflow-hidden')}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#E8EAED]">
              {['Instructor', 'Email', 'Teléfono', 'Estado', 'Acciones'].map(h => (
                <th
                  key={h}
                  className="text-left px-5 py-3 text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {instructores.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-[#6B7280]">
                  No hay instructores creados. Haz clic en &quot;Nuevo instructor&quot; para empezar.
                </td>
              </tr>
            )}
            {instructores.map(inst => (
              <tr
                key={inst.id}
                className={cn(
                  'border-b border-[#F4F5F7] last:border-0 hover:bg-[#F9FAFB] transition-colors',
                  !inst.activo && 'opacity-50'
                )}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <InstructorAvatar nombre={inst.nombre} color={inst.color} />
                    <span className="font-medium text-[#111827]">{inst.nombre}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-[#6B7280]">{inst.email ?? '—'}</td>
                <td className="px-5 py-3 text-[#6B7280]">{inst.telefono ?? '—'}</td>
                <td className="px-5 py-3">
                  <Toggle
                    on={inst.activo}
                    onChange={() => toggleActivo(inst.id, inst.activo)}
                  />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditar(inst)}
                      className="p-1.5 rounded-lg hover:bg-[#F4F5F7] text-[#6B7280] hover:text-[#111827] transition-colors"
                      aria-label="Editar instructor"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDel(inst.id)}
                      className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-[#6B7280] hover:text-[#DC2626] transition-colors"
                      aria-label="Eliminar instructor"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-[#111827]">
              {modal === 'nuevo' ? 'Nuevo instructor' : 'Editar instructor'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field label="Nombre completo">
              <input
                className={inputCls}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: María García"
              />
            </Field>
            <Field label="Email (opcional)">
              <input
                className={inputCls}
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="instructor@estudio.es"
              />
            </Field>
            <Field label="Teléfono (opcional)">
              <input
                className={inputCls}
                type="tel"
                value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                placeholder="+34 600 000 000"
              />
            </Field>
            <Field label="Color identificador">
              <div className="flex items-center gap-3">
                <ColorInput value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} />
                {form.nombre && (
                  <InstructorAvatar nombre={form.nombre} color={form.color} size="md" />
                )}
              </div>
            </Field>
            <div className="flex items-center justify-between py-1">
              <span className={labelCls}>Instructor activo</span>
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
              {modal === 'nuevo' ? 'Crear instructor' : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        title="¿Eliminar instructor?"
        description="Se eliminará este instructor del sistema. Las sesiones ya creadas no se verán afectadas."
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5: ESTUDIO
// ─────────────────────────────────────────────────────────────────────────────

function TabEstudio({ showToast }: { showToast: (m: string) => void }) {
  const { resetDatosPilates, studioConfig, updateStudioConfig } = useStudio();
  const [confirmReset, setConfirmReset] = useState(false);
  const [politica, setPolitica] = useState(studioConfig.politicaPrivacidad);
  const [terminos, setTerminos] = useState(studioConfig.terminosServicio);

  const handleReset = useCallback(() => {
    resetDatosPilates();
    showToast('Datos restablecidos al estado de demo');
  }, [resetDatosPilates, showToast]);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Studio info — read-only */}
      <div className={cn(cardCls, 'p-6')}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-[14px] font-semibold text-[#111827]">Información del estudio</h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
            Próximamente
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Nombre del estudio', value: 'Tentare' },
            { label: 'Dirección', value: 'Calle Larios, 12 - 2ºA' },
            { label: 'Ciudad', value: 'Málaga' },
            { label: 'Código postal', value: '29005' },
            { label: 'Teléfono', value: '+34 952 000 000' },
            { label: 'Email de contacto', value: 'hola@tentare.es' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className={labelCls}>{label}</p>
              <p className="text-[13px] text-[#111827] bg-[#F9FAFB] border border-[#E8EAED] rounded-lg px-3 py-2">
                {value}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-[#9CA3AF] mt-4">
          La edición de los datos del estudio estará disponible próximamente.
        </p>
      </div>

      {/* Privacy policy */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Política de privacidad</h3>
        <p className="text-[12px] text-[#6B7280] mb-3">
          Este texto se muestra a las socias al registrarse y deben aceptarlo antes de completar la inscripción.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-[#E8EAED] bg-white px-3 py-2 text-[12px] font-mono text-[#374151] focus:outline-none focus:border-[#9CA3AF] transition-colors resize-y"
          value={politica}
          onChange={(e) => setPolitica(e.target.value)}
        />
        <button
          onClick={() => { updateStudioConfig({ politicaPrivacidad: politica }); showToast('Política de privacidad guardada'); }}
          className="mt-3 px-4 py-2 rounded-lg bg-[#111827] text-white text-[12px] font-medium hover:bg-[#1F2937] transition-colors"
        >
          Guardar política
        </button>
      </div>

      {/* Terms of service */}
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-[#111827] mb-1">Términos y condiciones</h3>
        <p className="text-[12px] text-[#6B7280] mb-3">
          Contrato que acepta cada socia al inscribirse. Queda registrado con su firma digital.
        </p>
        <textarea
          rows={8}
          className="w-full rounded-lg border border-[#E8EAED] bg-white px-3 py-2 text-[12px] font-mono text-[#374151] focus:outline-none focus:border-[#9CA3AF] transition-colors resize-y"
          value={terminos}
          onChange={(e) => setTerminos(e.target.value)}
        />
        <button
          onClick={() => { updateStudioConfig({ terminosServicio: terminos }); showToast('Términos y condiciones guardados'); }}
          className="mt-3 px-4 py-2 rounded-lg bg-[#111827] text-white text-[12px] font-medium hover:bg-[#1F2937] transition-colors"
        >
          Guardar términos
        </button>
      </div>

      {/* Danger zone */}
      <div className={cn(cardCls, 'p-6 border-[#FCA5A5]')}>
        <h3 className="text-[14px] font-semibold text-[#DC2626] mb-1">Zona de riesgo</h3>
        <p className="text-[13px] text-[#6B7280] mb-4">
          Las acciones de esta sección son irreversibles. Procede con precaución.
        </p>
        <div className="flex items-center justify-between p-4 bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl">
          <div>
            <p className="text-[13px] font-semibold text-[#111827]">Restablecer datos de demo</p>
            <p className="text-[12px] text-[#6B7280] mt-0.5">
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
              <h3 className="text-[14px] font-semibold text-[#111827] mb-1">
                ¿Restablecer datos de demo?
              </h3>
              <p className="text-[13px] text-[#6B7280]">
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
