'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Eye, Heart, Upload, X, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { MARKETING_MODULE_ENABLED } from '@/lib/feature-flags';
import { pedirSubidaVideo, subirVideoAStream } from '@/lib/api-client';
import { urlIframeStream } from '@/lib/stream-playback';
import type { VideoOnDemand, CategoriaVideo, NivelClase } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIAS: { value: CategoriaVideo | 'TODOS'; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'REFORMER', label: 'Reformer' },
  { value: 'MAT', label: 'Mat' },
  { value: 'BARRE', label: 'Barre' },
  { value: 'MEDITACION', label: 'Meditación' },
  { value: 'ESTIRAMIENTO', label: 'Estiramiento' },
];

const NIVELES: { value: NivelClase | 'TODOS_NIVOS'; label: string }[] = [
  { value: 'TODOS_NIVOS', label: 'Todos los niveles' },
  { value: 'PRINCIPIANTE', label: 'Principiante' },
  { value: 'MEDIO', label: 'Medio' },
  { value: 'AVANZADO', label: 'Avanzado' },
  { value: 'TODOS', label: 'Para todos' },
];

// ─── Style maps ───────────────────────────────────────────────────────────────

const categoriaBg: Record<CategoriaVideo, string> = {
  REFORMER: 'bg-purple-200',
  MAT: 'bg-blue-200',
  BARRE: 'bg-pink-200',
  MEDITACION: 'bg-teal-200',
  ESTIRAMIENTO: 'bg-green-200',
  CARDIO: 'bg-orange-200',
};

const categoriaBadge: Record<CategoriaVideo, string> = {
  REFORMER: 'bg-purple-100 text-purple-700',
  MAT: 'bg-blue-100 text-blue-700',
  BARRE: 'bg-pink-100 text-pink-700',
  MEDITACION: 'bg-teal-100 text-teal-700',
  ESTIRAMIENTO: 'bg-green-100 text-green-700',
  CARDIO: 'bg-orange-100 text-orange-700',
};

const nivelBadge: Record<NivelClase, string> = {
  PRINCIPIANTE: 'bg-green-100 text-green-700',
  MEDIO: 'bg-amber-100 text-amber-700',
  AVANZADO: 'bg-red-100 text-red-700',
  TODOS: 'bg-muted text-foreground',
};

const nivelLabel: Record<NivelClase, string> = {
  PRINCIPIANTE: 'Principiante',
  MEDIO: 'Medio',
  AVANZADO: 'Avanzado',
  TODOS: 'Para todos',
};

// ─── Upload modal ─────────────────────────────────────────────────────────────

type UploadForm = {
  titulo: string;
  descripcion: string;
  categoria: CategoriaVideo;
  nivel: NivelClase;
  duracion: string;
  instructorId: string;
};

