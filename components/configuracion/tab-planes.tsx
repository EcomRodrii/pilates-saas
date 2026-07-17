'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { PlanTarifa } from '@/lib/types';
import {
  Field,
  Toggle,
  ConfirmDialog,
  TipoPlanBadge,
  inputCls,
  labelCls,
  btnPrimary,
  btnSecondary,
  cardCls,
} from '@/app/(dashboard)/configuracion/page';

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

export function TabPlanes({ showToast }: { showToast: (m: string) => void }) {
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
