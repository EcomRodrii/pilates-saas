'use client';

import { useCallback, useState } from 'react';
import {
  ColorInput, ColorSwatch, ConfirmDialog, Field, Toggle,
  btnPrimary, btnSecondary, cardCls, inputCls, labelCls,
} from '@/app/(dashboard)/configuracion/page';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import type { ServicioCita, TipoCita } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Pencil, Plus, Trash2, Check } from 'lucide-react';

const TIPOS: { id: TipoCita; label: string }[] = [
  { id: 'PRIVADA', label: 'Privada' },
  { id: 'EVALUACION', label: 'Evaluación' },
  { id: 'FISIOTERAPIA', label: 'Fisioterapia' },
  { id: 'ONLINE', label: 'Online' },
];

type ServicioForm = {
  nombre: string;
  tipo: TipoCita;
  duracionMin: string;
  precio: string;
  autoReservable: boolean;
  color: string;
  descripcion: string;
  activo: boolean;
};

const emptyForm = (): ServicioForm => ({
  nombre: '',
  tipo: 'PRIVADA',
  duracionMin: '60',
  precio: '',
  autoReservable: true,
  color: '#8B5CF6',
  descripcion: '',
  activo: true,
});

function servicioToForm(s: ServicioCita): ServicioForm {
  return {
    nombre: s.nombre,
    tipo: s.tipo,
    duracionMin: String(s.duracionMin),
    precio: s.precio != null ? String(s.precio) : '',
    autoReservable: s.autoReservable,
    color: s.color ?? '#8B5CF6',
    descripcion: s.descripcion ?? '',
    activo: s.activo,
  };
}

export function TabServiciosCita({ showToast }: { showToast: (m: string) => void }) {
  const { citasServicios, addServicioCita, updateServicioCita, deleteServicioCita } = useStudio();

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ServicioForm>(emptyForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const openNueva = useCallback(() => {
    setForm(emptyForm());
    setEditId(null);
    setModal('nueva');
  }, []);

  const openEditar = useCallback((s: ServicioCita) => {
    setForm(servicioToForm(s));
    setEditId(s.id);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  const guardar = useCallback(() => {
    const precioNum = form.precio.trim() === '' ? null : Number(form.precio.replace(',', '.'));
    const fields = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      duracionMin: Math.max(5, Math.min(480, parseInt(form.duracionMin, 10) || 60)),
      precio: precioNum != null && Number.isFinite(precioNum) ? precioNum : null,
      autoReservable: form.autoReservable,
      color: form.color,
      descripcion: form.descripcion.trim() || null,
      activo: form.activo,
      orden: 0,
    };
    if (modal === 'nueva') {
      addServicioCita(fields);
      showToast('Servicio creado');
    } else if (editId) {
      updateServicioCita(editId, fields);
      showToast('Servicio actualizado');
    }
    setModal(null);
  }, [modal, editId, form, addServicioCita, updateServicioCita, showToast]);

  const handleDelete = useCallback(() => {
    if (confirmDel) {
      deleteServicioCita(confirmDel);
      showToast('Servicio eliminado');
    }
  }, [confirmDel, deleteServicioCita, showToast]);

  const canGuardar = form.nombre.trim() && form.duracionMin;
  const servicios = [...citasServicios].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          {servicios.length} servicio{servicios.length !== 1 ? 's' : ''} de cita ·{' '}
          los marcados como <span className="font-medium text-foreground">auto-reservables</span> aparecen en la reserva pública
        </p>
        <button className={btnPrimary} onClick={openNueva}>
          <Plus size={13} />
          Nuevo servicio
        </button>
      </div>

      <div className={cn(cardCls, 'p-0 overflow-hidden')}>
        {servicios.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No hay servicios de cita. Crea uno (p. ej. &quot;Clase privada&quot;, &quot;Evaluación inicial&quot;) para que las socias puedan reservarlo.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="w-full text-[13px] hidden sm:table">
              <thead>
                <tr className="border-b border-border">
                  {['Servicio', 'Tipo', 'Duración', 'Precio', 'Auto-reserva', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {servicios.map(s => (
                  <tr key={s.id} className="border-b border-background last:border-0 hover:bg-muted transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <ColorSwatch color={s.color ?? '#8B5CF6'} size="sm" />
                        <span className="font-medium text-foreground">{s.nombre}</span>
                        {!s.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inactivo</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{TIPOS.find(t => t.id === s.tipo)?.label ?? s.tipo}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.duracionMin} min</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.precio != null ? `${s.precio} €` : '—'}</td>
                    <td className="px-5 py-3">
                      {s.autoReservable
                        ? <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#059669]"><Check size={13} />Sí</span>
                        : <span className="text-[12px] text-muted-foreground">No</span>}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditar(s)} className="p-1.5 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-colors" aria-label="Editar servicio">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDel(s.id)} className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground hover:text-[#DC2626] transition-colors" aria-label="Eliminar servicio">
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
              {servicios.map(s => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ColorSwatch color={s.color ?? '#8B5CF6'} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-[14px] truncate">{s.nombre}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {s.duracionMin} min · {s.precio != null ? `${s.precio} €` : 'sin precio'} · {s.autoReservable ? 'auto-reserva' : 'solo panel'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditar(s)} className="p-1.5 rounded-lg hover:bg-background text-muted-foreground" aria-label="Editar servicio">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setConfirmDel(s.id)} className="p-1.5 rounded-lg hover:bg-[#FEE2E2] text-muted-foreground" aria-label="Eliminar servicio">
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
              {modal === 'nueva' ? 'Nuevo servicio de cita' : 'Editar servicio'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field label="Nombre del servicio">
              <input className={inputCls} value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Clase privada" />
            </Field>
            <Field label="Tipo">
              <select className={inputCls} value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoCita }))}>
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duración (min)">
                <input className={inputCls} type="number" min={5} max={480} step={5}
                  value={form.duracionMin}
                  onChange={e => setForm(f => ({ ...f, duracionMin: e.target.value }))} />
              </Field>
              <Field label="Precio (€, opcional)">
                <input className={inputCls} type="number" min={0} step="0.01"
                  value={form.precio} placeholder="—"
                  onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} />
              </Field>
            </div>
            <Field label="Color identificador">
              <ColorInput value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} />
            </Field>
            <Field label="Descripción (opcional)">
              <input className={inputCls} value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Breve descripción para la socia" />
            </Field>
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className={labelCls}>Auto-reservable</span>
                <p className="text-[11px] text-muted-foreground -mt-0.5">La socia puede reservarlo sola en el portal.</p>
              </div>
              <Toggle on={form.autoReservable} onChange={v => setForm(f => ({ ...f, autoReservable: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <span className={labelCls}>Activo</span>
              <Toggle on={form.activo} onChange={v => setForm(f => ({ ...f, activo: v }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={closeModal}>Cancelar</button>
            <button className={cn(btnPrimary, 'flex-1 justify-center')} onClick={guardar} disabled={!canGuardar}>
              {modal === 'nueva' ? 'Crear servicio' : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        title="¿Eliminar servicio?"
        description="Se eliminará este servicio de cita. Las citas ya reservadas no se ven afectadas."
        onConfirm={handleDelete}
      />
    </div>
  );
}