function UploadModal({ onClose, onSave, instructores }: { onClose: () => void; onSave: (fields: UploadForm, streamUid: string | null) => void; instructores: { id: string; nombre: string }[] }) {
  const [form, setForm] = useState<UploadForm>({
    titulo: '',
    descripcion: '',
    categoria: 'REFORMER',
    nivel: 'TODOS',
    duracion: '',
    instructorId: instructores[0]?.id ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!form.titulo.trim() || subiendo) return;

    // Sin fichero → se guarda solo la ficha (comportamiento antiguo).
    if (!file) {
      onSave(form, null);
      onClose();
      return;
    }

    // Con fichero → subida real a Cloudflare Stream.
    setSubiendo(true);
    setAviso(null);
    const prep = await pedirSubidaVideo(form.titulo.trim());
    if (!prep.ok) {
      setSubiendo(false);
      if (prep.status === 503) {
        // Stream no configurado: se ofrece guardar solo la ficha, sin bloquear.
        setAviso('El hosting de vídeo (Cloudflare Stream) aún no está configurado. Puedes guardar la ficha y subir el vídeo cuando esté listo.');
      } else {
        setAviso(prep.error);
      }
      return;
    }
    const ok = await subirVideoAStream(prep.uploadURL, file);
    setSubiendo(false);
    if (!ok) {
      setAviso('No se pudo subir el vídeo a Cloudflare. Inténtalo de nuevo.');
      return;
    }
    onSave(form, prep.uid);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[16px] font-semibold text-foreground">Subir vídeo</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Título *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Ej: Reformer para principiantes"
              className="w-full px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              placeholder="Describe el contenido del vídeo..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Vídeo</label>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-[13px] text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <Upload size={14} />
              <span className="truncate">{file ? file.name : 'Seleccionar fichero de vídeo (opcional)'}</span>
            </button>
            <p className="text-[11px] text-muted-foreground mt-1">Si no subes fichero, se guarda solo la ficha del vídeo.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1">Categoría</label>
              <select
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value as CategoriaVideo }))}
                className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-foreground outline-none focus:border-foreground transition-colors bg-card"
              >
                {CATEGORIAS.filter(c => c.value !== 'TODOS').map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1">Nivel</label>
              <select
                value={form.nivel}
                onChange={e => setForm(f => ({ ...f, nivel: e.target.value as NivelClase }))}
                className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-foreground outline-none focus:border-foreground transition-colors bg-card"
              >
                {NIVELES.filter(n => n.value !== 'TODOS_NIVOS').map(n => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1">Duración (minutos)</label>
              <input
                type="number"
                value={form.duracion}
                onChange={e => setForm(f => ({ ...f, duracion: e.target.value }))}
                placeholder="45"
                min={1}
                className="w-full px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-foreground mb-1">Instructora</label>
              <select
                value={form.instructorId}
                onChange={e => setForm(f => ({ ...f, instructorId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border text-[13px] text-foreground outline-none focus:border-foreground transition-colors bg-card"
              >
                {instructores.map(i => (
                  <option key={i.id} value={i.id}>{i.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          {aviso && (
            <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{aviso}</p>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={subiendo}
            className="flex-1 py-2 rounded-lg border border-border bg-card text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!form.titulo.trim() || subiendo}
            className={cn(
              'flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors flex items-center justify-center gap-2',
              form.titulo.trim() && !subiendo
                ? 'bg-brand text-brand-foreground hover:brightness-95'
                : 'bg-border text-muted-foreground cursor-not-allowed'
            )}
          >
            {subiendo && <Loader2 size={14} className="animate-spin" />}
            {subiendo ? 'Subiendo…' : file ? 'Subir vídeo' : 'Guardar ficha'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({
  video,
  instructorNombre,
  onToggle,
}: {
  video: VideoOnDemand;
  instructorNombre: string;
  onToggle: (id: string) => void;
}) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const tieneVideo = !!video.streamUid;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
      {/* Thumbnail / reproductor */}
      {reproduciendo && video.streamUid ? (
        <div className="relative h-36 bg-black">
          <iframe
            src={urlIframeStream(video.streamUid)}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            title={video.titulo}
          />
        </div>
      ) : (
        <div className={cn('relative h-36 flex items-center justify-center', categoriaBg[video.categoria])}>
          {/* Category badge */}
          <span className={cn('absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-medium', categoriaBadge[video.categoria])}>
            {video.categoria}
          </span>
          {/* Play button — solo reproduce si el vídeo está alojado (streamUid) */}
          <button
            onClick={() => tieneVideo && setReproduciendo(true)}
            title={tieneVideo ? 'Reproducir' : 'Este vídeo aún no tiene fichero subido'}
            className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center shadow transition-colors',
              tieneVideo ? 'bg-card/80 hover:bg-card cursor-pointer' : 'bg-card/50 cursor-not-allowed',
            )}
          >
            <Play size={20} className={cn('ml-0.5', tieneVideo ? 'text-foreground' : 'text-muted-foreground')} fill="currentColor" />
          </button>
          {!tieneVideo && (
            <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/50 text-white text-[10px] font-medium">Sin vídeo</span>
          )}
          {/* Duration */}
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[11px] font-medium">
            {video.duracionMinutos} min
          </span>
        </div>
      )}

      {/* Body */}
      <div className="p-3">
        <h3 className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2 mb-1">
          {video.titulo}
        </h3>
        {video.descripcion && (
          <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed mb-2">
            {video.descripcion}
          </p>
        )}

        {/* Level + Instructor */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', nivelBadge[video.nivel])}>
            {nivelLabel[video.nivel]}
          </span>
          <span className="text-[12px] text-muted-foreground">{instructorNombre}</span>
        </div>

        {/* Stats + toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Eye size={13} />
              {video.vistas.toLocaleString('es-ES')}
            </span>
            <span className="flex items-center gap-1">
              <Heart size={13} />
              {video.likes}
            </span>
          </div>
          {/* Active toggle */}
          <button
            onClick={() => onToggle(video.id)}
            className={cn(
              'relative w-9 h-5 rounded-full transition-colors shrink-0',
              video.activo ? 'bg-success' : 'bg-border'
            )}
          >
            <span className={cn(
              'absolute top-0.5 w-4 h-4 rounded-full bg-card shadow transition-transform',
              video.activo ? 'translate-x-4' : 'translate-x-0.5'
            )} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OnDemandPage() {
  const { videosOnDemand: videos, addVideo, toggleVideo, instructores } = useStudio();
  const router = useRouter();
  // Oferta digital oculta temporalmente (ver lib/feature-flags.ts): redirige.
  useEffect(() => {
    if (!MARKETING_MODULE_ENABLED) router.replace('/dashboard');
  }, [router]);
  const [categoriaActiva, setCategoriaActiva] = useState<CategoriaVideo | 'TODOS'>('TODOS');
  const [nivelActivo, setNivelActivo] = useState<NivelClase | 'TODOS_NIVOS'>('TODOS_NIVOS');
  const [busqueda, setBusqueda] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  if (!MARKETING_MODULE_ENABLED) return null;

  // Stats
  const totalVistas = videos.reduce((s, v) => s + v.vistas, 0);
  const totalVideos = videos.length;
  const catCount = videos.reduce<Record<string, number>>((acc, v) => {
    acc[v.categoria] = (acc[v.categoria] ?? 0) + 1;
    return acc;
  }, {});
  const topCategoria = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  // Filters
  const videosFiltrados = videos.filter(v => {
    const matchCat = categoriaActiva === 'TODOS' || v.categoria === categoriaActiva;
    const matchNivel = nivelActivo === 'TODOS_NIVOS' || v.nivel === nivelActivo;
    const matchSearch = busqueda === '' || v.titulo.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchNivel && matchSearch;
  });

  function handleSaveVideo(form: { titulo: string; descripcion: string; categoria: CategoriaVideo; nivel: NivelClase; duracion: string; instructorId: string }, streamUid: string | null) {
    addVideo({
      titulo: form.titulo.trim(),
      descripcion: form.descripcion.trim() || null,
      categoria: form.categoria,
      duracionMinutos: parseInt(form.duracion) || 0,
      nivel: form.nivel,
      instructorId: form.instructorId,
      activo: true,
      streamUid,
    });
  }

  return (
    <div className="space-y-6">

        <PageHeader
          title="Biblioteca on-demand"
          badge={
            <span className="px-2 py-0.5 rounded-full bg-card border border-border text-[12px] text-muted-foreground whitespace-nowrap">
              {totalVideos} vídeos
            </span>
          }
          actions={
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[13px] font-medium hover:brightness-95 transition-colors shrink-0"
            >
              <Upload size={14} />
              Subir vídeo
            </button>
          }
        />

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[12px] text-muted-foreground mb-0.5">Total reproducciones</p>
            <p className="text-[22px] font-semibold text-foreground truncate">{totalVistas.toLocaleString('es-ES')}</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[12px] text-muted-foreground mb-0.5">Vídeos publicados</p>
            <p className="text-[22px] font-semibold text-foreground truncate">{videos.filter(v => v.activo).length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-4 py-3">
            <p className="text-[12px] text-muted-foreground mb-0.5">Categoría más popular</p>
            <p className="text-[22px] font-semibold text-foreground capitalize truncate">{topCategoria.charAt(0) + topCategoria.slice(1).toLowerCase()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Category tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIAS.map(c => (
              <button
                key={c.value}
                onClick={() => setCategoriaActiva(c.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                  categoriaActiva === c.value
                    ? 'bg-brand text-brand-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2 ml-auto">
            {/* Level filter */}
            <select
              value={nivelActivo}
              onChange={e => setNivelActivo(e.target.value as NivelClase | 'TODOS_NIVOS')}
              className="px-3 py-1.5 rounded-lg border border-border bg-card text-[12px] text-muted-foreground outline-none focus:border-foreground transition-colors"
            >
              {NIVELES.map(n => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>

            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-card text-[12px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors w-44"
              />
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videosFiltrados.map(v => (
            <VideoCard
              key={v.id}
              video={v}
              instructorNombre={instructores.find(i => i.id === v.instructorId)?.nombre ?? v.instructorId}
              onToggle={toggleVideo}
            />
          ))}
          {videosFiltrados.length === 0 && (
            <div className="col-span-3 py-16 text-center text-muted-foreground">
              <Play size={32} strokeWidth={1.5} className="mx-auto mb-3" />
              <p className="text-[14px]">No hay vídeos con los filtros aplicados</p>
            </div>
          )}
        </div>

      {/* Upload modal */}
      {modalOpen && (
        <UploadModal onClose={() => setModalOpen(false)} onSave={handleSaveVideo} instructores={instructores} />
      )}
    </div>
  );
}
