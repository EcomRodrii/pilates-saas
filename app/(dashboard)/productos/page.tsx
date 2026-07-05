'use client';

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Package, Plus, Pencil, Trash2, Tag, Users, Repeat, Zap, ShoppingBag, X, Check } from 'lucide-react';
import type { PlanTarifa, ProductoPOS } from '@/lib/types';

type Tab = 'planes' | 'pos';

const TIPO_LABEL: Record<string, string> = { MENSUAL: 'Mensual', BONO: 'Bono sesiones', PUNTUAL: 'Puntual' };
const TIPO_COLOR: Record<string, { bg: string; text: string }> = {
  MENSUAL: { bg: '#EEEBFF', text: '#6355FF' },
  BONO: { bg: '#FEF3C7', text: '#B45309' },
  PUNTUAL: { bg: '#F0FDF4', text: '#15803D' },
};
const CAT_LABEL: Record<string, string> = { SESION: 'Sesión', PACK: 'Pack', PRODUCTO: 'Producto', OTRO: 'Otro' };
const CAT_COLOR: Record<string, { bg: string; text: string }> = {
  SESION: { bg: '#EEEBFF', text: '#6355FF' },
  PACK: { bg: '#FEF3C7', text: '#B45309' },
  PRODUCTO: { bg: '#F0FDF4', text: '#15803D' },
  OTRO: { bg: '#F1F1F6', text: '#71727A' },
};
function fmt(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Plan form modal ───────────────────────────────────────────────────────────

type PlanFormData = { nombre: string; precio: string; tipo: PlanTarifa['tipo']; sesiones: string; descripcion: string; activo: boolean };

function PlanModal({ initial, onSave, onClose }: {
  initial?: PlanTarifa;
  onSave: (d: PlanFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PlanFormData>({
    nombre: initial?.nombre ?? '',
    precio: initial?.precio?.toString() ?? '',
    tipo: initial?.tipo ?? 'MENSUAL',
    sesiones: initial?.sesiones?.toString() ?? '',
    descripcion: initial?.descripcion ?? '',
    activo: initial?.activo ?? true,
  });
  const set = (k: keyof PlanFormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.nombre.trim() && form.precio && Number(form.precio) >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECECF1]">
          <h2 className="font-bold text-[#15161B]">{initial ? 'Editar plan' : 'Nuevo plan'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#71727A]"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Nombre *</label>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF]"
              placeholder="Ej. Mensual ilimitado" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Precio (€) *</label>
              <input value={form.precio} onChange={e => set('precio', e.target.value)} type="number" min="0" step="0.01"
                className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF]"
                placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)}
                className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF] bg-white">
                <option value="MENSUAL">Mensual</option>
                <option value="BONO">Bono sesiones</option>
                <option value="PUNTUAL">Puntual</option>
              </select>
            </div>
          </div>
          {(form.tipo === 'BONO' || form.tipo === 'PUNTUAL') && (
            <div>
              <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Número de sesiones</label>
              <input value={form.sesiones} onChange={e => set('sesiones', e.target.value)} type="number" min="1"
                className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF]"
                placeholder="8" />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Descripción</label>
            <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF]"
              placeholder="Acceso ilimitado a clases grupales" />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => set('activo', !form.activo)}
              className="w-9 h-5 rounded-full transition-colors flex items-center px-0.5"
              style={{ backgroundColor: form.activo ? '#6355FF' : '#D1D5DB' }}>
              <div className="w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ transform: form.activo ? 'translateX(16px)' : 'translateX(0)' }} />
            </div>
            <span className="text-sm font-medium text-[#3A3B44]">Plan activo</span>
          </label>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#ECECF1] text-sm font-semibold text-[#71727A] hover:bg-gray-50">Cancelar</button>
          <button onClick={() => valid && onSave(form)} disabled={!valid}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: '#6355FF' }}>
            {initial ? 'Guardar cambios' : 'Crear plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProductoPOS form modal ────────────────────────────────────────────────────

type PosFormData = { nombre: string; precio: string; categoria: ProductoPOS['categoria']; activo: boolean };

function PosModal({ initial, onSave, onClose }: {
  initial?: ProductoPOS;
  onSave: (d: PosFormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PosFormData>({
    nombre: initial?.nombre ?? '',
    precio: initial?.precio?.toString() ?? '',
    categoria: initial?.categoria ?? 'PRODUCTO',
    activo: initial?.activo ?? true,
  });
  const set = (k: keyof PosFormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.nombre.trim() && form.precio && Number(form.precio) >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECECF1]">
          <h2 className="font-bold text-[#15161B]">{initial ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#71727A]"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Nombre *</label>
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF]"
              placeholder="Ej. Calcetines antideslizantes" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Precio (€) *</label>
              <input value={form.precio} onChange={e => set('precio', e.target.value)} type="number" min="0" step="0.01"
                className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF]"
                placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#71727A] uppercase tracking-wide mb-1.5 block">Categoría</label>
              <select value={form.categoria} onChange={e => set('categoria', e.target.value)}
                className="w-full border border-[#ECECF1] rounded-xl px-3 py-2.5 text-sm text-[#15161B] outline-none focus:border-[#6355FF] bg-white">
                <option value="SESION">Sesión</option>
                <option value="PACK">Pack</option>
                <option value="PRODUCTO">Producto</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => set('activo', !form.activo)}
              className="w-9 h-5 rounded-full transition-colors flex items-center px-0.5"
              style={{ backgroundColor: form.activo ? '#6355FF' : '#D1D5DB' }}>
              <div className="w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ transform: form.activo ? 'translateX(16px)' : 'translateX(0)' }} />
            </div>
            <span className="text-sm font-medium text-[#3A3B44]">Producto activo</span>
          </label>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[#ECECF1] text-sm font-semibold text-[#71727A] hover:bg-gray-50">Cancelar</button>
          <button onClick={() => valid && onSave(form)} disabled={!valid}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: '#6355FF' }}>
            {initial ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Productos() {
  const { planesTarifa, addPlan, updatePlan, deletePlan, productosPOS, suscripciones } = useStudio();
  const [tab, setTab] = useState<Tab>('planes');
  const [planModal, setPlanModal] = useState<PlanTarifa | null | 'new'>(null);
  const [posModal, setPosModal] = useState<ProductoPOS | null | 'new'>(null);

  // Count active suscripciones per plan
  const susCount = (planId: string) => suscripciones.filter(s => s.planId === planId && s.estado === 'ACTIVA').length;

  function savePlan(d: ReturnType<typeof Object.assign> & { nombre: string; precio: string; tipo: PlanTarifa['tipo']; sesiones: string; descripcion: string; activo: boolean }) {
    const fields = {
      nombre: d.nombre.trim(),
      precio: parseFloat(d.precio) || 0,
      tipo: d.tipo,
      sesiones: d.tipo !== 'MENSUAL' && d.sesiones ? parseInt(d.sesiones) : null,
      descripcion: d.descripcion.trim() || null,
      activo: d.activo,
    };
    if (planModal && planModal !== 'new') {
      updatePlan(planModal.id, fields);
    } else {
      addPlan(fields);
    }
    setPlanModal(null);
  }

  function savePos(d: { nombre: string; precio: string; categoria: ProductoPOS['categoria']; activo: boolean }) {
    // productosPOS is currently read-only seed data — no add/update functions in context yet
    // This will be wired when the context exposes addProductoPOS/updateProductoPOS
    setPosModal(null);
  }

  const PLAN_ICONS: Record<string, React.ElementType> = { MENSUAL: Repeat, BONO: Zap, PUNTUAL: Tag };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#15161B] tracking-tight">Productos</h1>
          <p className="text-sm font-medium mt-0.5 text-[#71727A]">
            Planes de suscripción y catálogo de productos POS
          </p>
        </div>
        <button
          onClick={() => tab === 'planes' ? setPlanModal('new') : setPosModal('new')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold transition-colors"
          style={{ backgroundColor: '#6355FF' }}
        >
          <Plus size={15} />
          {tab === 'planes' ? 'Nuevo plan' : 'Nuevo producto'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F1F1F6] p-1 rounded-xl w-fit">
        {([['planes', 'Planes de suscripción'], ['pos', 'Productos POS']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={tab === v ? { backgroundColor: '#fff', color: '#15161B', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : { color: '#71727A' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── PLANES ── */}
      {tab === 'planes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {planesTarifa.map(plan => {
            const c = TIPO_COLOR[plan.tipo] ?? TIPO_COLOR.MENSUAL;
            const Icon = PLAN_ICONS[plan.tipo] ?? Tag;
            const count = susCount(plan.id);
            return (
              <div key={plan.id} className="bg-white rounded-2xl border border-[#ECECF1] p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: c.bg }}>
                      <Icon size={16} style={{ color: c.text }} />
                    </div>
                    <div>
                      <p className="font-bold text-[#15161B] text-sm leading-tight">{plan.nombre}</p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 inline-block"
                        style={{ backgroundColor: c.bg, color: c.text }}>
                        {TIPO_LABEL[plan.tipo]}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setPlanModal(plan)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#71727A] transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deletePlan(plan.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-[#71727A] hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-extrabold text-[#15161B]">{fmt(plan.precio)} €</p>
                    <p className="text-xs text-[#A2A3AC] mt-0.5">
                      {plan.tipo === 'MENSUAL' ? 'al mes' : plan.sesiones ? `${plan.sesiones} sesiones` : 'por sesión'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-[#71727A]">
                      <Users size={12} />
                      <span className="text-sm font-semibold text-[#15161B]">{count}</span>
                    </div>
                    <p className="text-[10px] text-[#A2A3AC]">activos</p>
                  </div>
                </div>

                {plan.descripcion && (
                  <p className="text-xs text-[#71727A] border-t border-[#F1F1F6] pt-3">{plan.descripcion}</p>
                )}

                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: plan.activo ? '#22C55E' : '#D1D5DB' }} />
                  <span className="text-xs font-medium" style={{ color: plan.activo ? '#15803D' : '#A2A3AC' }}>
                    {plan.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Add card */}
          <button onClick={() => setPlanModal('new')}
            className="bg-white rounded-2xl border-2 border-dashed border-[#ECECF1] p-5 flex flex-col items-center justify-center gap-2 text-[#A2A3AC] hover:border-[#6355FF] hover:text-[#6355FF] transition-colors min-h-[160px]">
            <Plus size={20} />
            <span className="text-sm font-semibold">Añadir plan</span>
          </button>
        </div>
      )}

      {/* ── PRODUCTOS POS ── */}
      {tab === 'pos' && (
        <div className="bg-white rounded-2xl border border-[#ECECF1] overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-[#F4F4F8] border-b border-[#ECECF1]">
                {['Producto', 'Categoría', 'Precio', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#71727A]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F1F6]">
              {productosPOS.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <p className="text-sm font-semibold text-[#15161B]">Aún no hay productos POS</p>
                    <p className="text-[13px] text-[#A2A3AC] mt-1">Añade productos (agua, toallas, packs…) para venderlos en el terminal.</p>
                  </td>
                </tr>
              )}
              {productosPOS.map(p => {
                const c = CAT_COLOR[p.categoria] ?? CAT_COLOR.OTRO;
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: c.bg }}>
                          <ShoppingBag size={13} style={{ color: c.text }} />
                        </div>
                        <span className="font-semibold text-[#15161B]">{p.nombre}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: c.bg, color: c.text }}>
                        {CAT_LABEL[p.categoria]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-[#15161B]">{fmt(p.precio)} €</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.activo ? '#22C55E' : '#D1D5DB' }} />
                        <span className="text-xs font-medium" style={{ color: p.activo ? '#15803D' : '#A2A3AC' }}>
                          {p.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => setPosModal(p)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-[#71727A] transition-colors">
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="p-4 border-t border-[#ECECF1]">
            <button onClick={() => setPosModal('new')}
              className="flex items-center gap-2 text-sm font-semibold text-[#6355FF] hover:text-[#4B3FD6] transition-colors">
              <Plus size={14} />
              Añadir producto
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {planModal && (
        <PlanModal
          initial={planModal !== 'new' ? planModal : undefined}
          onSave={savePlan as Parameters<typeof PlanModal>[0]['onSave']}
          onClose={() => setPlanModal(null)}
        />
      )}
      {posModal && (
        <PosModal
          initial={posModal !== 'new' ? posModal : undefined}
          onSave={savePos}
          onClose={() => setPosModal(null)}
        />
      )}
    </div>
  );
}
