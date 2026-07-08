'use client';

import { useState } from 'react';
import { Coins, Gift, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { REWARD_TRIGGERS } from '@/lib/reward-engine';
import type { RewardCatalogItem } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Valores de partida sugeridos — un punto de arranque, no un límite: el
// estudio los edita libremente en cuanto carga esta pantalla.
const CREDITOS_SUGERIDOS: Record<string, number> = {
  ASISTENCIA_CLASE: 10,
  RENOVACION_PLAN: 40,
  REFERIDO_AMIGO: 100,
  SEMANA_COMPLETA: 30,
  PRIMERA_RESERVA: 20,
  OBJETIVO_MENSUAL: 50,
};

const emptyCatalogForm = (): Omit<RewardCatalogItem, 'id' | 'studioId' | 'creadoEn'> => ({
  nombre: '', descripcion: '', costeCreditos: 500, icono: '🎁', activo: true, stock: null,
});

export function TabRecompensas({ showToast }: { showToast: (m: string) => void }) {
  const {
    rewardRules, addRewardRule, updateRewardRule,
    rewardCatalog, addRewardCatalogItem, updateRewardCatalogItem, deleteRewardCatalogItem,
  } = useStudio();

  const [modal, setModal] = useState<'nuevo' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCatalogForm());
  const [confirmDel, setConfirmDel] = useState<RewardCatalogItem | null>(null);

  function reglaDe(trigger: string) {
    return rewardRules.find(r => r.trigger === trigger) ?? null;
  }

  function handleCreditosChange(trigger: string, nombre: string, descripcion: string, creditos: number) {
    const existente = reglaDe(trigger);
    if (existente) {
      updateRewardRule(existente.id, { creditos });
    } else {
      addRewardRule({ trigger: trigger as never, nombre, descripcion, creditos, activa: true });
    }
  }

  function handleToggleActiva(trigger: string, nombre: string, descripcion: string) {
    const existente = reglaDe(trigger);
    if (existente) {
      updateRewardRule(existente.id, { activa: !existente.activa });
    } else {
      addRewardRule({ trigger: trigger as never, nombre, descripcion, creditos: CREDITOS_SUGERIDOS[trigger] ?? 0, activa: true });
    }
  }

  // Tope mensual de referidos premiados (solo REFERIDO_AMIGO). Vacío o 0 = sin tope.
  function handleTopeChange(trigger: string, nombre: string, descripcion: string, topeMensual: number | null) {
    const existente = reglaDe(trigger);
    if (existente) {
      updateRewardRule(existente.id, { topeMensual });
    } else {
      addRewardRule({ trigger: trigger as never, nombre, descripcion, creditos: CREDITOS_SUGERIDOS[trigger] ?? 0, activa: true, topeMensual });
    }
  }

  function openNuevo() { setForm(emptyCatalogForm()); setEditId(null); setModal('nuevo'); }
  function openEditar(item: RewardCatalogItem) {
    setForm({ nombre: item.nombre, descripcion: item.descripcion ?? '', costeCreditos: item.costeCreditos, icono: item.icono, activo: item.activo, stock: item.stock });
    setEditId(item.id);
    setModal('editar');
  }
  function guardar() {
    if (!form.nombre.trim() || form.costeCreditos <= 0) return;
    if (modal === 'nuevo') addRewardCatalogItem(form);
    else if (editId) updateRewardCatalogItem(editId, form);
    setModal(null);
    showToast(modal === 'nuevo' ? 'Recompensa creada' : 'Recompensa actualizada');
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Reglas de créditos */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Coins size={16} className="text-brand-secondary" />
          <h3 className="text-[14px] font-semibold text-foreground">Créditos por acción</h3>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Cuántos créditos gana una socia por cada acción. Cambia cualquier valor o desactívalo — nunca están fijos en el código.
        </p>
        <div className={cn(cardCls, 'divide-y divide-[#F1F1F4]')}>
          {REWARD_TRIGGERS.map(def => {
            const regla = reglaDe(def.trigger);
            const creditos = regla?.creditos ?? CREDITOS_SUGERIDOS[def.trigger] ?? 0;
            const activa = regla?.activa ?? true;
            return (
              <div key={def.trigger} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{def.nombre}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{def.descripcion}</p>
                </div>
                {def.trigger === 'REFERIDO_AMIGO' && (
                  <div className="flex flex-col items-center shrink-0">
                    <input
                      type="number"
                      min={0}
                      placeholder="∞"
                      value={regla?.topeMensual ?? ''}
                      onChange={e => {
                        const n = parseInt(e.target.value, 10);
                        handleTopeChange(def.trigger, def.nombre, def.descripcion, Number.isFinite(n) && n > 0 ? n : null);
                      }}
                      className={cn(inputCls, 'w-16 text-center')}
                      title="Máximo de referidos premiados al mes (vacío = sin tope)"
                    />
                    <span className="text-[9px] text-[#A8A89F] mt-0.5">tope/mes</span>
                  </div>
                )}
                <input
                  type="number"
                  min={0}
                  value={creditos}
                  onChange={e => handleCreditosChange(def.trigger, def.nombre, def.descripcion, Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className={cn(inputCls, 'w-20 text-center shrink-0')}
                />
                <button
                  type="button"
                  onClick={() => handleToggleActiva(def.trigger, def.nombre, def.descripcion)}
                  className="w-11 h-6 rounded-full transition-colors relative shrink-0"
                  style={{ backgroundColor: activa ? 'var(--foreground)' : 'var(--border)' }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-card transition-transform"
                    style={{ transform: activa ? 'translateX(22px)' : 'translateX(2px)' }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Catálogo de recompensas */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-brand-secondary" />
            <h3 className="text-[14px] font-semibold text-foreground">Catálogo de recompensas</h3>
          </div>
          <button onClick={openNuevo} className={btnPrimary}>
            <Plus size={14} /> Nueva recompensa
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">Lo que las socias pueden canjear con sus créditos.</p>

        {rewardCatalog.length === 0 ? (
          <div className={cn(cardCls, 'p-8 text-center')}>
            <p className="text-[13px] text-muted-foreground">Aún no hay recompensas en el catálogo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rewardCatalog.map(item => (
              <div key={item.id} className={cn(cardCls, 'p-4 flex items-start gap-3')}>
                <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-[18px] shrink-0">
                  {item.icono}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{item.nombre}</p>
                  <p className="text-[12px] text-muted-foreground">{item.costeCreditos} créditos{item.stock != null ? ` · ${item.stock} en stock` : ''}</p>
                  {!item.activo && <span className="text-[10px] font-bold uppercase text-muted-foreground">Inactiva</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEditar(item)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setConfirmDel(item)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <Dialog open={modal !== null} onOpenChange={open => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === 'nuevo' ? 'Nueva recompensa' : 'Editar recompensa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <label className={labelCls}>Icono</label>
                <input className={inputCls} value={form.icono} onChange={e => setForm(f => ({ ...f, icono: e.target.value }))} maxLength={4} />
              </div>
              <div>
                <label className={labelCls}>Nombre</label>
                <input className={inputCls} value={form.nombre} placeholder="Ej. Clase gratis" onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
              </div>
            </div>
            <div>
              <label className={labelCls}>Descripción</label>
              <input className={inputCls} value={form.descripcion ?? ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Coste en créditos</label>
                <input type="number" min={1} className={inputCls} value={form.costeCreditos} onChange={e => setForm(f => ({ ...f, costeCreditos: Math.max(1, parseInt(e.target.value, 10) || 1) }))} />
              </div>
              <div>
                <label className={labelCls}>Stock (vacío = ilimitado)</label>
                <input
                  type="number" min={0} className={inputCls}
                  value={form.stock ?? ''}
                  onChange={e => setForm(f => ({ ...f, stock: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                Activa
              </label>
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} className={btnSecondary}>Cancelar</button>
                <button onClick={guardar} className={btnPrimary}>
                  <Check size={14} /> Guardar
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar borrado */}
      <Dialog open={confirmDel !== null} onOpenChange={open => !open && setConfirmDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar recompensa</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            ¿Eliminar <strong className="text-foreground">{confirmDel?.nombre}</strong> del catálogo? Las socias ya no podrán canjearla.
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setConfirmDel(null)} className={btnSecondary}>Cancelar</button>
            <button
              onClick={() => { if (confirmDel) deleteRewardCatalogItem(confirmDel.id); setConfirmDel(null); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-[13px] font-medium hover:bg-red-600"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

