'use client';

import { useCallback, useState } from 'react';
import { ColorInput, ColorSwatch, ConfirmDialog, Field, btnPrimary, btnSecondary, cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import type { Sala } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';

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
  const { salas, addSala, updateSala, deleteSala, bloqueosMaquina, marcarAveria, quitarAveria } = useStudio();

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SalaForm>(emptySalaForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [averiaModal, setAveriaModal] = useState(false);
  const [averiaForm, setAveriaForm] = useState<{ salaId: string; motivo: string; hasta: string }>({ salaId: '', motivo: '', hasta: '' });

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

  // F2 (B2.7): averías activas = sin fecha de arreglo, o con arreglo aún futuro.
  const averiasActivas = bloqueosMaquina.filter(b => !b.hasta || Date.parse(b.hasta) > Date.now());

  const abrirAveria = useCallback(() => {
    setAveriaForm({ salaId: salas[0]?.id ?? '', motivo: '', hasta: '' });
    setAveriaModal(true);
  }, [salas]);

  const guardarAveria = useCallback(() => {
    if (!averiaForm.salaId) return;
    marcarAveria(
      averiaForm.salaId,
      null,
      averiaForm.motivo.trim() || null,
      averiaForm.hasta ? new Date(averiaForm.hasta).toISOString() : null,
    );
    showToast('Avería registrada — baja el aforo de esa sala');
    setAveriaModal(false);
  }, [averiaForm, marcarAveria, showToast]);

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
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
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
                    <button onClick={() => setConfirmDel(sala.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground" aria-label="Eliminar sala">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Averías de máquina (F2 · B2.7) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Averías de máquina</p>
            <p className="text-[12px] text-muted-foreground">Una máquina averiada baja el aforo real de las clases de esa sala mientras dure.</p>
          </div>
          <button className={cn(btnSecondary, 'shrink-0')} onClick={abrirAveria} disabled={salas.length === 0}>
            <Wrench size={13} />
            Marcar avería
          </button>
        </div>
        <div className={cn(cardCls, 'p-0 overflow-hidden')}>
          {averiasActivas.length === 0 ? (
            <div className="px-5 py-6 text-center text-[13px] text-muted-foreground">No hay averías activas.</div>
          ) : (
            <ul className="divide-y divide-background">
              {averiasActivas.map(b => {
                const sala = salas.find(s => s.id === b.salaId);
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-foreground truncate">
                        {sala?.nombre ?? 'Sala'}{b.motivo ? ` — ${b.motivo}` : ''}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        Desde {new Date(b.desde).toLocaleDateString('es-ES')}
                        {b.hasta ? ` · hasta ${new Date(b.hasta).toLocaleDateString('es-ES')}` : ' · sin fecha de arreglo'}
                      </p>
                    </div>
                    <button
                      onClick={() => { quitarAveria(b.id); showToast('Máquina marcada como arreglada'); }}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors shrink-0"
                    >
                      Marcar arreglada
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
            <Field
              label="Nombre de la sala"
              description="Como la llamáis en el estudio. La verá la clienta al reservar."
            >
              <input
                className={inputCls}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Sala Reformer"
              />
            </Field>
            <Field
              label="Capacidad (personas)"
              description="Cuántas caben. Es el tope de reservas de cualquier clase en esta sala."
            >
              <input
                className={inputCls}
                type="number"
                min={1}
                max={200}
                value={form.capacidad}
                onChange={e => setForm(f => ({ ...f, capacidad: e.target.value }))}
              />
            </Field>
            <Field
              label="Color identificador"
              description="Sirve para distinguirla de un vistazo en la agenda."
            >
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

      {/* Modal avería */}
      <Dialog open={averiaModal} onOpenChange={open => !open && setAveriaModal(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">Marcar avería</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field label="Sala" description="La máquina averiada pertenece a esta sala. El aforo de sus clases baja en 1 mientras dure.">
              <select
                className={inputCls}
                value={averiaForm.salaId}
                onChange={e => setAveriaForm(f => ({ ...f, salaId: e.target.value }))}
              >
                {salas.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Field>
            <Field label="Motivo (opcional)" description="Para tu registro interno.">
              <input
                className={inputCls}
                value={averiaForm.motivo}
                onChange={e => setAveriaForm(f => ({ ...f, motivo: e.target.value }))}
                placeholder="Ej: Reformer 3 — muelle roto"
              />
            </Field>
            <Field label="Fecha de arreglo (opcional)" description="Si la sabes, el aforo vuelve solo ese día. Si la dejas vacía, la avería queda abierta hasta que la marques arreglada.">
              <input
                className={inputCls}
                type="date"
                value={averiaForm.hasta}
                onChange={e => setAveriaForm(f => ({ ...f, hasta: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={() => setAveriaModal(false)}>
              Cancelar
            </button>
            <button
              className={cn(btnPrimary, 'flex-1 justify-center')}
              onClick={guardarAveria}
              disabled={!averiaForm.salaId}
            >
              Marcar avería
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
