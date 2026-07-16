'use client';

import { useState } from 'react';
import { Check, Plus, Pencil, Trash2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import type { CampoPersonalizado } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, cardCls, Field, Toggle, ConfirmDialog } from '@/app/(dashboard)/configuracion/page';

// ─── Campos personalizados de socia ──────────────────────────────────────────

const TIPOS_CAMPO: { id: CampoPersonalizado['tipo']; label: string }[] = [
  { id: 'texto',     label: 'Texto' },
  { id: 'numero',    label: 'Número' },
  { id: 'fecha',     label: 'Fecha' },
  { id: 'booleano',  label: 'Sí / No' },
  { id: 'seleccion', label: 'Lista de opciones' },
];

type CampoForm = { etiqueta: string; tipo: CampoPersonalizado['tipo']; opciones: string; requerido: boolean };
const emptyCampoForm = (): CampoForm => ({ etiqueta: '', tipo: 'texto', opciones: '', requerido: false });

export function TabCamposPersonalizados({ showToast }: { showToast: (m: string) => void }) {
  const { camposPersonalizados, addCampoPersonalizado, updateCampoPersonalizado, deleteCampoPersonalizado } = useStudio();
  const [form, setForm] = useState<CampoForm>(emptyCampoForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const ordenados = [...camposPersonalizados].sort((a, b) => a.orden - b.orden);

  function parseOpciones(s: string): string[] {
    return s.split(',').map(o => o.trim()).filter(Boolean);
  }

  function guardar() {
    const etiqueta = form.etiqueta.trim();
    if (!etiqueta) { showToast('Ponle un nombre al campo'); return; }
    const opciones = form.tipo === 'seleccion' ? parseOpciones(form.opciones) : [];
    if (form.tipo === 'seleccion' && opciones.length === 0) { showToast('Añade al menos una opción'); return; }
    if (editId) {
      updateCampoPersonalizado(editId, { etiqueta, tipo: form.tipo, opciones, requerido: form.requerido });
      showToast('Campo actualizado');
    } else {
      const orden = ordenados.length ? Math.max(...ordenados.map(c => c.orden)) + 1 : 0;
      addCampoPersonalizado({ etiqueta, tipo: form.tipo, opciones, requerido: form.requerido, orden, activo: true });
      showToast('Campo añadido');
    }
    setForm(emptyCampoForm());
    setEditId(null);
  }

  function editar(c: CampoPersonalizado) {
    setEditId(c.id);
    setForm({ etiqueta: c.etiqueta, tipo: c.tipo, opciones: c.opciones.join(', '), requerido: c.requerido });
  }

  function mover(id: string, dir: -1 | 1) {
    const i = ordenados.findIndex(c => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= ordenados.length) return;
    const a = ordenados[i], b = ordenados[j];
    updateCampoPersonalizado(a.id, { orden: b.orden });
    updateCampoPersonalizado(b.id, { orden: a.orden });
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-1">{editId ? 'Editar campo' : 'Nuevo campo'}</h3>
        <p className="text-[12px] text-muted-foreground mb-4">
          Datos propios que quieras recoger de cada socia (lesiones, objetivos, cómo nos conoció…).
          Aparecen al dar de alta una socia y en su ficha.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre del campo">
            <input className={inputCls} placeholder="Ej. Lesiones o limitaciones"
              value={form.etiqueta} onChange={e => setForm(f => ({ ...f, etiqueta: e.target.value }))} />
          </Field>
          <Field label="Tipo">
            <select className={cn(inputCls, 'cursor-pointer')} value={form.tipo}
              onChange={e => setForm(f => ({ ...f, tipo: e.target.value as CampoPersonalizado['tipo'] }))}>
              {TIPOS_CAMPO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          {form.tipo === 'seleccion' && (
            <div className="sm:col-span-2">
              <Field label="Opciones (separadas por comas)">
                <input className={inputCls} placeholder="Instagram, Google, Recomendación, Otro"
                  value={form.opciones} onChange={e => setForm(f => ({ ...f, opciones: e.target.value }))} />
              </Field>
            </div>
          )}
        </div>
        <label className="flex items-center justify-between gap-4 cursor-pointer mt-4">
          <span className="text-[13px] text-foreground">Obligatorio al dar de alta</span>
          <Toggle on={form.requerido} onChange={v => setForm(f => ({ ...f, requerido: v }))} />
        </label>
        <div className="flex gap-2 mt-4">
          <button onClick={guardar} className={btnPrimary}>
            {editId ? <><Check size={14} /> Guardar cambios</> : <><Plus size={14} /> Añadir campo</>}
          </button>
          {editId && (
            <button onClick={() => { setEditId(null); setForm(emptyCampoForm()); }} className={btnSecondary}>Cancelar</button>
          )}
        </div>
      </div>

      <div className={cn(cardCls, 'p-6')}>
        <h3 className="text-[14px] font-semibold text-foreground mb-4">Campos ({ordenados.length})</h3>
        {ordenados.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Aún no has creado ningún campo personalizado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ordenados.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => mover(c.id, -1)} disabled={i === 0}
                    className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▲</button>
                  <button onClick={() => mover(c.id, 1)} disabled={i === ordenados.length - 1}
                    className="text-[11px] leading-none text-muted-foreground hover:text-foreground disabled:opacity-30">▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {c.etiqueta}
                    {c.requerido && <span className="ml-1.5 text-[#DC2626]">*</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {TIPOS_CAMPO.find(t => t.id === c.tipo)?.label}
                    {c.tipo === 'seleccion' && c.opciones.length > 0 && ` · ${c.opciones.join(', ')}`}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer shrink-0" title="Activo">
                  <Toggle on={c.activo} onChange={v => updateCampoPersonalizado(c.id, { activo: v })} />
                </label>
                <button onClick={() => editar(c)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground shrink-0" title="Editar">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setConfirmDel(c.id)} className="p-1.5 rounded-lg hover:bg-muted text-[#DC2626] shrink-0" title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDel !== null}
        onOpenChange={o => { if (!o) setConfirmDel(null); }}
        title="Eliminar campo"
        description="Se quitará de las altas y fichas. Los valores ya guardados en las socias no se muestran, pero no se borran."
        onConfirm={() => {
          if (confirmDel) { deleteCampoPersonalizado(confirmDel); showToast('Campo eliminado'); }
          setConfirmDel(null);
        }}
      />
    </div>
  );
}
