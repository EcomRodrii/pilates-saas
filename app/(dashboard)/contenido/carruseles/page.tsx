'use client';

import { useState, useId } from 'react';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import { PageHeader, PlataformaAvatar, fmtFecha } from '@/components/contenido/ui';
import { SlidePreview } from '@/components/contenido/slide-preview';
import { generarCarrusel } from '@/lib/contenido/ai-client';
import { exportarSlidePNG } from '@/lib/contenido/export-carrusel';
import { cid } from '@/lib/contenido/seed';
import {
  ESTILO_CARRUSEL, PLATAFORMAS, PLATAFORMA_META,
  type EstiloCarrusel, type Plataforma, type Carrusel, type SlideCarrusel,
} from '@/lib/contenido/types';
import {
  Loader2, Wand2, Save, Download, Trash2, Copy, Plus, ChevronLeft, ChevronRight,
  GalleryHorizontalEnd, Info, Check,
} from 'lucide-react';

const inputCls = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10';

interface Borrador { id?: string; tema: string; estilo: EstiloCarrusel; plataforma: Plataforma; slides: SlideCarrusel[] }

function slugify(s: string) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24) || 'carrusel'; }

export default function CarruselesPage() {
  const uid = useId();
  const { carruseles, guardarCarrusel, eliminarCarrusel, duplicarCarrusel } = useContenido();
  const [tema, setTema] = useState('');
  const [nSlides, setNSlides] = useState(4);
  const [cargando, setCargando] = useState(false);
  const [demo, setDemo] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [b, setB] = useState<Borrador | null>(null);
  const [idx, setIdx] = useState(0);

  async function generar() {
    if (!tema.trim()) return;
    setCargando(true); setGuardado(false);
    const { data, demo } = await generarCarrusel(tema.trim(), nSlides);
    const slides: SlideCarrusel[] = data.map((s) => ({ id: cid('sl'), tipo: s.tipo, titulo: s.titulo, cuerpo: s.cuerpo }));
    setB({ tema: tema.trim(), estilo: b?.estilo ?? 'gradient', plataforma: 'instagram', slides });
    setDemo(demo); setIdx(0); setCargando(false);
  }

  function editSlide(i: number, patch: Partial<SlideCarrusel>) {
    setB((prev) => prev ? { ...prev, slides: prev.slides.map((s, j) => j === i ? { ...s, ...patch } : s) } : prev);
  }
  function addSlide() {
    setB((prev) => {
      if (!prev) return prev;
      const nueva: SlideCarrusel = { id: cid('sl'), tipo: 'contenido', titulo: 'Nueva diapositiva', cuerpo: '' };
      const ctaIdx = prev.slides.findIndex((s) => s.tipo === 'cta');
      const slides = [...prev.slides];
      slides.splice(ctaIdx === -1 ? slides.length : ctaIdx, 0, nueva);
      setIdx(ctaIdx === -1 ? slides.length - 1 : ctaIdx);
      return { ...prev, slides };
    });
  }
  function removeSlide(i: number) {
    setB((prev) => {
      if (!prev || prev.slides.length <= 1) return prev;
      const slides = prev.slides.filter((_, j) => j !== i);
      setIdx((cur) => Math.min(cur, slides.length - 1));
      return { ...prev, slides };
    });
  }

  function guardar() {
    if (!b) return;
    const saved = guardarCarrusel(b);
    setB({ ...b, id: saved.id });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 1800);
  }

  function exportar() {
    if (!b) return;
    exportarSlidePNG(b.slides[idx], b.estilo, idx + 1, b.slides.length, slugify(b.tema));
  }

  function abrir(c: Carrusel) {
    setB({ id: c.id, tema: c.tema, estilo: c.estilo, plataforma: c.plataforma, slides: c.slides.map((s) => ({ ...s })) });
    setTema(c.tema); setIdx(0); setDemo(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const slide = b?.slides[idx];

  return (
    <div className="space-y-6">
      <PageHeader title="Carruseles IA" subtitle="Genera carruseles listos para publicar" />

      {/* Generador */}
      <section className="bg-card border border-border rounded-3xl p-5">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor={`${uid}-1`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tema del carrusel</label>
            <input id={`${uid}-1`} className={inputCls} value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ej. Guía de respiración para principiantes" onKeyDown={(e) => e.key === 'Enter' && generar()} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-2`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Diapositivas</label>
            <input id={`${uid}-2`} type="number" min={2} max={8} className={cn(inputCls, 'lg:w-28')} value={nSlides} onChange={(e) => setNSlides(Math.min(8, Math.max(2, Number(e.target.value))))} />
          </div>
          <button onClick={generar} disabled={!tema.trim() || cargando} className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity">
            {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {cargando ? 'Generando…' : 'Generar con IA'}
          </button>
        </div>
      </section>

      {b && slide && (
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4 contenido-anim">
          {/* Preview + navegación */}
          <div className="space-y-3">
            {demo && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
                <Info className="w-4 h-4 shrink-0" /> Modo demo: carrusel generado con plantilla local. Edita cada diapositiva libremente.
              </div>
            )}
            <div className="bg-card border border-border rounded-3xl p-4">
              <div className="mx-auto max-w-md rounded-2xl overflow-hidden border border-border shadow-sm">
                <SlidePreview slide={slide} estilo={b.estilo} index={idx + 1} total={b.slides.length} />
              </div>
              <div className="flex items-center justify-center gap-3 mt-3">
                <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Diapositiva anterior" className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-sm font-semibold text-muted-foreground tabular-nums">{idx + 1} / {b.slides.length}</span>
                <button onClick={() => setIdx((i) => Math.min(b.slides.length - 1, i + 1))} disabled={idx === b.slides.length - 1} aria-label="Diapositiva siguiente" className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-30 hover:bg-muted transition-colors"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

            {/* Tira de miniaturas */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {b.slides.map((s, i) => (
                <button key={s.id} onClick={() => setIdx(i)} className={cn('w-16 shrink-0 rounded-lg overflow-hidden border-2 transition-colors', i === idx ? 'border-foreground' : 'border-transparent hover:border-border')}>
                  <SlidePreview slide={s} estilo={b.estilo} index={i + 1} total={b.slides.length} compact />
                </button>
              ))}
              <button onClick={addSlide} aria-label="Añadir diapositiva" className="w-16 shrink-0 aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"><Plus className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Panel de edición */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Estilo</h3>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {(Object.keys(ESTILO_CARRUSEL) as EstiloCarrusel[]).map((es) => (
                  <button key={es} title={ESTILO_CARRUSEL[es].label} onClick={() => setB((p) => p ? { ...p, estilo: es } : p)} className={cn('aspect-square rounded-lg border-2 overflow-hidden transition-colors', b.estilo === es ? 'border-foreground' : 'border-transparent hover:border-border')} style={{ background: ESTILO_CARRUSEL[es].bg }}>
                    <span className="block w-full h-full flex items-center justify-center text-[9px] font-bold" style={{ color: ESTILO_CARRUSEL[es].fg }}>Aa</span>
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-3`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plataforma</label>
                <select id={`${uid}-3`} className={inputCls} value={b.plataforma} onChange={(e) => setB((p) => p ? { ...p, plataforma: e.target.value as Plataforma } : p)}>
                  {PLATAFORMAS.map((p) => <option key={p} value={p}>{PLATAFORMA_META[p].label}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-card border border-border rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Diapositiva {idx + 1}</h3>
                <button onClick={() => removeSlide(idx)} disabled={b.slides.length <= 1} className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-rose-600 disabled:opacity-30 transition-colors"><Trash2 className="w-3.5 h-3.5" /> Quitar</button>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-4`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Título</label>
                <textarea id={`${uid}-4`} rows={2} className={cn(inputCls, 'resize-y')} value={slide.titulo} onChange={(e) => editSlide(idx, { titulo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-5`} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cuerpo</label>
                <textarea id={`${uid}-5`} rows={4} className={cn(inputCls, 'resize-y')} value={slide.cuerpo} onChange={(e) => editSlide(idx, { cuerpo: e.target.value })} />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={guardar} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
                {guardado ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />} {guardado ? 'Guardado' : 'Guardar'}
              </button>
              <button onClick={exportar} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                <Download className="w-4 h-4" /> Exportar PNG
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Biblioteca de carruseles */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <GalleryHorizontalEnd className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-[15px] font-bold text-foreground">Mis carruseles</h3>
          <span className="text-xs text-muted-foreground">({carruseles.length})</span>
        </div>
        {carruseles.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-3xl p-10 text-center text-sm text-muted-foreground">
            Aún no has guardado carruseles. Genera uno arriba y pulsa «Guardar».
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {carruseles.map((c) => (
              <article key={c.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-muted-foreground/50 transition-colors">
                <button onClick={() => abrir(c)} className="block w-full">
                  <SlidePreview slide={c.slides[0]} estilo={c.estilo} />
                </button>
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <PlataformaAvatar plataforma={c.plataforma} size={16} />
                    <span className="text-[11px] text-muted-foreground">{c.slides.length} diapositivas</span>
                  </div>
                  <p className="text-[13px] font-bold text-foreground leading-snug line-clamp-2">{c.tema}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-muted-foreground">{fmtFecha(c.updatedAt)}</span>
                    <div className="flex items-center gap-0.5">
                      <button title="Duplicar" onClick={() => duplicarCarrusel(c.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                      <button title="Eliminar" onClick={() => eliminarCarrusel(c.id)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
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
