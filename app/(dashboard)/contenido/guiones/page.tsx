'use client';

import { useState, useId } from 'react';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import { PageHeader, PlataformaAvatar, fmtFecha } from '@/components/contenido/ui';
import { generarGuion } from '@/lib/contenido/ai-client';
import {
  PLATAFORMAS, PLATAFORMA_META, type Plataforma, type Guion,
} from '@/lib/contenido/types';
import {
  Loader2, Save, Copy, Trash2, ScrollText, Clock, Wand2, Info, Check,
} from 'lucide-react';

const inputCls = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10';

type Borrador = Omit<Guion, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export default function GuionesPage() {
  const uid = useId();
  const { guiones, guardarGuion, eliminarGuion, duplicarGuion } = useContenido();
  const [tema, setTema] = useState('');
  const [plataforma, setPlataforma] = useState<Plataforma>('instagram');
  const [cargando, setCargando] = useState(false);
  const [demo, setDemo] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  async function generar() {
    if (!tema.trim()) return;
    setCargando(true); setGuardado(false);
    const { data, demo } = await generarGuion(tema.trim(), plataforma);
    setBorrador({ ...data, tema: tema.trim() });
    setDemo(demo);
    setCargando(false);
  }

  function set<K extends keyof Borrador>(k: K, v: Borrador[K]) {
    setBorrador((b) => b ? { ...b, [k]: v } : b);
  }

  function guardar() {
    if (!borrador) return;
    const g = guardarGuion(borrador);
    setBorrador({ ...g });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 1800);
  }

  function editar(g: Guion) {
    setBorrador({ ...g });
    setTema(g.tema);
    setPlataforma(g.plataforma);
    setDemo(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Guiones IA" subtitle="Genera guiones de vídeo listos para grabar" />

      {/* Generador */}
      <section className="bg-card border border-border rounded-3xl p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor={`${uid}-1`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tema del contenido</label>
            <input id={`${uid}-1`} className={inputCls} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ej. Cómo mantener la constancia en el gym" onKeyDown={(e) => e.key === 'Enter' && generar()} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-2`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plataforma</label>
            <select id={`${uid}-2`} className={cn(inputCls, 'lg:w-44')} value={plataforma} onChange={(e) => setPlataforma(e.target.value as Plataforma)}>
              {PLATAFORMAS.map((p) => <option key={p} value={p}>{PLATAFORMA_META[p].label}</option>)}
            </select>
          </div>
          <button onClick={generar} disabled={!tema.trim() || cargando} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {cargando ? 'Generando…' : 'Generar con IA'}
          </button>
        </div>
      </section>

      {/* Editor del guion generado */}
      {borrador && (
        <section className="bg-card border border-border rounded-3xl p-5 space-y-4 contenido-anim">
          {demo && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
              <Info className="w-4 h-4 shrink-0" /> Modo demo: guion generado con plantilla local (IA no disponible en este entorno). Es totalmente editable.
            </div>
          )}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <PlataformaAvatar plataforma={borrador.plataforma} size={26} />
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground"><Clock className="w-3.5 h-3.5" /> {borrador.duracionSegundos}s</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={guardar} className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
                {guardado ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {guardado ? 'Guardado' : 'Guardar en biblioteca'}
              </button>
            </div>
          </div>

          <CampoEdit label="Título" value={borrador.titulo} onChange={(v) => set('titulo', v)} />
          <CampoEdit label="Gancho inicial" value={borrador.gancho} onChange={(v) => set('gancho', v)} textarea rows={2} />
          <CampoEdit label="Desarrollo" value={borrador.desarrollo} onChange={(v) => set('desarrollo', v)} textarea rows={4} />
          <CampoEdit label="Llamada a la acción" value={borrador.cta} onChange={(v) => set('cta', v)} textarea rows={2} />
          <CampoEdit label="Descripción" value={borrador.descripcion} onChange={(v) => set('descripcion', v)} textarea rows={2} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CampoEdit label="Hashtags" value={borrador.hashtags.join(' ')} onChange={(v) => set('hashtags', v.split(/\s+/).filter(Boolean))} className="sm:col-span-2" />
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-3`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Duración (s)</label>
              <input id={`${uid}-3`} type="number" min={5} max={180} className={inputCls} value={borrador.duracionSegundos} onChange={(e) => set('duracionSegundos', Number(e.target.value))} />
            </div>
          </div>
        </section>
      )}

      {/* Biblioteca de guiones */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ScrollText className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-[15px] font-bold text-foreground">Mis guiones</h3>
          <span className="text-xs text-muted-foreground">({guiones.length})</span>
        </div>
        {guiones.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-3xl p-10 text-center text-sm text-muted-foreground">
            Aún no has guardado guiones. Genera uno arriba y pulsa «Guardar en biblioteca».
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {guiones.map((g) => (
              <article key={g.id} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2 hover:border-muted-foreground/50 transition-colors">
                <div className="flex items-center justify-between">
                  <PlataformaAvatar plataforma={g.plataforma} size={22} />
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="w-3 h-3" /> {g.duracionSegundos}s</span>
                </div>
                <p className="text-sm font-bold text-foreground leading-snug line-clamp-2">{g.titulo}</p>
                <p className="text-[12px] text-muted-foreground line-clamp-2">{g.gancho}</p>
                <div className="flex items-center justify-between mt-auto pt-2">
                  <span className="text-[11px] text-muted-foreground">{fmtFecha(g.updatedAt)}</span>
                  <div className="flex items-center gap-1">
                    <IconBtn title="Editar" onClick={() => editar(g)} icon={Wand2} />
                    <IconBtn title="Duplicar" onClick={() => duplicarGuion(g.id)} icon={Copy} />
                    <IconBtn title="Eliminar" onClick={() => eliminarGuion(g.id)} icon={Trash2} danger />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CampoEdit({ label, value, onChange, textarea, rows = 2, className }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; rows?: number; className?: string;
}) {
  const uid = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={`${uid}-1`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {textarea
        ? <textarea id={`${uid}-1`} rows={rows} className={cn(inputCls, 'resize-y')} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

function IconBtn({ title, onClick, icon: Icon, danger }: { title: string; onClick: () => void; icon: React.ElementType; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', danger ? 'text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
      <Icon className="w-4 h-4" />
    </button>
  );
}
