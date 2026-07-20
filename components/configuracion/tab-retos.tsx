'use client';

import { useState } from 'react';
import { Target, Plus, Pencil, Trash2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { ACHIEVEMENT_METRICS } from '@/lib/engines/achievement-engine';
import { estadoReto } from '@/lib/engines/challenge-engine';
import type { ChallengeDefinition, AchievementMetric } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Field, inputCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

function isoToDateInput(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

const emptyForm = (): Omit<ChallengeDefinition, 'id' | 'studioId' | 'creadoEn'> => {
  const hoy = new Date();
  const enUnaSemana = new Date(hoy.getTime() + 7 * 86400000);
  return {
    metric: 'CLASES_ASISTIDAS', nombre: '', descripcion: '', objetivo: 3, icono: '🎯',
    creditosRecompensa: 0, activo: true,
    fechaInicio: hoy.toISOString(), fechaFin: enUnaSemana.toISOString(),
  };
};

const ESTADO_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVO: { label: 'Activo', bg: 'color-mix(in srgb, var(--info) 12%, var(--card))', text: 'var(--info)' },
  COMPLETADO: { label: 'Completado', bg: 'color-mix(in srgb, var(--success) 12%, var(--card))', text: 'var(--success)' },
  CADUCADO: { label: 'Caducado', bg: 'var(--muted)', text: 'var(--muted-foreground)' },
};

export function TabRetos({ showToast }: { showToast: (m: string) => void }) {
  const { challengeDefinitions, addChallengeDefinition, updateChallengeDefinition, deleteChallengeDefinition } = useStudio();
  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [borrarId, setBorrarId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const now = new Date();

  function openNuevo() { setForm(emptyForm()); setEditId(null); setModal('nuevo'); }
  function openEditar(c: ChallengeDefinition) {
    setForm({
      metric: c.metric, nombre: c.nombre, descripcion: c.descripcion ?? '', objetivo: c.objetivo, icono: c.icono,
      creditosRecompensa: c.creditosRecompensa, activo: c.activo, fechaInicio: c.fechaInicio, fechaFin: c.fechaFin,
    });
    setEditId(c.id);
    setModal('editar');
  }
  function guardar() {
    if (!form.nombre.trim() || form.objetivo <= 0) return;
    if (new Date(form.fechaFin) <= new Date(form.fechaInicio)) return;
    if (modal === 'nuevo') addChallengeDefinition(form);
    else if (editId) updateChallengeDefinition(editId, form);
    setModal(null);
    showToast(modal === 'nuevo' ? 'Reto creado' : 'Reto actualizado');
  }
  function confirmarBorrar() {
    if (!borrarId) return;
    deleteChallengeDefinition(borrarId);
    setBorrarId(null);
    showToast('Reto eliminado');
  }

  const metricLabel = (m: AchievementMetric) => ACHIEVEMENT_METRICS.find(x => x.metric === m)?.nombre ?? m;
  const ordenados = [...challengeDefinitions].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-brand-secondary" />
          <h3 className="text-[14px] font-semibold text-foreground">Retos</h3>
        </div>
        <button onClick={openNuevo} className={btnPrimary}>
          <Plus size={14} /> Nuevo reto
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        A diferencia de un logro, un reto tiene fecha de inicio y fin — solo cuenta lo que pasa dentro de ese periodo.
      </p>

      {ordenados.length === 0 ? (
        <div className={cn(cardCls, 'p-8 text-center')}>
          <p className="text-[13px] text-muted-foreground">Aún no hay retos configurados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ordenados.map(c => {
            const est = estadoReto(c, false, now);
            const badge = ESTADO_LABEL[est];
            return (
              <div key={c.id} className={cn(cardCls, 'p-4 flex items-start gap-3')}>
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-[18px] shrink-0">
                  {c.icono}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-foreground">{c.nombre}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: badge.bg, color: badge.text }}>
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground">{metricLabel(c.metric)} · objetivo {c.objetivo}{c.creditosRecompensa > 0 ? ` · +${c.creditosRecompensa} créditos` : ''}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(c.fechaInicio).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — {new Date(c.fechaFin).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </p>
                  {!c.activo && <span className="text-[10px] font-bold uppercase text-muted-foreground">Inactivo</span>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => openEditar(c)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setBorrarId(c.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#FFF2F2] text-[#C4695A]">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nuevo reto' : 'Editar reto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <Field label="Icono"
                  description="Un emoji. Es la cara del reto en la app de la clienta."
                >
                  <input className={inputCls} value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} maxLength={4} />
                </Field>
              </div>
              <div>
                <Field label="Nombre"
                  description="Corto y motivador. Ej: «Enero a tope» o «5 clases en 15 días»."
                >
                  <input className={inputCls} value={form.nombre} placeholder="Ej. Reto de verano" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
                </Field>
              </div>
            </div>
            <div>
              <Field label="Descripción"
                description="En qué consiste. Aparece bajo el nombre cuando se apunta."
              >
                <input className={inputCls} value={form.descripcion ?? ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </Field>
            </div>
            <div>
              <Field label="Métrica"
                description="Qué se cuenta para avanzar en el reto. Se calcula solo con la actividad que ya registra la app."
              >
                <select className={inputCls} value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value as AchievementMetric }))}>
                  {ACHIEVEMENT_METRICS.map(m => (
                    <option key={m.metric} value={m.metric}>{m.nombre}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label="Objetivo"
                  description="Cifra que hay que alcanzar antes de que termine el reto para completarlo."
                >
                  <input type="number" min={1} className={inputCls} value={form.objetivo} onChange={e => setForm(f => ({ ...f, objetivo: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
                </Field>
              </div>
              <div>
                <Field label="Créditos de regalo"
                  description="Créditos que gana quien lo complete. 0 = solo el reconocimiento."
                >
                  <input type="number" min={0} className={inputCls} value={form.creditosRecompensa} onChange={e => setForm(f => ({ ...f, creditosRecompensa: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Field label="Empieza"
                  description="Desde esta fecha empieza a contar el progreso. Lo anterior no cuenta."
                >
                  <input
                    type="date" className={inputCls} value={isoToDateInput(form.fechaInicio)}
                    onChange={e => setForm(f => ({ ...f, fechaInicio: new Date(e.target.value).toISOString() }))}
                  />
                </Field>
              </div>
              <div>
                <Field label="Termina"
                  description="Último día para llegar al objetivo. Después, el reto se cierra."
                >
                  <input
                    type="date" className={inputCls} value={isoToDateInput(form.fechaFin)}
                    onChange={e => setForm(f => ({ ...f, fechaFin: new Date(e.target.value + 'T23:59:59').toISOString() }))}
                  />
                </Field>
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

      <Dialog open={borrarId !== null} onOpenChange={open => !open && setBorrarId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar reto</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">¿Seguro que quieres eliminar este reto? El progreso de las clientas en él se perderá.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setBorrarId(null)} className={btnSecondary}>Cancelar</button>
            <button onClick={confirmarBorrar} className="px-4 py-2 rounded-xl bg-[#C4695A] text-white text-[13px] font-semibold hover:bg-[#B25B4D]">Eliminar</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
