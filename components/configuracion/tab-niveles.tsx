'use client';

import { useState } from 'react';
import { Medal, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { LevelDefinition } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Punto de partida opcional — el estudio decide si le sirve esta progresión
// o prefiere otros nombres/umbrales/colores. Nunca se inserta solo.
const NIVELES_SUGERIDOS: Omit<LevelDefinition, 'id' | 'studioId' | 'creadoEn'>[] = [
  { nombre: 'Bronce', orden: 0, umbralCreditos: 0, color: '#B08D57', icono: '🥉', beneficios: null, activo: true },
  { nombre: 'Plata', orden: 1, umbralCreditos: 200, color: '#9CA3AF', icono: '🥈', beneficios: null, activo: true },
  { nombre: 'Oro', orden: 2, umbralCreditos: 500, color: '#D4AF37', icono: '🥇', beneficios: null, activo: true },
  { nombre: 'Platino', orden: 3, umbralCreditos: 1000, color: '#7C8FA6', icono: '🏆', beneficios: null, activo: true },
  { nombre: 'Diamante', orden: 4, umbralCreditos: 2000, color: '#5FA8D3', icono: '💎', beneficios: null, activo: true },
];

const emptyForm = (siguienteOrden: number): Omit<LevelDefinition, 'id' | 'studioId' | 'creadoEn'> => ({
  nombre: '', orden: siguienteOrden, umbralCreditos: 0, color: '#B08D57', icono: '🏅', beneficios: '', activo: true,
});

export function TabNiveles({ showToast }: { showToast: (m: string) => void }) {
  const { levelDefinitions, addLevelDefinition, updateLevelDefinition, deleteLevelDefinition } = useStudio();
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [borrarId, setBorrarId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm(0));

  const ordenados = [...levelDefinitions].sort((a, b) => a.orden - b.orden);

  function openNuevo() { setForm(emptyForm(ordenados.length)); setEditId(null); setModal('nuevo'); }
  function openEditar(l: LevelDefinition) {
    setForm({ nombre: l.nombre, orden: l.orden, umbralCreditos: l.umbralCreditos, color: l.color, icono: l.icono, beneficios: l.beneficios ?? '', activo: l.activo });
    setEditId(l.id);
    setModal('editar');
  }
  function guardar() {
    if (!form.nombre.trim() || form.umbralCreditos < 0) return;
    if (modal === 'nuevo') addLevelDefinition(form);
    else if (editId) updateLevelDefinition(editId, form);
    setModal(null);
    showToast(modal === 'nuevo' ? 'Nivel creado' : 'Nivel actualizado');
  }
  function cargarSugeridos() {
    const existentes = new Set(levelDefinitions.map(l => l.nombre));
    const nuevos = NIVELES_SUGERIDOS.filter(l => !existentes.has(l.nombre));
    nuevos.forEach(addLevelDefinition);
    showToast(nuevos.length > 0 ? `${nuevos.length} niveles añadidos` : 'Ya tienes todos los niveles sugeridos');
  }
  function confirmarBorrar() {
    if (!borrarId) return;
    deleteLevelDefinition(borrarId);
    setBorrarId(null);
    showToast('Nivel eliminado');
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Medal size={16} className="text-[#B57A8E]" />
          <h3 className="text-[14px] font-semibold text-[#1A1A1A]">Niveles</h3>
        </div>
        <div className="flex gap-2">
          <button onClick={cargarSugeridos} className={btnSecondary}>
            <Sparkles size={14} className="inline mr-1" />Cargar sugeridos
          </button>
          <button onClick={openNuevo} className={btnPrimary}>
            <Plus size={14} /> Nuevo nivel
          </button>
        </div>
      </div>
      <p className="text-[12px] text-[#8E8E86]">
        El nivel se calcula sobre el total histórico de créditos ganados por la socia, no sobre su saldo — canjear recompensas nunca le hace bajar de nivel.
      </p>

      {ordenados.length === 0 ? (
        <div className={cn(cardCls, 'p-8 text-center')}>
          <p className="text-[13px] text-[#8E8E86]">Aún no hay niveles configurados.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordenados.map(l => (
            <div key={l.id} className={cn(cardCls, 'p-4 flex items-center gap-3')}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0"
                style={{ backgroundColor: `${l.color}22` }}
              >
                {l.icono}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#1A1A1A]">{l.nombre}</p>
                <p className="text-[12px] text-[#8E8E86]">Desde {l.umbralCreditos} créditos ganados</p>
                {!l.activo && <span className="text-[10px] font-bold uppercase text-[#A8A89F]">Inactivo</span>}
              </div>
              <button onClick={() => openEditar(l)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F1F1EC] text-[#8E8E86] shrink-0">
                <Pencil size={13} />
              </button>
              <button onClick={() => setBorrarId(l.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#FFF2F2] text-[#C4695A] shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nuevo nivel' : 'Editar nivel'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <label className={labelCls}>Icono</label>
                <input className={inputCls} value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} maxLength={4} />
              </div>
              <div>
                <label className={labelCls}>Nombre</label>
                <input className={inputCls} value={form.nombre} placeholder="Ej. Plata" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Orden</label>
                <input type="number" min={0} className={inputCls} value={form.orden} onChange={e => setForm(f => ({ ...f, orden: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
              </div>
              <div>
                <label className={labelCls}>Créditos necesarios</label>
                <input type="number" min={0} className={inputCls} value={form.umbralCreditos} onChange={e => setForm(f => ({ ...f, umbralCreditos: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Color</label>
              <input type="color" className="h-9 w-16 rounded-lg border border-[#EDEDE6] cursor-pointer" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Beneficios (opcional)</label>
              <input className={inputCls} value={form.beneficios ?? ''} placeholder="Ej. 10% dto. en recompensas" onChange={e => setForm(f => ({ ...f, beneficios: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-[13px] text-[#3A3A34]">
                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                Activo
              </label>
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} className={btnSecondary}>Cancelar</button>
                <button onClick={guardar} className={btnPrimary}>Guardar</button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={borrarId !== null} onOpenChange={open => !open && setBorrarId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar nivel</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-[#5A5A52]">¿Seguro que quieres eliminar este nivel? Las socias que lo tengan alcanzado pasarán a mostrarse en el nivel inmediatamente inferior.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setBorrarId(null)} className={btnSecondary}>Cancelar</button>
            <button onClick={confirmarBorrar} className="px-4 py-2 rounded-xl bg-[#C4695A] text-white text-[13px] font-semibold hover:bg-[#B25B4D]">Eliminar</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
