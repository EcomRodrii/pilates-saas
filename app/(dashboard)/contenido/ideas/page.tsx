'use client';

import { useMemo, useState, useId } from 'react';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import { PageHeader, PlataformaAvatar } from '@/components/contenido/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  PLATAFORMAS, PLATAFORMA_META, ESTADO_IDEA_META,
  type EstadoIdea, type Idea, type Plataforma,
} from '@/lib/contenido/types';
import { Plus, Trash2, Lightbulb } from 'lucide-react';

const inputCls = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10';
const COLUMNAS: EstadoIdea[] = ['nueva', 'en_proceso', 'usada', 'descartada'];

export default function IdeasPage() {
  const uid = useId();
  const { ideas, crearIdea, actualizarIdea, eliminarIdea } = useContenido();
  const [abrir, setAbrir] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [notas, setNotas] = useState('');
  const [plataforma, setPlataforma] = useState<Plataforma | ''>('');
  const [tags, setTags] = useState('');

  const porColumna = useMemo(() => {
    const m: Record<EstadoIdea, Idea[]> = { nueva: [], en_proceso: [], usada: [], descartada: [] };
    for (const i of ideas) m[i.estado].push(i);
    return m;
  }, [ideas]);

  function guardar() {
    if (!titulo.trim()) return;
    crearIdea({
      titulo: titulo.trim(),
      notas: notas.trim(),
      plataformaSugerida: plataforma || undefined,
      tags: tags.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean),
    });
    setTitulo(''); setNotas(''); setPlataforma(''); setTags(''); setAbrir(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ideas"
        subtitle="Captura y organiza ideas de contenido"
        actions={
          <button onClick={() => setAbrir(true)} className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Nueva idea
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {COLUMNAS.map((col) => {
          const m = ESTADO_IDEA_META[col];
          const items = porColumna[col];
          return (
            <div key={col} className="bg-muted/40 rounded-3xl p-3">
              <div className="flex items-center justify-between px-1 mb-3">
                <h3 className={cn('text-[13px] font-bold', m.color)}>{m.label}</h3>
                <span className="text-[12px] font-semibold text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {items.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-6">Sin ideas</p>
                ) : items.map((idea) => (
                  <article key={idea.id} className="bg-card border border-border rounded-2xl p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground leading-snug flex-1">{idea.titulo}</p>
                      {idea.plataformaSugerida && <PlataformaAvatar plataforma={idea.plataformaSugerida} size={18} />}
                    </div>
                    {idea.notas && <p className="text-[12px] text-muted-foreground leading-snug line-clamp-3">{idea.notas}</p>}
                    {idea.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {idea.tags.map((t) => <span key={t} className="text-[10px] font-semibold rounded-full bg-muted px-2 py-0.5 text-muted-foreground">#{t}</span>)}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <select value={idea.estado} onChange={(e) => actualizarIdea(idea.id, { estado: e.target.value as EstadoIdea })} className="rounded-full border border-border bg-card px-2 h-7 text-[11px] font-semibold text-foreground focus:outline-none">
                        {COLUMNAS.map((c) => <option key={c} value={c}>{ESTADO_IDEA_META[c].label}</option>)}
                      </select>
                      <button title="Eliminar" onClick={() => eliminarIdea(idea.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={abrir} onOpenChange={setAbrir}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nueva idea</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-1`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Título</label>
              <input id={`${uid}-1`} className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Serie mitos del fitness" autoFocus onKeyDown={(e) => e.key === 'Enter' && guardar()} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-2`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notas</label>
              <textarea id={`${uid}-2`} rows={3} className={cn(inputCls, 'resize-y')} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Describe la idea…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-3`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plataforma</label>
                <select id={`${uid}-3`} className={inputCls} value={plataforma} onChange={(e) => setPlataforma(e.target.value as Plataforma | '')}>
                  <option value="">Cualquiera</option>
                  {PLATAFORMAS.map((p) => <option key={p} value={p}>{PLATAFORMA_META[p].label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-4`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tags</label>
                <input id={`${uid}-4`} className={inputCls} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="serie, educativo" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={() => setAbrir(false)} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={guardar} disabled={!titulo.trim()} className="rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">Crear idea</button>
          </div>
        </DialogContent>
      </Dialog>

      {ideas.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lightbulb className="w-4 h-4" /> Empieza capturando tu primera idea de contenido.
        </div>
      )}
    </div>
  );
}
