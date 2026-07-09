'use client';

import { useState } from 'react';
import { Trophy, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { ACHIEVEMENT_METRICS } from '@/lib/achievement-engine';
import type { AchievementDefinition, AchievementMetric } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Punto de partida opcional (botón "Cargar logros sugeridos") — no se
// insertan solos, el estudio decide si los quiere y puede editarlos después.
const LOGROS_SUGERIDOS: Omit<AchievementDefinition, 'id' | 'studioId' | 'creadoEn'>[] = [
  { metric: 'RESERVAS_TOTALES', nombre: 'Primera reserva', descripcion: 'Tu primera clase reservada.', umbral: 1, icono: '🌱', creditosRecompensa: 20, activo: true },
  { metric: 'CLASES_ASISTIDAS', nombre: 'Primera clase', descripcion: 'Has asistido a tu primera clase.', umbral: 1, icono: '🎯', creditosRecompensa: 15, activo: true },
  { metric: 'CLASES_ASISTIDAS', nombre: '5 clases', descripcion: 'Has asistido a 5 clases.', umbral: 5, icono: '⭐', creditosRecompensa: 25, activo: true },
  { metric: 'CLASES_ASISTIDAS', nombre: '10 clases', descripcion: 'Has asistido a 10 clases.', umbral: 10, icono: '🥉', creditosRecompensa: 40, activo: true },
  { metric: 'CLASES_ASISTIDAS', nombre: '25 clases', descripcion: 'Has asistido a 25 clases.', umbral: 25, icono: '🥈', creditosRecompensa: 75, activo: true },
  { metric: 'CLASES_ASISTIDAS', nombre: '50 clases', descripcion: 'Has asistido a 50 clases.', umbral: 50, icono: '🥇', creditosRecompensa: 150, activo: true },
  { metric: 'CLASES_ASISTIDAS', nombre: '100 clases', descripcion: 'Has asistido a 100 clases.', umbral: 100, icono: '💎', creditosRecompensa: 300, activo: true },
  { metric: 'SEMANAS_CONSECUTIVAS', nombre: 'Entrenar 4 semanas', descripcion: '4 semanas seguidas entrenando.', umbral: 4, icono: '🔥', creditosRecompensa: 60, activo: true },
  { metric: 'SEMANAS_CONSECUTIVAS', nombre: 'Entrenar 10 semanas', descripcion: '10 semanas seguidas entrenando.', umbral: 10, icono: '🏆', creditosRecompensa: 150, activo: true },
  { metric: 'RESERVAS_TOTALES', nombre: '100 reservas', descripcion: 'Has hecho 100 reservas en total.', umbral: 100, icono: '🎖️', creditosRecompensa: 200, activo: true },
  { metric: 'ASISTENCIA_MENSUAL_COMPLETA', nombre: '100% asistencia mensual', descripcion: 'Ni una sola falta este mes.', umbral: 1, icono: '✅', creditosRecompensa: 50, activo: true },
  { metric: 'ASISTENCIA_CUMPLEANOS', nombre: 'Feliz cumpleaños', descripcion: 'Has entrenado el día de tu cumpleaños.', umbral: 1, icono: '🎂', creditosRecompensa: 100, activo: true },
];

const emptyForm = (): Omit<AchievementDefinition, 'id' | 'studioId' | 'creadoEn'> => ({
  metric: 'CLASES_ASISTIDAS', nombre: '', descripcion: '', umbral: 5, icono: '🏆', creditosRecompensa: 0, activo: true,
});

export function TabLogros({ showToast }: { showToast: (m: string) => void }) {
  const { achievementDefinitions, addAchievementDefinition, updateAchievementDefinition } = useStudio();
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  function openNuevo() { setForm(emptyForm()); setEditId(null); setModal('nuevo'); }
  function openEditar(a: AchievementDefinition) {
    setForm({ metric: a.metric, nombre: a.nombre, descripcion: a.descripcion ?? '', umbral: a.umbral, icono: a.icono, creditosRecompensa: a.creditosRecompensa, activo: a.activo });
    setEditId(a.id);
    setModal('editar');
  }
  function guardar() {
    if (!form.nombre.trim() || form.umbral <= 0) return;
    if (modal === 'nuevo') addAchievementDefinition(form);
    else if (editId) updateAchievementDefinition(editId, form);
    setModal(null);
    showToast(modal === 'nuevo' ? 'Logro creado' : 'Logro actualizado');
  }
  function cargarSugeridos() {
    const existentes = new Set(achievementDefinitions.map(a => a.nombre));
    const nuevos = LOGROS_SUGERIDOS.filter(l => !existentes.has(l.nombre));
    nuevos.forEach(addAchievementDefinition);
    showToast(nuevos.length > 0 ? `${nuevos.length} logros añadidos` : 'Ya tienes todos los logros sugeridos');
  }

  const metricLabel = (m: AchievementMetric) => ACHIEVEMENT_METRICS.find(x => x.metric === m)?.nombre ?? m;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-brand-secondary" />
          <h3 className="text-[14px] font-semibold text-foreground">Logros</h3>
        </div>
        <div className="flex gap-2">
          <button onClick={cargarSugeridos} className={btnSecondary}>
            <Sparkles size={14} className="inline mr-1" />Cargar sugeridos
          </button>
          <button onClick={openNuevo} className={btnPrimary}>
            <Plus size={14} /> Nuevo logro
          </button>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">
        El umbral de cada logro lo defines tú (5 clases, 10 clases, lo que sea) — nunca está fijo en el código.
      </p>

      {achievementDefinitions.length === 0 ? (
        <div className={cn(cardCls, 'p-8 text-center')}>
          <p className="text-[13px] text-muted-foreground">Aún no hay logros configurados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {achievementDefinitions.map(a => (
            <div key={a.id} className={cn(cardCls, 'p-4 flex items-start gap-3')}>
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-[18px] shrink-0">
                {a.icono}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{a.nombre}</p>
                <p className="text-[12px] text-muted-foreground">{metricLabel(a.metric)} · umbral {a.umbral}{a.creditosRecompensa > 0 ? ` · +${a.creditosRecompensa} créditos` : ''}</p>
                {!a.activo && <span className="text-[10px] font-bold uppercase text-muted-foreground">Inactivo</span>}
              </div>
              <button onClick={() => openEditar(a)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground shrink-0">
                <Pencil size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nuevo logro' : 'Editar logro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <label className={labelCls}>Icono</label>
                <input className={inputCls} value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} maxLength={4} />
              </div>
              <div>
                <label className={labelCls}>Nombre</label>
                <input className={inputCls} value={form.nombre} placeholder="Ej. 10 clases" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
              </div>
            </div>
            <div>
              <label className={labelCls}>Descripción</label>
              <input className={inputCls} value={form.descripcion ?? ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Métrica</label>
              <select className={inputCls} value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value as AchievementMetric }))}>
                {ACHIEVEMENT_METRICS.map(m => (
                  <option key={m.metric} value={m.metric}>{m.nombre}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Umbral</label>
                <input type="number" min={1} className={inputCls} value={form.umbral} onChange={e => setForm(f => ({ ...f, umbral: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
              </div>
              <div>
                <label className={labelCls}>Créditos de regalo</label>
                <input type="number" min={0} className={inputCls} value={form.creditosRecompensa} onChange={e => setForm(f => ({ ...f, creditosRecompensa: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-[13px] text-foreground">
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
    </div>
  );
}
