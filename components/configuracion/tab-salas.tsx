'use client';

import { useCallback, useState } from 'react';
import { ColorInput, ColorSwatch, ConfirmDialog, Field, btnPrimary, btnSecondary, cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import type { Sala } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Pencil, Plus, Trash2 } from 'lucide-react';

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

export function TabSalas({ showToast }: { showToast: (m: string) => void }) {
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
