'use client';

import { useEffect, useId, useState } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import { cn, uid } from '@/lib/utils';
import {
  dbListCadenaTiposClase, dbInsertCadenaTipoClase, dbUpdateCadenaTipoClase, dbDeleteCadenaTipoClase,
} from '@/lib/supabase-data';
import type { CadenaTipoClase } from '@/lib/types';
import {
  inputCls, labelCls, btnPrimary, btnSecondary, ColorInput, ColorSwatch, NivelBadge,
} from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// «Catálogo de la cadena», en Mis clases y citas. Vivía dentro de la tarjeta de
// Sedes (Mi estudio): es un catálogo de tipos de clase y se busca junto a ellos.
// El botón «Aplicar catálogo» de cada sede sigue en Sedes, que es donde se ve la
// sede a la que se aplica.

const NIVELES: CadenaTipoClase['nivel'][] = ['TODOS', 'PRINCIPIANTE', 'MEDIO', 'AVANZADO'];
const formVacio = { nombre: '', color: '#4F46E5', duracionMinutos: '60', nivel: 'TODOS' as CadenaTipoClase['nivel'] };

// Plantilla de catálogo compartida por toda la cadena — primera pieza de
// "configuración centralizada" (ver .claude/tentare-os.md). Se COPIA a cada
// sede (al crearla, o con el botón "Aplicar catálogo" de Sedes), nunca es un
// vínculo vivo: editar o borrar algo aquí no toca los tipos de clase que ya
// tenga una sede.
export function TabCatalogoCadena({ cadenaId, showToast }: { cadenaId: string; showToast: (m: string) => void }) {
  const [items, setItems] = useState<CadenaTipoClase[]>([]);
  const idCat = useId();
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(formVacio);
  const [editId, setEditId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    dbListCadenaTiposClase(cadenaId).then(r => { if (vivo) { setItems(r); setCargando(false); } });
    return () => { vivo = false; };
  }, [cadenaId]);

  function abrirEditar(t: CadenaTipoClase) {
    setEditId(t.id);
    setForm({ nombre: t.nombre, color: t.color, duracionMinutos: String(t.duracionMinutos), nivel: t.nivel });
  }
  function cancelar() {
    setEditId(null);
    setForm(formVacio);
  }

  async function guardar() {
    if (!form.nombre.trim()) { showToast('Ponle un nombre'); return; }
    setGuardando(true);
    try {
      const cambios = {
        nombre: form.nombre.trim(), color: form.color,
        duracionMinutos: Number(form.duracionMinutos) || 60,
        nivel: form.nivel, descripcion: null, fotoUrl: null,
      };
      if (editId) {
        const res = await dbUpdateCadenaTipoClase(editId, cambios);
        if (!res.ok) { showToast(res.error); return; }
        setItems(prev => prev.map(t => t.id === editId ? { ...t, ...cambios } : t));
      } else {
        const nuevo: CadenaTipoClase = { id: `ctc-${uid()}`, cadenaId, creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(), ...cambios };
        const res = await dbInsertCadenaTipoClase(nuevo);
        if (!res.ok) { showToast(res.error); return; }
        setItems(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
      cancelar();
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    const res = await dbDeleteCadenaTipoClase(id);
    if (!res.ok) { showToast(res.error); return; }
    setItems(prev => prev.filter(t => t.id !== id));
    if (editId === id) cancelar();
  }

  return (
    <TarjetaAjuste id="catalogo-de-la-cadena">
      <p className="text-[12px] text-muted-foreground mb-4">
        Editar aquí no cambia nada en las sedes que ya tienen esos tipos de clase.
      </p>

      {cargando ? (
        <p className="text-[12px] text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground mb-4">Todavía no hay ningún tipo de clase en la plantilla.</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {items.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border">
              <ColorSwatch color={t.color} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{t.nombre}</p>
                <p className="text-xs text-muted-foreground">{t.duracionMinutos} min</p>
              </div>
              <NivelBadge nivel={t.nivel} />
              <button onClick={() => abrirEditar(t)} aria-label={`Editar ${t.nombre}`} className="p-1.5 rounded-lg text-muted-foreground hover:bg-background hover:text-foreground transition-colors">
                <Pencil size={14} />
              </button>
              <button onClick={() => borrar(t.id)} aria-label={`Quitar ${t.nombre} de la plantilla`} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 @md/config:grid-cols-4 gap-3 items-end">
        <div className="@md/config:col-span-2">
          <label htmlFor={`${idCat}-nombre`} className={labelCls}>Nombre</label>
          <input id={`${idCat}-nombre`} className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Reformer" />
        </div>
        <div>
          <label htmlFor={`${idCat}-duracion`} className={labelCls}>Duración (min)</label>
          <input id={`${idCat}-duracion`} type="number" min={1} className={inputCls} value={form.duracionMinutos} onChange={e => setForm(f => ({ ...f, duracionMinutos: e.target.value }))} />
        </div>
        <div>
          <label htmlFor={`${idCat}-nivel`} className={labelCls}>Nivel</label>
          <select id={`${idCat}-nivel`} className={inputCls} value={form.nivel} onChange={e => setForm(f => ({ ...f, nivel: e.target.value as CadenaTipoClase['nivel'] }))}>
            {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="@md/config:col-span-2">
          <p className={labelCls}>Color</p>
          <ColorInput value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} />
        </div>
        <div className="@md/config:col-span-2 flex items-center gap-2">
          <button onClick={guardar} disabled={guardando} className={cn(btnPrimary, guardando && 'opacity-50')}>
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Añadir a la plantilla'}
          </button>
          {editId && (
            <button onClick={cancelar} className={cn(btnSecondary, 'px-2.5')} aria-label="Cancelar edición">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </TarjetaAjuste>
  );
}
