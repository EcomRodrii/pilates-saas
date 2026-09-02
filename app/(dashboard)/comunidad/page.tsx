'use client';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, X, Pin, Image as ImageIcon, Video, CalendarDays, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { dbListComentariosComunidad, dbAddComentarioComunidad } from '@/lib/supabase-data';
import type { PostComunidad } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ─── Types ────────────────────────────────────────────────────────────────────

type Comment = {
  id: string;
  autorNombre: string;
  texto: string;
  creadoEn: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-purple-100 text-purple-700',
  'bg-blue-100 text-blue-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-red-100 text-red-700',
  'bg-indigo-100 text-indigo-700',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `hace ${mins} minuto${mins !== 1 ? 's' : ''}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days !== 1 ? 's' : ''}`;
}

function getInitials(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatoFechaEvento(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Switch (mismo patrón visual que app/(dashboard)/automatizaciones/page.tsx:
// fondo + bolita + desplazamiento, tres señales en vez de un icono outline que
// apenas se distingue encendido/apagado) ────────────────────────────────────

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors"
      style={{ background: checked ? 'var(--brand)' : 'var(--muted-foreground)' }}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

// ─── Event data shape used by the composer forms ───────────────────────────

type EventDraft = { activo: boolean; fecha: string; lugar: string; aforo: string };

function eventoDraftVacio(): EventDraft {
  return { activo: false, fecha: '', lugar: '', aforo: '' };
}

// Convierte el draft del formulario en las opts que espera `addPost` — solo
// cuando el toggle está activo; si no, un post de texto normal (sin campos
// evento*, mismo comportamiento previo).
function eventoDraftAOpts(draft: EventDraft): {
  tipo: 'TEXTO' | 'EVENTO'; eventoFecha: string | null; eventoAforo: number | null; eventoLugar: string | null;
} {
  if (!draft.activo || !draft.fecha) return { tipo: 'TEXTO', eventoFecha: null, eventoAforo: null, eventoLugar: null };
  const aforo = Number(draft.aforo);
  return {
    tipo: 'EVENTO',
    eventoFecha: new Date(draft.fecha).toISOString(),
    eventoAforo: draft.aforo.trim() && Number.isFinite(aforo) && aforo > 0 ? Math.floor(aforo) : null,
    eventoLugar: draft.lugar.trim() || null,
  };
}

function EventoCampos({
  draft,
  onChange,
  showFechaError,
}: {
  draft: EventDraft;
  onChange: (next: EventDraft) => void;
  showFechaError: boolean;
}) {
  return (
    <div className="mt-3 pl-12 space-y-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={draft.activo}
          onChange={v => onChange({ ...draft, activo: v })}
          label="Es un evento"
        />
        <span className="text-[13px] font-medium text-foreground">Es un evento</span>
      </div>

      {draft.activo && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="sm:col-span-1">
            <Label htmlFor="evento-fecha" className="mb-1 text-[12px] text-muted-foreground">Fecha y hora *</Label>
            <Input
              id="evento-fecha"
              type="datetime-local"
              value={draft.fecha}
              onChange={e => onChange({ ...draft, fecha: e.target.value })}
              className="rounded-lg bg-card text-[13px]"
              aria-invalid={showFechaError && !draft.fecha}
            />
            {showFechaError && !draft.fecha && (
              <p className="mt-1 text-[11px] text-destructive">La fecha del evento es obligatoria.</p>
            )}
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="evento-lugar" className="mb-1 text-[12px] text-muted-foreground">Lugar</Label>
            <Input
              id="evento-lugar"
              type="text"
              placeholder="Opcional"
              value={draft.lugar}
              onChange={e => onChange({ ...draft, lugar: e.target.value })}
              className="rounded-lg bg-card text-[13px]"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="evento-aforo" className="mb-1 text-[12px] text-muted-foreground">Aforo</Label>
            <Input
              id="evento-aforo"
              type="number"
              min={1}
              placeholder="Sin límite"
              value={draft.aforo}
              onChange={e => onChange({ ...draft, aforo: e.target.value })}
              className="rounded-lg bg-card text-[13px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  initials,
  studio = false,
  colorClass,
  size = 'md',
}: {
  initials: string;
  studio?: boolean;
  colorClass?: string;
  size?: 'sm' | 'md';
}) {
  const dims = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-[12px]';
  if (studio) {
    return (
      <div className={cn('rounded-full bg-primary flex items-center justify-center shrink-0', dims)}>
        <span className="font-bold text-primary-foreground" style={{ fontSize: size === 'sm' ? 10 : 12 }}>TE</span>
      </div>
    );
  }
  return (
    <div className={cn('rounded-full flex items-center justify-center shrink-0 font-bold', dims, colorClass ?? 'bg-muted text-foreground')}>
      {initials}
    </div>
  );
}

// ─── Comment thread ───────────────────────────────────────────────────────────

function CommentThread({
  postId,
  comments,
  onAddComment,
}: {
  postId: string;
  comments: Comment[];
  onAddComment: (postId: string, texto: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function handleSubmit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddComment(postId, trimmed);
    setDraft('');
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-3">
      {/* Existing comments */}
      {comments.length === 0 && (
        <p className="text-[12px] text-muted-foreground pl-1">Sin comentarios aún. ¡Sé la primera!</p>
      )}
      {comments.map((c, i) => (
        <div key={c.id} className="flex items-start gap-2">
          <Avatar
            initials={c.autorNombre === 'Tentare' ? 'TE' : getInitials(c.autorNombre)}
            studio={c.autorNombre === 'Tentare'}
            colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]}
            size="sm"
          />
          <div className="flex-1 min-w-0 bg-muted rounded-lg px-3 py-2">
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-[12px] font-semibold text-foreground">{c.autorNombre}</span>
              <span className="text-[11px] text-muted-foreground">{timeAgo(c.creadoEn)}</span>
            </div>
            <p className="text-[13px] text-foreground leading-relaxed">{c.texto}</p>
          </div>
        </div>
      ))}

      {/* New comment input */}
      <div className="flex items-start gap-2 pt-1">
        <Avatar initials="TE" studio size="sm" />
        <div className="flex-1 flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Escribe un comentario..."
            rows={1}
            className="flex-1 px-3 py-2 rounded-lg border border-border text-[12px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors resize-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!draft.trim()}
            className={cn(
              'px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors shrink-0',
              draft.trim()
                ? 'bg-brand text-brand-foreground hover:brightness-95'
                : 'bg-border text-muted-foreground cursor-not-allowed'
            )}
          >
            Comentar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  colorClass,
  onLike,
  liked,
  comments,
  isExpanded,
  onToggleComments,
  onAddComment,
}: {
  post: PostComunidad;
  colorClass: string;
  onLike: (id: string) => void;
  liked: boolean;
  comments: Comment[];
  isExpanded: boolean;
  onToggleComments: (id: string) => void;
  onAddComment: (postId: string, texto: string) => void;
}) {
  const isStudio = post.autorId === null;
  // Los comentarios ahora se cargan reales de la BD: si el post tiene alguno, ese
  // es el recuento honesto. Si no hay ninguno cargado, se respeta el contador
  // sembrado (posts de demo antiguos) para no mostrar 0 de golpe. Antes se sumaban
  // ambos, lo que duplicaría al recargar (el comentario contaba dos veces).
  const totalComments = comments.length > 0 ? comments.length : (post.comentariosCount ?? 0);

  return (
    <div className={cn(
      'bg-card border border-border rounded-xl p-4',
      post.fijado && 'border-warning/40 bg-amber-50/30'
    )}>
      {/* Pinned badge */}
      {post.fijado && (
        <div className="flex items-center gap-1 text-[11px] text-warning font-medium mb-2">
          <Pin size={11} />
          Fijado
        </div>
      )}

      {/* Author row */}
      <div className="flex items-start gap-3 mb-3">
        <Avatar
          initials={isStudio ? 'TE' : getInitials(post.autorNombre)}
          studio={isStudio}
          colorClass={colorClass}
        />
        <div>
          <p className="text-[13px] font-semibold text-foreground">{post.autorNombre}</p>
          <p className="text-[12px] text-muted-foreground">{timeAgo(post.creadoEn)}</p>
        </div>
      </div>

      {/* Event badge + details */}
      {post.tipo === 'EVENTO' && (
        <div className="mb-3 rounded-lg border border-brand/30 bg-brand/5 p-3 space-y-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand text-brand-foreground text-[10.5px] font-semibold px-2 py-0.5 uppercase tracking-wide">
            <CalendarDays size={11} /> Evento
          </span>
          {post.eventoFecha && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-foreground capitalize">
              <CalendarDays size={12} className="text-muted-foreground shrink-0" />
              {formatoFechaEvento(post.eventoFecha)}
            </p>
          )}
          {post.eventoLugar && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-foreground">
              <MapPin size={12} className="text-muted-foreground shrink-0" />
              {post.eventoLugar}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <Users size={12} className="shrink-0" />
            {post.eventoAforo
              ? `Aforo: ${post.eventoAforo}`
              : 'Sin límite de aforo'}
          </p>
        </div>
      )}

      {/* Text */}
      <p className="text-[14px] text-foreground leading-relaxed mb-3">
        {post.texto}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t border-border">
        <button
          onClick={() => onLike(post.id)}
          className={cn(
            'flex items-center gap-1.5 text-[12px] transition-colors group',
            liked ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'
          )}
        >
          <Heart
            size={14}
            className={cn(
              'transition-colors',
              liked ? 'fill-destructive text-destructive' : 'group-hover:fill-destructive group-hover:text-destructive'
            )}
          />
          <span>{post.likes}</span>
        </button>
        <button
          onClick={() => onToggleComments(post.id)}
          className={cn(
            'flex items-center gap-1.5 text-[12px] transition-colors',
            isExpanded ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <MessageCircle size={14} className={isExpanded ? 'fill-foreground/10' : ''} />
          <span>{totalComments}</span>
        </button>
      </div>

      {/* Expandable comment thread */}
      {isExpanded && (
        <CommentThread
          postId={post.id}
          comments={comments}
          onAddComment={onAddComment}
        />
      )}
    </div>
  );
}

// ─── New post modal ───────────────────────────────────────────────────────────

function NewPostModal({
  onClose,
  onPost,
}: {
  onClose: () => void;
  onPost: (texto: string, evento: EventDraft) => void;
}) {
  const [texto, setTexto] = useState('');
  const [mediaTooltip, setMediaTooltip] = useState<'foto' | 'video' | null>(null);
  const [evento, setEvento] = useState<EventDraft>(eventoDraftVacio());
  const [intentoEnviar, setIntentoEnviar] = useState(false);

  function showTooltip(type: 'foto' | 'video') {
    setMediaTooltip(type);
    setTimeout(() => setMediaTooltip(null), 2000);
  }

  const puedeEnviar = Boolean(texto.trim()) && (!evento.activo || Boolean(evento.fecha));

  function handleSubmit() {
    setIntentoEnviar(true);
    if (!puedeEnviar) return;
    onPost(texto.trim(), evento);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[16px] font-semibold text-foreground">Nueva publicación</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-start gap-3">
            <Avatar initials="PB" studio />
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Comparte algo con la comunidad..."
              rows={5}
              className="flex-1 px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors resize-none"
              autoFocus
            />
          </div>

          {/* Media action buttons */}
          <div className="flex items-center gap-3 mt-3 pl-12">
            <div className="relative">
              <button
                onClick={() => showTooltip('foto')}
                disabled
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground cursor-not-allowed select-none"
              >
                <ImageIcon size={13} />
                Foto
              </button>
              {mediaTooltip === 'foto' && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap bg-brand text-brand-foreground text-[11px] px-2 py-1 rounded-md shadow">
                  Próximamente disponible
                </span>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => showTooltip('video')}
                disabled
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground cursor-not-allowed select-none"
              >
                <Video size={13} />
                Vídeo
              </button>
              {mediaTooltip === 'video' && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap bg-brand text-brand-foreground text-[11px] px-2 py-1 rounded-md shadow">
                  Próximamente disponible
                </span>
              )}
            </div>
          </div>

          <EventoCampos draft={evento} onChange={setEvento} showFechaError={intentoEnviar} />
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-border bg-card text-[13px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!puedeEnviar}
            className={cn(
              'flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors',
              puedeEnviar
                ? 'bg-brand text-brand-foreground hover:brightness-95'
                : 'bg-border text-muted-foreground cursor-not-allowed'
            )}
          >
            Publicar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComunidadPage() {
  const { postsComunidad: posts, addPost, toggleLikePost, likedPostIds, socios, sesiones, reservas, tiposClase, dataLoaded } = useStudio();
  const [modalOpen, setModalOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeEvento, setComposeEvento] = useState<EventDraft>(eventoDraftVacio());
  const [composeIntentoEnviar, setComposeIntentoEnviar] = useState(false);

  // Comments state — se hidrata desde la BD (antes solo vivía en memoria y se
  // perdía al refrescar). Se agrupa por postId para pintarlo bajo cada post.
  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({});
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dataLoaded) return;
    let vivo = true;
    dbListComentariosComunidad().then(comentarios => {
      if (!vivo) return;
      const mapa: Record<string, Comment[]> = {};
      for (const c of comentarios) {
        (mapa[c.postId] ??= []).push({ id: c.id, autorNombre: c.autorNombre, texto: c.texto, creadoEn: c.creadoEn });
      }
      setCommentsMap(mapa);
    });
    return () => { vivo = false; };
  }, [dataLoaded]);

  const memberCount = socios.filter(s => s.activo).length;

  // Active members from context (up to 8)
  const activeSocias = socios.filter(s => s.activo).slice(0, 8);

  // ── Próximos eventos (derivados de sesiones reales) ─────────────────────────
  const ahora = new Date();
  const proximosEventos = sesiones
    .filter(s => !s.cancelada && new Date(s.inicio) > ahora)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 4)
    .map(s => {
      const tipo = tiposClase.find(t => t.id === s.tipoClaseId);
      return {
        titulo: tipo?.nombre ?? 'Clase',
        cuando: new Date(s.inicio).toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
      };
    });

  // ── Logros del mes (derivados de datos reales; se ocultan si no hay dato) ────
  const logrosMes: { emoji: string; titulo: string; subtitulo: string }[] = [];
  {
    const mes = ahora.getMonth(), anio = ahora.getFullYear();
    // Clase más popular por asistencia este mes
    const conteo = new Map<string, number>();
    for (const r of reservas) {
      if (r.estado !== 'ASISTIDA') continue;
      const s = sesiones.find(x => x.id === r.sesionId);
      if (!s) continue;
      const d = new Date(s.inicio);
      if (d.getMonth() !== mes || d.getFullYear() !== anio) continue;
      conteo.set(s.tipoClaseId, (conteo.get(s.tipoClaseId) ?? 0) + 1);
    }
    const top = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const tipo = tiposClase.find(t => t.id === top[0]);
      logrosMes.push({ emoji: '🏆', titulo: 'Clase más popular', subtitulo: `${tipo?.nombre ?? 'Clase'} · ${top[1]} asistencia${top[1] !== 1 ? 's' : ''}` });
    }
    // Retención (activas / total)
    if (socios.length > 0) {
      const pct = Math.round((socios.filter(s => s.activo).length / socios.length) * 100);
      logrosMes.push({ emoji: '🎯', titulo: 'Tasa de socias activas', subtitulo: `${pct}% (${socios.filter(s => s.activo).length} de ${socios.length})` });
    }
    // Nueva socia (alta más reciente)
    const nueva = [...socios].sort((a, b) => (b.fechaAlta ?? '').localeCompare(a.fechaAlta ?? ''))[0];
    if (nueva) {
      logrosMes.push({ emoji: '⭐', titulo: 'Última alta', subtitulo: `${nueva.nombre} ${nueva.apellidos}` });
    }
  }

  // Sort: pinned first, then by date
  const sortedPosts = [...posts].sort((a, b) => {
    if (a.fijado && !b.fijado) return -1;
    if (!a.fijado && b.fijado) return 1;
    return new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime();
  });

  // Top 3 most active (by likes + comments)
  const topMiembros = [...posts]
    .filter(p => p.autorId !== null)
    .sort((a, b) => (b.likes + b.comentariosCount) - (a.likes + a.comentariosCount))
    .slice(0, 3);

  function handleQuickPost() {
    setComposeIntentoEnviar(true);
    if (!composeText.trim()) return;
    if (composeEvento.activo && !composeEvento.fecha) return;
    addPost(composeText.trim(), eventoDraftAOpts(composeEvento));
    setComposeText('');
    setComposeEvento(eventoDraftVacio());
    setComposeIntentoEnviar(false);
  }

  function handleToggleComments(postId: string) {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  async function handleAddComment(postId: string, texto: string) {
    // Optimista: se pinta al momento con un id temporal y se persiste; al volver
    // del servidor se sustituye por la fila real (o se revierte si falla).
    const tempId = `temp-${Date.now()}`;
    // Nombre provisional; al volver del servidor se reconcilia con el autor real.
    const optimista: Comment = { id: tempId, autorNombre: 'Tú', texto, creadoEn: new Date().toISOString() };
    setCommentsMap(prev => ({ ...prev, [postId]: [...(prev[postId] ?? []), optimista] }));

    const guardado = await dbAddComentarioComunidad(postId, texto);
    setCommentsMap(prev => {
      const lista = prev[postId] ?? [];
      const reconciliada = guardado
        ? lista.map(c => (c.id === tempId ? { id: guardado.id, autorNombre: guardado.autorNombre, texto: guardado.texto, creadoEn: guardado.creadoEn } : c))
        : lista.filter(c => c.id !== tempId); // falló → se revierte
      return { ...prev, [postId]: reconciliada };
    });
  }

  return (
    <div className="space-y-6">

      <PageHeader
        title="Comunidad"
        badge={
          <span className="px-2 py-0.5 rounded-full bg-card border border-border text-[12px] text-muted-foreground">
            {memberCount} clientes
          </span>
        }
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[13px] font-medium hover:brightness-95 transition-colors"
          >
            Nueva publicación
          </button>
        }
      />

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* Main feed (65%) */}
        <div className="lg:w-[65%] space-y-4">

          {/* Compose box */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Avatar initials="PB" studio />
              <div className="flex-1">
                <textarea
                  value={composeText}
                  onChange={e => setComposeText(e.target.value)}
                  placeholder="Comparte algo con la comunidad..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-border text-[13px] placeholder:text-muted-foreground text-foreground outline-none focus:border-foreground transition-colors resize-none"
                />
                <EventoCampos draft={composeEvento} onChange={setComposeEvento} showFechaError={composeIntentoEnviar} />
                {composeText.trim() && (
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handleQuickPost}
                      className="px-4 py-1.5 rounded-lg bg-brand text-brand-foreground text-[13px] font-medium hover:brightness-95 transition-colors"
                    >
                      Publicar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Posts */}
          {sortedPosts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]}
              onLike={toggleLikePost}
              liked={likedPostIds.has(post.id)}
              comments={commentsMap[post.id] ?? []}
              isExpanded={expandedPosts.has(post.id)}
              onToggleComments={handleToggleComments}
              onAddComment={handleAddComment}
            />
          ))}
        </div>

        {/* Sidebar (35%) */}
        <div className="lg:w-[35%] space-y-4">

          {/* Destacado este mes */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-[14px] font-semibold text-foreground mb-3">Destacadas este mes</h3>
            <div className="space-y-3">
              {topMiembros.length === 0 && (
                <p className="text-[13px] text-muted-foreground">Sin actividad aún</p>
              )}
              {topMiembros.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="text-[13px] font-bold text-muted-foreground w-4">{i + 1}</span>
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0', AVATAR_COLORS[i])}>
                    {getInitials(p.autorNombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{p.autorNombre}</p>
                    <p className="text-[11px] text-muted-foreground">{p.likes + p.comentariosCount} interacciones</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Próximos eventos */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-[14px] font-semibold text-foreground mb-3">Próximos eventos</h3>
            <div className="space-y-2">
              {proximosEventos.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No hay clases programadas próximamente</p>
              ) : proximosEventos.map((ev, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                  <div className="w-2 h-2 rounded-full bg-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{ev.titulo}</p>
                    <p className="text-[12px] text-muted-foreground capitalize">{ev.cuando}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Clientes activos */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-[14px] font-semibold text-foreground mb-3">Clientes activos</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {activeSocias.map((socio, i) => {
                const ini = getInitials(socio.nombre);
                return (
                  <div key={socio.id} className="flex flex-col items-center gap-1">
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold', AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                      {ini}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate w-full text-center">{ini}</span>
                  </div>
                );
              })}
              {activeSocias.length === 0 && (
                <p className="col-span-4 text-[13px] text-muted-foreground">Sin clientes activos</p>
              )}
            </div>
          </div>

          {/* Logros del mes */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-[14px] font-semibold text-foreground mb-3">Logros del mes</h3>
            <div className="space-y-3">
              {logrosMes.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Aún no hay datos suficientes este mes</p>
              ) : logrosMes.map((logro, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-[20px] leading-none mt-0.5">{logro.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{logro.titulo}</p>
                    <p className="text-[12px] text-muted-foreground">{logro.subtitulo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* New post modal */}
      {modalOpen && (
        <NewPostModal
          onClose={() => setModalOpen(false)}
          onPost={(texto, evento) => addPost(texto, eventoDraftAOpts(evento))}
        />
      )}
    </div>
  );
}
