'use client';

// COMUNIDAD — el feed del estudio, lado STAFF.
//
// Esta pantalla tiene los DATOS; la pintura (compositor, tarjeta de post,
// esqueleto, vacío) vive en `components/comunidad/feed-panel.tsx`.
//
// Nada de backend cambia aquí: se publica por `addPost` (que pasa por
// `/api/comunidad/posts`, la única vía que dispara el fan-out de notificación)
// y la imagen se sube al bucket `comunidad-media` que ya existía —
// `/api/comunidad/posts` descarta cualquier `imagenUrl` de otro origen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { dbListComentariosComunidad, dbAddComentarioComunidad } from '@/lib/supabase-data';
import { resolverDestinatariasCampana, SEGMENTOS_AUDIENCIA } from '@/lib/marketing/segmentos';
import { subirImagenPostComunidad } from '@/lib/portal-storage';
import type { DestinatariosCampana } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import {
  AVATAR_COLORS, Avatar, CompositorPost, FeedVacio, PostCardPanel, SkeletonPostPanel,
  getInitials, timeAgo, type OpcionesPublicar,
} from '@/components/comunidad/feed-panel';

type Comment = { id: string; autorNombre: string; texto: string; creadoEn: string };

// Cuántos posts se pintan de una y cuántos se añaden al llegar al final. El
// feed del panel ya viene entero en memoria (el contexto lo carga con el resto
// del estudio), así que el scroll infinito no pide nada al servidor: evita
// montar 300 tarjetas de golpe en un estudio con historial.
const PAGINA = 8;

