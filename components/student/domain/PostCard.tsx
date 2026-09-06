'use client';

import { useState } from 'react';
import type { ComentarioTablon, Post } from '@/lib/student/tipos';
import { relativo } from '@/lib/student/formato';
import { estadoEvento, plazasTexto, puedeApuntarse } from '@/lib/student/comunidad-reglas';
import { rsvpEvento, toggleLikePost, fetchComentarios, postComentario } from '@/lib/student/comunidad';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { Badge } from '@/components/student/ui/Badge';

// Una publicación del tablón. Mismo idioma que NotificationItem: avatar
// redondo, título en 800, cuerpo en t-meta, fecha relativa en t-mono.
//
// P2 (pedido expreso tras verlo en producción — "nadie puede dar like, nadie
// puede comentar"): el corazón y el contador de comentarios eran de solo
// lectura en P1 ("pintar un control que no guarda nada"). Ahora sí guardan —
// mismo patrón optimista-con-vuelta-atrás que el RSVP de abajo. El hilo de
// comentarios se pide bajo demanda (al abrirlo), no de golpe con el tablón
// entero: una socia con 40 posts en su feed no necesita 40 fetches de
// comentarios que probablemente no va a leer.

function fechaEvento(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const h = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${f.charAt(0).toUpperCase()}${f.slice(1)} · ${h}`;
}

export function PostCard({ post, studioId, delay = 0, ahora = new Date() }: { post: Post; studioId: string; delay?: number; ahora?: Date }) {
  const { toast } = useToast();
  // Optimista y con vuelta atrás: el servidor decide si hay plaza.
  const [local, setLocal] = useState<{ apuntada: boolean; total: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const apuntada = local?.apuntada ?? post.apuntada;
  const total = local?.total ?? post.totalAsistentes ?? 0;
  const vista = { ...post, totalAsistentes: total };
  const esEvento = post.tipo === 'EVENTO';
  const estado = esEvento ? estadoEvento(vista, ahora) : null;

  const alternar = async () => {
    if (ocupado) return;
    const siguiente = !apuntada;
    setOcupado(true);
    setLocal({ apuntada: siguiente, total: Math.max(0, total + (siguiente ? 1 : -1)) });
    const r = await rsvpEvento(studioId, post.id, siguiente);
    setOcupado(false);
    if (!r.ok) { setLocal({ apuntada, total }); toast(r.error); return; }
    setLocal({ apuntada: r.apuntada, total: r.totalAsistentes });
    toast(r.apuntada ? '¡Apuntada! Te esperamos.' : 'Te has borrado del evento.');
  };

  // ── Me gusta ────────────────────────────────────────────────────────────
  const [likeLocal, setLikeLocal] = useState<{ liked: boolean; likes: number } | null>(null);
  const [likeOcupado, setLikeOcupado] = useState(false);
  const liked = likeLocal?.liked ?? post.likedByMe;
  const likes = likeLocal?.likes ?? post.likes;

  const alternarLike = async () => {
    if (likeOcupado) return;
    const siguiente = !liked;
    setLikeOcupado(true);
    setLikeLocal({ liked: siguiente, likes: Math.max(0, likes + (siguiente ? 1 : -1)) });
    const r = await toggleLikePost(studioId, post.id);
    setLikeOcupado(false);
    if (!r.ok) { setLikeLocal({ liked, likes }); toast(r.error); return; }
    setLikeLocal({ liked: r.liked, likes: r.likes });
  };

  // ── Comentarios ─────────────────────────────────────────────────────────
  const [comentariosAbiertos, setComentariosAbiertos] = useState(false);
  const [comentarios, setComentarios] = useState<ComentarioTablon[] | null>(null);
  const [cargandoComentarios, setCargandoComentarios] = useState(false);
  const [borrador, setBorrador] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const totalComentarios = comentarios?.length ?? post.comentariosCount;

  const abrirComentarios = async () => {
    const siguiente = !comentariosAbiertos;
    setComentariosAbiertos(siguiente);
    if (siguiente && comentarios === null) {
      setCargandoComentarios(true);
      const r = await fetchComentarios(studioId, post.id);
      setCargandoComentarios(false);
      if (r === null) { toast('No se han podido cargar los comentarios.'); return; }
      setComentarios(r);
    }
  };

  const enviarComentario = async () => {
    const texto = borrador.trim();
    if (!texto || enviandoComentario) return;
    setEnviandoComentario(true);
    const r = await postComentario(studioId, post.id, texto);
    setEnviandoComentario(false);
    if (!r.ok) { toast(r.error); return; }
    setComentarios(prev => [...(prev ?? []), r.comentario]);
    setBorrador('');
  };

  return (
    <article className="card a-up" data-testid="post" data-tipo={post.tipo} style={{ padding: '13px 14px', animationDelay: `${delay}ms` }}>
      <div style={{ display: 'flex', gap: 11 }}>
        <span aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{post.autorInicial}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>{post.autorNombre}</p>
          <p className="t-mono" style={{ margin: '2px 0 0', fontSize: 9.5, color: 'var(--subtle-foreground)' }}>{relativo(post.creadoEn)}</p>
        </div>
        {esEvento && <span style={{ alignSelf: 'flex-start' }}><Badge tone="neutral">Evento</Badge></span>}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.texto}</p>
      {post.imagenUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imagenUrl} alt="" style={{ display: 'block', width: '100%', marginTop: 10, borderRadius: 12, objectFit: 'cover', maxHeight: 260 }} />
      )}

      {esEvento && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
          {post.eventoFecha && <p style={{ margin: 0, fontWeight: 800 }}>{fechaEvento(post.eventoFecha)}</p>}
          {post.eventoLugar && <p className="t-meta" style={{ margin: 0 }}>{post.eventoLugar}</p>}
          <p className="t-meta" style={{ margin: 0 }}>
            {plazasTexto(vista)}{estado === 'completo' && !apuntada ? ' · Completo' : ''}{estado === 'pasado' ? ' · Ya celebrado' : ''}
          </p>
          {puedeApuntarse(vista, apuntada, ahora) && (
            <div style={{ marginTop: 6 }}>
              <Button size="sm" variant={apuntada ? 'secondary' : 'primary'} onClick={() => void alternar()} disabled={ocupado} aria-pressed={apuntada}>
                {apuntada ? 'Ya no voy' : 'Me apunto'}
              </Button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <button
          type="button"
          onClick={() => void alternarLike()}
          disabled={likeOcupado}
          aria-pressed={liked}
          aria-label={liked ? 'Quitar me gusta' : 'Me gusta'}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderRadius: 999, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
            color: liked ? 'var(--destructive)' : 'var(--subtle-foreground)',
          }}
        >
          <span aria-hidden style={{ fontSize: 14 }}>{liked ? '♥' : '♡'}</span>
          {likes > 0 ? ` ${likes}` : 'Me gusta'}
        </button>
        <button
          type="button"
          onClick={() => void abrirComentarios()}
          aria-expanded={comentariosAbiertos}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderRadius: 999, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--subtle-foreground)',
          }}
        >
          <span aria-hidden style={{ fontSize: 13 }}>💬</span>
          {totalComentarios > 0 ? `${totalComentarios} comentario${totalComentarios === 1 ? '' : 's'}` : 'Comentar'}
        </button>
      </div>

      {comentariosAbiertos && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cargandoComentarios && <p className="t-meta" style={{ margin: 0 }}>Cargando…</p>}
          {!cargandoComentarios && comentarios?.length === 0 && (
            <p className="t-meta" style={{ margin: 0 }}>Todavía no hay comentarios.</p>
          )}
          {comentarios?.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8 }}>
              <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 999, background: 'var(--muted)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.autorInicial ?? '?'}
              </span>
              <div style={{ flex: 1, minWidth: 0, background: 'var(--muted)', borderRadius: 12, padding: '7px 10px' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800 }}>
                  {c.autorNombre} {c.esMio && <span className="t-meta" style={{ fontWeight: 600 }}>(tú)</span>}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.texto}</p>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <textarea
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviarComentario(); }
              }}
              rows={1}
              placeholder="Escribe un comentario…"
              aria-label="Escribe un comentario"
              className="input"
              style={{ flex: 1, resize: 'none', fontSize: 12.5, minHeight: 36, padding: '8px 10px' }}
            />
            <Button size="sm" onClick={() => void enviarComentario()} loading={enviandoComentario} disabled={!borrador.trim()}>
              Enviar
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
