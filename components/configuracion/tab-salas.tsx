'use client';

import { useCallback, useState } from 'react';
import { ColorInput, ColorSwatch, ConfirmDialog, Field, btnPrimary, btnSecondary, cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStudio } from '@/lib/studio-context';
import type { Sala } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertTriangle, Pencil, Plus, Trash2, Wrench } from 'lucide-react';

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
  const { salas, sesiones, addSala, updateSala, deleteSala, bloqueosMaquina, marcarAveria, quitarAveria } = useStudio();

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SalaForm>(emptySalaForm());
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // Sala que la dueña intentó borrar pero tiene clases: no se puede borrar hasta
  // reasignarlas o eliminarlas (FK `sesiones.sala_id`, NO ACTION). Se lo decimos
  // antes de mostrar el diálogo destructivo, no después de que falle en la BD.
  const [bloqueada, setBloqueada] = useState<{ nombre: string; n: number } | null>(null);
  // Guardar deja de ser instantáneo: esperamos a la base de datos antes de
  // cerrar el modal. Si falla, el modal sigue abierto con lo que había escrito
  // y el motivo real — nada de dar por buena una sala que no se ha guardado.
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [averiaModal, setAveriaModal] = useState(false);
  const [averiaForm, setAveriaForm] = useState<{ salaId: string; motivo: string; hasta: string }>({ salaId: '', motivo: '', hasta: '' });

  const openNueva = useCallback(() => {
    setForm(emptySalaForm());
    setEditId(null);
    setErrorGuardar(null);
    setModal('nueva');
  }, []);

  const openEditar = useCallback((s: Sala) => {
    setForm(salaToForm(s));
    setEditId(s.id);
    setErrorGuardar(null);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => { setModal(null); setErrorGuardar(null); }, []);

  const guardar = useCallback(async () => {
    const fields = {
      nombre: form.nombre.trim(),
      capacidad: parseInt(form.capacidad, 10) || 1,
      color: form.color,
    };
    setGuardando(true);
    setErrorGuardar(null);
    const res = modal === 'nueva'
      ? await addSala(fields)
      : editId ? await updateSala(editId, fields) : { ok: true as const };
    setGuardando(false);
    if (!res.ok) { setErrorGuardar(res.error); return; }
    showToast(modal === 'nueva' ? `"${fields.nombre}" ya está guardada` : 'Sala actualizada');
    setModal(null);
  }, [modal, editId, form, addSala, updateSala, showToast]);

  // Nº de clases que usan la sala. Cuenta TODAS las sesiones que la referencian
  // (también canceladas o pasadas: la fila sigue en la tabla y la FK igual la
  // bloquea), para que el aviso coincida con lo que hará la base de datos.
  const clasesDeSala = useCallback(
    (id: string) => sesiones.filter(s => s.salaId === id).length,
    [sesiones],
  );

  // Puerta previa al borrado: si la sala tiene clases, avisamos y no seguimos.
  const intentarBorrar = useCallback((sala: Sala) => {
    const n = clasesDeSala(sala.id);
    if (n > 0) { setBloqueada({ nombre: sala.nombre, n }); return; }
    setConfirmDel(sala.id);
  }, [clasesDeSala]);

  const handleDelete = useCallback(async () => {
    if (!confirmDel) return;
    const res = await deleteSala(confirmDel);
    showToast(res.ok ? 'Sala eliminada' : res.error);
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
        <p className="text-[13px] text-muted-foreground">
          {salas.length === 1 ? '1 sala configurada' : `${salas.length} salas configuradas`}
        </p>
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
                          onClick={() => intentarBorrar(sala)}
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
                    <button onClick={() => intentarBorrar(sala)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground" aria-label="Eliminar sala">
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
          {errorGuardar && (
            <p role="alert" className="mt-3 text-[13px] text-destructive">
              No se ha guardado. {errorGuardar}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={closeModal} disabled={guardando}>
              Cancelar
            </button>
            <button
              className={cn(btnPrimary, 'flex-1 justify-center')}
              onClick={guardar}
              disabled={!canGuardar || guardando}
            >
              {guardando ? 'Guardando…' : modal === 'nueva' ? 'Crear sala' : 'Guardar cambios'}
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
        description="Se eliminará esta sala de forma permanente. Esta acción no se puede deshacer."
        onConfirm={handleDelete}
      />

      {/* Sala con clases: no se puede borrar (FK sesiones.sala_id). En vez del
          diálogo destructivo, explicamos qué hacer. */}
      <Dialog open={!!bloqueada} onOpenChange={open => !open && setBloqueada(null)}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground mb-1">No se puede borrar la sala</h3>
              <p className="text-[13px] text-muted-foreground">
                {bloqueada?.n === 1 ? 'Hay 1 clase asociada' : `Hay ${bloqueada?.n} clases asociadas`} a «{bloqueada?.nombre}».
                Reasígnalas a otra sala o elimínalas primero; después podrás borrar la sala.
              </p>
            </div>
            <button
              className={cn(btnPrimary, 'w-full justify-center')}
              onClick={() => setBloqueada(null)}
            >
              Entendido
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: INTEGRACIONES
// ─────────────────────────────────────────────────────────────────────────────