export default function ComunidadPage() {
  const {
    postsComunidad: posts, addPost, toggleLikePost, likedPostIds,
    socios, suscripciones, recibos, sesiones, reservas, tiposClase, dataLoaded, studio,
  } = useStudio();

  const [commentsMap, setCommentsMap] = useState<Record<string, Comment[]>>({});
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [visibles, setVisibles] = useState(PAGINA);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);
  const centinela = useRef<HTMLDivElement | null>(null);
  const compositorRef = useRef<HTMLDivElement | null>(null);

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

  // Fijados primero, después por fecha.
  const sortedPosts = useMemo(() => [...posts].sort((a, b) => {
    if (a.fijado !== b.fijado) return a.fijado ? -1 : 1;
    return new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime();
  }), [posts]);

  // Scroll infinito sobre la lista ya cargada. Mismo patrón que el feed de la
  // socia (IntersectionObserver + `rootMargin`), aunque aquí lo que se "pide"
  // es solo pintar más.
  useEffect(() => {
    const nodo = centinela.current;
    if (!nodo || visibles >= sortedPosts.length) return;
    const io = new IntersectionObserver(
      e => { if (e.some(x => x.isIntersecting)) setVisibles(v => v + PAGINA); },
      { rootMargin: '500px 0px' },
    );
    io.observe(nodo);
    return () => io.disconnect();
  }, [visibles, sortedPosts.length]);

  // Cuántas clientas hay en cada audiencia — con los datos reales que la
  // pantalla ya tiene. Sin esto, elegir "Se les caduca el bono" era elegir a
  // ciegas: puede que no haya ninguna.
  const recuentoAudiencia = useMemo(() => {
    if (!dataLoaded) return {};
    const mapa: Partial<Record<DestinatariosCampana, number>> = {};
    for (const seg of SEGMENTOS_AUDIENCIA) {
      mapa[seg.id] = resolverDestinatariasCampana(seg.id, { socios, suscripciones, recibos }).length;
    }
    return mapa;
  }, [dataLoaded, socios, suscripciones, recibos]);

  const memberCount = socios.filter(s => s.activo).length;
  const activeSocias = socios.filter(s => s.activo).slice(0, 8);
  const inicialesEstudio = studio?.nombre ? getInitials(studio.nombre) : 'TE';

  // ── Próximos eventos (derivados de sesiones reales) ────────────────────────
  const ahora = useMemo(() => new Date(), []);
  const proximosEventos = useMemo(() => sesiones
    .filter(s => !s.cancelada && new Date(s.inicio) > ahora)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 4)
    .map(s => ({
      id: s.id,
      titulo: tiposClase.find(t => t.id === s.tipoClaseId)?.nombre ?? 'Clase',
      cuando: new Date(s.inicio).toLocaleDateString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
    })), [sesiones, tiposClase, ahora]);

  // ── Logros del mes (derivados de datos reales; se ocultan si no hay dato) ──
  const logrosMes = useMemo(() => {
    const out: { emoji: string; titulo: string; subtitulo: string }[] = [];
    const mes = ahora.getMonth(), anio = ahora.getFullYear();
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
      out.push({ emoji: '🏆', titulo: 'Clase más popular', subtitulo: `${tipo?.nombre ?? 'Clase'} · ${top[1]} asistencia${top[1] !== 1 ? 's' : ''}` });
    }
    if (socios.length > 0) {
      const activas = socios.filter(s => s.activo).length;
      out.push({ emoji: '🎯', titulo: 'Tasa de socias activas', subtitulo: `${Math.round((activas / socios.length) * 100)}% (${activas} de ${socios.length})` });
    }
    const nueva = [...socios].sort((a, b) => (b.fechaAlta ?? '').localeCompare(a.fechaAlta ?? ''))[0];
    if (nueva) out.push({ emoji: '⭐', titulo: 'Última alta', subtitulo: `${nueva.nombre} ${nueva.apellidos}` });
    return out;
  }, [reservas, sesiones, tiposClase, socios, ahora]);

  const topMiembros = useMemo(() => [...posts]
    .filter(p => p.autorId !== null)
    .sort((a, b) => (b.likes + b.comentariosCount) - (a.likes + a.comentariosCount))
    .slice(0, 3), [posts]);

  // ── Acciones ───────────────────────────────────────────────────────────────

  async function handleElegirImagen(file: File) {
    if (!studio?.id) return;
    setErrorImagen(null);
    setSubiendoImagen(true);
    // El id del fichero no es el del post (todavía no existe): basta con que
    // sea único dentro de la carpeta del estudio.
    const r = await subirImagenPostComunidad(studio.id, `post-${Date.now()}`, file);
    setSubiendoImagen(false);
    if ('error' in r) { setErrorImagen(r.error); return; }
    setImagenUrl(r.url);
  }

  function handlePublicar(texto: string, opts: OpcionesPublicar) {
    addPost(texto, opts);
    setImagenUrl(null);
    setVisibles(v => Math.max(v, PAGINA));
  }

  function handleToggleComments(postId: string) {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId); else next.add(postId);
      return next;
    });
  }

  async function handleAddComment(postId: string, texto: string) {
    // Optimista: se pinta al momento con un id temporal y se persiste; al volver
    // del servidor se sustituye por la fila real (o se revierte si falla).
    const tempId = `temp-${Date.now()}`;
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

  const aPintar = sortedPosts.slice(0, visibles);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunidad"
        description="Lo que publiques aquí lo verán tus clientas en su portal."
        badge={
          <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[12px] text-muted-foreground">
            {memberCount} clientas activas
          </span>
        }
      />

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* ── Feed ──────────────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:w-[65%]">
          <div ref={compositorRef}>
            <CompositorPost
              inicialesEstudio={inicialesEstudio}
              recuentoAudiencia={recuentoAudiencia}
              subiendoImagen={subiendoImagen}
              imagenUrl={imagenUrl}
              errorImagen={errorImagen}
              onElegirImagen={file => void handleElegirImagen(file)}
              onQuitarImagen={() => { setImagenUrl(null); setErrorImagen(null); }}
              onPublicar={handlePublicar}
              publicando={false}
            />
          </div>

          {!dataLoaded && (
            <div className="space-y-4">
              <SkeletonPostPanel conImagen />
              <SkeletonPostPanel />
              <SkeletonPostPanel />
            </div>
          )}

          {dataLoaded && sortedPosts.length === 0 && (
            <FeedVacio
              onEmpezar={() => {
                compositorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                compositorRef.current?.querySelector('textarea')?.focus();
              }}
            />
          )}

          {dataLoaded && aPintar.map((post, i) => {
            const comentarios = commentsMap[post.id] ?? [];
            // Si hay comentarios cargados, ese es el recuento honesto; si no,
            // se respeta el contador sembrado (posts de demo antiguos). Sumar
            // ambos duplicaría al recargar.
            const total = comentarios.length > 0 ? comentarios.length : (post.comentariosCount ?? 0);
            return (
              <PostCardPanel
                key={post.id}
                post={post}
                indice={i % PAGINA}
                colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                liked={likedPostIds.has(post.id)}
                comentarios={total}
                expandido={expandedPosts.has(post.id)}
                onLike={toggleLikePost}
                onToggleComentarios={handleToggleComments}
              >
                <HiloComentarios
                  postId={post.id}
                  comments={comentarios}
                  inicialesEstudio={inicialesEstudio}
                  onAddComment={handleAddComment}
                />
              </PostCardPanel>
            );
          })}

          {dataLoaded && visibles < sortedPosts.length && (
            <div ref={centinela} className="space-y-4" aria-live="polite">
              <SkeletonPostPanel />
            </div>
          )}
        </div>

        {/* ── Lateral ───────────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:w-[35%]">
          <TarjetaLateral titulo="Destacadas este mes">
            {topMiembros.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Sin actividad todavía</p>
            ) : (
              <div className="space-y-3">
                {topMiembros.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="w-4 text-[13px] font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                    <Avatar initials={getInitials(p.autorNombre)} colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground">{p.autorNombre}</p>
                      <p className="text-[11.5px] text-muted-foreground">{p.likes + p.comentariosCount} interacciones</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TarjetaLateral>

          <TarjetaLateral titulo="Próximas clases">
            {proximosEventos.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No hay clases programadas próximamente</p>
            ) : (
              <div className="divide-y divide-border">
                {proximosEventos.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-foreground">{ev.titulo}</p>
                      <p className="text-[12px] capitalize text-muted-foreground">{ev.cuando}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TarjetaLateral>

          <TarjetaLateral titulo="Clientas activas">
            {activeSocias.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Sin clientas activas</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeSocias.map((socio, i) => (
                  <span
                    key={socio.id}
                    title={`${socio.nombre} ${socio.apellidos}`.trim()}
                    className={cn(
                      'flex size-10 items-center justify-center rounded-full text-[12px] font-bold',
                      AVATAR_COLORS[i % AVATAR_COLORS.length],
                    )}
                  >
                    {getInitials(socio.nombre)}
                  </span>
                ))}
              </div>
            )}
          </TarjetaLateral>

          <TarjetaLateral titulo="Logros del mes">
            {logrosMes.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Aún no hay datos suficientes este mes</p>
            ) : (
              <div className="space-y-3">
                {logrosMes.map(logro => (
                  <div key={logro.titulo} className="flex items-start gap-3">
                    <span aria-hidden className="mt-0.5 text-[20px] leading-none">{logro.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground">{logro.titulo}</p>
                      <p className="text-[12px] text-muted-foreground">{logro.subtitulo}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TarjetaLateral>
        </div>
      </div>
    </div>
  );
}

// ─── Lateral ────────────────────────────────────────────────────────────────

function TarjetaLateral({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

// ─── Hilo de comentarios ────────────────────────────────────────────────────

function HiloComentarios({
  postId,
  comments,
  inicialesEstudio,
  onAddComment,
}: {
  postId: string;
  comments: Comment[];
  inicialesEstudio: string;
  onAddComment: (postId: string, texto: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function enviar() {
    const limpio = draft.trim();
    if (!limpio) return;
    onAddComment(postId, limpio);
    setDraft('');
  }

  return (
    <div className="contenido-anim mt-3 space-y-3 border-t border-border pt-4">
      {comments.length === 0 && (
        <p className="text-[12.5px] text-muted-foreground">Todavía no hay comentarios.</p>
      )}
      {comments.map((c, i) => (
        <div key={c.id} className="flex items-start gap-2.5">
          <Avatar
            initials={getInitials(c.autorNombre)}
            colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]}
            size="sm"
          />
          <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-muted px-3.5 py-2.5">
            <div className="mb-0.5 flex items-baseline gap-2">
              <span className="text-[12.5px] font-bold text-foreground">{c.autorNombre}</span>
              <span className="text-[11px] text-muted-foreground">{timeAgo(c.creadoEn)}</span>
            </div>
            <p className="break-words text-[13px] leading-relaxed text-foreground">{c.texto}</p>
          </div>
        </div>
      ))}

      <div className="flex items-end gap-2.5 pt-1">
        <Avatar initials={inicialesEstudio} studio size="sm" />
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
          }}
          placeholder="Escribe un comentario…"
          aria-label="Escribe un comentario"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!draft.trim()}
          className={cn(
            'shrink-0 rounded-xl px-3.5 py-2.5 text-[12.5px] font-bold transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            draft.trim()
              ? 'bg-brand text-brand-foreground hover:brightness-95 active:scale-[.98]'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          Comentar
        </button>
      </div>
    </div>
  );
}
