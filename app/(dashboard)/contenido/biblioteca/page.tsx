'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import {
  PageHeader, PlataformasStack, EstadoBadge, TipoBadge, fmtFechaHora,
} from '@/components/contenido/ui';
import { PublicacionDialog } from '@/components/contenido/publicacion-dialog';
import {
  PLATAFORMAS, PLATAFORMA_META, ESTADO_META,
  type Publicacion, type Plataforma, type EstadoPublicacion,
} from '@/lib/contenido/types';
import {
  Plus, Search, Copy, Trash2, ScrollText, GalleryHorizontalEnd, ArrowUpRight,
} from 'lucide-react';

export default function BibliotecaPage() {
  const { publicaciones, guiones, carruseles, duplicarPublicacion, eliminarPublicacion } = useContenido();
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<EstadoPublicacion | 'todos'>('todos');
  const [plat, setPlat] = useState<Plataforma | 'todas'>('todas');
  const [dialog, setDialog] = useState<{ pub?: Publicacion | null } | null>(null);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return publicaciones
      .filter((p) => estado === 'todos' || p.estado === estado)
      .filter((p) => plat === 'todas' || p.plataformas.includes(plat))
      .filter((p) => !term || p.titulo.toLowerCase().includes(term) || p.contenido.toLowerCase().includes(term) || p.hashtags.some((h) => h.toLowerCase().includes(term)))
      .sort((a, b) => +new Date(b.fechaProgramada) - +new Date(a.fechaProgramada));
  }, [publicaciones, q, estado, plat]);

  const conteos = useMemo(() => ({
    todos: publicaciones.length,
    borrador: publicaciones.filter((p) => p.estado === 'borrador').length,
    programada: publicaciones.filter((p) => p.estado === 'programada').length,
    publicada: publicaciones.filter((p) => p.estado === 'publicada').length,
  }), [publicaciones]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biblioteca de contenido"
        subtitle="Todas tus publicaciones en un solo lugar"
        actions={
          <button onClick={() => setDialog({ pub: null })} className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Nueva publicación
          </button>
        }
      />

      {/* Accesos a las bibliotecas de IA */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/contenido/guiones" className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4 hover:border-muted-foreground/50 transition-colors">
          <span className="w-10 h-10 rounded-full border border-border flex items-center justify-center shrink-0"><ScrollText className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">Guiones IA</p>
            <p className="text-[12px] text-muted-foreground">{guiones.length} guardados</p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
        </Link>
        <Link href="/contenido/carruseles" className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4 hover:border-muted-foreground/50 transition-colors">
          <span className="w-10 h-10 rounded-full border border-border flex items-center justify-center shrink-0"><GalleryHorizontalEnd className="w-5 h-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">Carruseles IA</p>
            <p className="text-[12px] text-muted-foreground">{carruseles.length} guardados</p>
          </div>
          <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, texto o hashtag…" className="w-full rounded-full border border-border bg-card pl-9 pr-3 h-10 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10" />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(['todos', 'borrador', 'programada', 'publicada'] as const).map((e) => (
            <button key={e} onClick={() => setEstado(e)} className={cn('rounded-full px-3 h-9 text-sm font-semibold whitespace-nowrap transition-colors', estado === e ? 'bg-foreground text-background' : 'bg-card border border-border text-muted-foreground hover:text-foreground')}>
              {e === 'todos' ? 'Todas' : ESTADO_META[e].label} <span className="opacity-60">{conteos[e]}</span>
            </button>
          ))}
          <select value={plat} onChange={(e) => setPlat(e.target.value as Plataforma | 'todas')} className="rounded-full border border-border bg-card px-3 h-9 text-sm font-semibold text-foreground focus:outline-none">
            <option value="todas">Todas las redes</option>
            {PLATAFORMAS.map((p) => <option key={p} value={p}>{PLATAFORMA_META[p].label}</option>)}
          </select>
        </div>
      </div>

      {/* Grid */}
      {filtradas.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-12 text-center text-sm text-muted-foreground">
          No hay publicaciones que coincidan con los filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtradas.map((p) => (
            <article key={p.id} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2.5 hover:border-muted-foreground/50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <PlataformasStack plataformas={p.plataformas} size={22} />
                <EstadoBadge estado={p.estado} />
              </div>
              <button onClick={() => setDialog({ pub: p })} className="text-left">
                <p className="text-sm font-bold text-foreground leading-snug line-clamp-2">{p.titulo}</p>
                <p className="text-[12px] text-muted-foreground line-clamp-2 mt-1">{p.contenido}</p>
              </button>
              {p.hashtags.length > 0 && (
                <p className="text-[11px] text-muted-foreground line-clamp-1">{p.hashtags.join(' ')}</p>
              )}
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <TipoBadge tipo={p.tipo} />
                  <span className="text-[11px] text-muted-foreground">{fmtFechaHora(p.fechaProgramada)}</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button title="Duplicar" onClick={() => duplicarPublicacion(p.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                  <button title="Eliminar" onClick={() => eliminarPublicacion(p.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {dialog && <PublicacionDialog open onClose={() => setDialog(null)} publicacion={dialog.pub} />}
    </div>
  );
}
