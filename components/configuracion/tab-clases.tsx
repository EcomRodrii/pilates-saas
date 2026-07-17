'use client';

import { useCallback, useRef, useState } from 'react';
import { ColorInput, ColorSwatch, ConfirmDialog, Field, NivelBadge, btnPrimary, btnSecondary, cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { eliminarFotoClase, subirFotoClase } from '@/lib/portal-storage';
import { useStudio } from '@/lib/studio-context';
import type { TipoClase } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Pencil, Plus, Trash2 } from 'lucide-react';

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

export function TabClases({ showToast }: { showToast: (m: string) => void }) {
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
