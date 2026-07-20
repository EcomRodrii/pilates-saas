'use client';

import { useEffect, useState, useId } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import {
  PLATAFORMAS, PLATAFORMA_META, TIPO_PUBLICACION_LABEL, ESTADO_META,
  type Publicacion, type Plataforma, type TipoPublicacion, type EstadoPublicacion,
} from '@/lib/contenido/types';
import { PlataformaAvatar } from '@/components/contenido/ui';
import { Trash2, Check } from 'lucide-react';

const inputCls = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10';
const selectCls = inputCls;

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function PublicacionDialog({
  open, onClose, publicacion, fechaInicial,
}: {
  open: boolean;
  onClose: () => void;
  publicacion?: Publicacion | null;   // undefined/null = crear
  fechaInicial?: Date;                // día pre-seleccionado al crear desde calendario
}) {
  const { crearPublicacion, actualizarPublicacion, eliminarPublicacion } = useContenido();
  const editando = !!publicacion;

  const [titulo, setTitulo] = useState('');
  const [contenido, setContenido] = useState('');
  const [tipo, setTipo] = useState<TipoPublicacion>('post');
  const [estado, setEstado] = useState<EstadoPublicacion>('programada');
  const [plataformas, setPlataformas] = useState<Plataforma[]>(['instagram']);
  const [fecha, setFecha] = useState('');
  const [hashtags, setHashtags] = useState('');

  useEffect(() => {
    if (!open) return;
    if (publicacion) {
      setTitulo(publicacion.titulo);
      setContenido(publicacion.contenido);
      setTipo(publicacion.tipo);
      setEstado(publicacion.estado);
      setPlataformas(publicacion.plataformas);
      setFecha(toLocalInput(publicacion.fechaProgramada));
      setHashtags(publicacion.hashtags.join(' '));
    } else {
      const base = fechaInicial ?? new Date();
      if (!fechaInicial) base.setHours(base.getHours() + 1, 0, 0, 0);
      setTitulo(''); setContenido(''); setTipo('post'); setEstado('programada');
      setPlataformas(['instagram']); setFecha(toLocalInput(base.toISOString())); setHashtags('');
    }
  }, [open, publicacion, fechaInicial]);

  function togglePlat(p: Plataforma) {
    setPlataformas((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  function guardar() {
    if (!titulo.trim()) return;
    const iso = new Date(fecha).toISOString();
    const tags = hashtags.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
    const payload = {
      titulo: titulo.trim(), contenido, tipo, estado,
      plataformas: plataformas.length ? plataformas : (['instagram'] as Plataforma[]),
      fechaProgramada: iso,
      fechaPublicada: estado === 'publicada' ? iso : undefined,
      hashtags: tags,
    };
    if (publicacion) actualizarPublicacion(publicacion.id, payload);
    else crearPublicacion(payload);
    onClose();
  }

  function borrar() {
    if (publicacion) { eliminarPublicacion(publicacion.id); onClose(); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar publicación' : 'Nueva publicación'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Título">
            <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. 3 estiramientos para la espalda" autoFocus />
          </Field>

          <Field label="Plataformas">
            <div className="flex flex-wrap gap-1.5">
              {PLATAFORMAS.map((p) => {
                const on = plataformas.includes(p);
                return (
                  <button
                    key={p} type="button" onClick={() => togglePlat(p)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                      on ? 'border-foreground bg-foreground/5 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <PlataformaAvatar plataforma={p} size={16} />
                    {PLATAFORMA_META[p].label}
                    {on && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoPublicacion)}>
                {Object.entries(TIPO_PUBLICACION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select className={selectCls} value={estado} onChange={(e) => setEstado(e.target.value as EstadoPublicacion)}>
                {Object.entries(ESTADO_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Fecha y hora">
            <input type="datetime-local" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>

          <Field label="Contenido">
            <textarea className={cn(inputCls, 'min-h-[80px] resize-y')} value={contenido} onChange={(e) => setContenido(e.target.value)} placeholder="Texto del copy…" />
          </Field>

          <Field label="Hashtags">
            <input className={inputCls} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#fitness #salud" />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {editando ? (
            <button onClick={borrar} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-500/10 transition-colors">
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={guardar} disabled={!titulo.trim()} className="rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
              {editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
