'use client';

import { useState } from 'react';
import type { ComentarioTablon, Post } from '@/lib/student/tipos';
import { relativo } from '@/lib/student/formato';
import { estadoEvento, plazasTexto, puedeApuntarse } from '@/lib/student/comunidad-reglas';
import {
  bloquearAutoraComentario, borrarComentario, denunciarComentarioTablon, fetchComentarios, postComentario, rsvpEvento,
  toggleLikePost,
} from '@/lib/student/comunidad';
import { Sheet } from '@/components/student/ui/Sheet';
import { TEXTO_GRACIAS_DENUNCIA } from '@/lib/moderacion/denuncias';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { Badge } from '@/components/student/ui/Badge';
import { Foto } from '@/components/student/ui/Foto';
import { Icono } from '@/components/student/ui/Icono';
import { useNormasComunidad } from '@/components/student/domain/NormasComunidad';

// Una publicación del tablón. Mismo idioma que NotificationItem: avatar
// redondo, título en 800, cuerpo en t-meta, fecha relativa en voz baja.
//
// P2 (pedido expreso tras verlo en producción — "nadie puede dar like, nadie
// puede comentar"): el corazón y el contador de comentarios eran de solo
// lectura en P1 ("pintar un control que no guarda nada"). Ahora sí guardan —
// mismo patrón optimista-con-vuelta-atrás que el RSVP de abajo. El hilo de
// comentarios se pide bajo demanda (al abrirlo), no de golpe con el tablón
// entero: una socia con 40 posts en su feed no necesita 40 fetches de
// comentarios que probablemente no va a leer.
//
// Moderación (App Store 1.2): tocar un comentario abre sus opciones. El suyo se
// borra; el de otra persona se denuncia y, si es de una compañera, se la puede
// bloquear (con confirmación). Lo que se ve y quién puede qué lo decide el
// servidor; aquí solo se pinta lo que contesta. Una fijada por el estudio va
// arriba con la marca «Fijado».

function fechaEvento(iso: string): string {
  const d = new Date(iso);
  const f = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const h = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${f.charAt(0).toUpperCase()}${f.slice(1)} · ${h}`;
}

export function PostCard({ post, studioId, delay = 0, ahora = new Date() }: { post: Post; studioId: string; delay?: number; ahora?: Date }) {
  const { toast } = useToast();
  const { conNormas, hoja: hojaNormas } = useNormasComunidad();
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
    // Si faltan las normas de la comunidad, se enseñan y el mismo comentario se repite.
    const r = await conNormas(() => postComentario(studioId, post.id, texto));
    setEnviandoComentario(false);
    if (!r.ok) {
      if (r.codigo !== 'NORMAS_PENDIENTES') toast(r.error);
      return;
    }
    setComentarios(prev => [...(prev ?? []), r.comentario]);
    setBorrador('');
  };

  const [opciones, setOpciones] = useState<ComentarioTablon | null>(null);
  const trasModerar = async (c: ComentarioTablon, que: 'borrado' | 'bloqueada') => {
    if (que === 'borrado') { setComentarios(prev => (prev ?? []).filter(x => x.id !== c.id)); return; }
    // Bloqueada: dejan de verse sus comentarios; se relee lo que contesta el servidor.
    const r = await fetchComentarios(studioId, post.id);
    if (r) setComentarios(r);
  };

  return (
    <article className="card a-up" data-testid="post" data-tipo={post.tipo} style={{ padding: '13px 14px', animationDelay: `${delay}ms` }}>
      <div style={{ display: 'flex', gap: 11 }}>
        {post.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.logoUrl} alt="" aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, objectFit: 'cover' }} />
        ) : (
          <span aria-hidden style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 'var(--t-small)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{post.autorInicial}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 800, lineHeight: 1.35 }}>{post.autorNombre}</p>
          <p style={{ margin: '2px 0 0', fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--subtle-foreground)' }}>{relativo(post.creadoEn)}</p>
        </div>
        {post.fijado && <span style={{ alignSelf: 'flex-start' }} data-testid="post-fijado"><Badge tone="neutral">Fijado</Badge></span>}
        {esEvento && <span style={{ alignSelf: 'flex-start' }}><Badge tone="neutral">Evento</Badge></span>}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 'var(--t-body)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.texto}</p>
      {post.imagenUrl && (
        <Foto src={post.imagenUrl} ancho={540} alto={260} sizes="(min-width:1024px) 500px, 100vw" style={{ display: 'block', width: '100%', marginTop: 10, borderRadius: 12, objectFit: 'cover', maxHeight: 260 }} />
      )}

      {esEvento && (
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--t-small)' }}>
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
            background: 'transparent', cursor: 'pointer', fontSize: 'var(--t-small)', fontWeight: 700,
            color: liked ? 'var(--destructive)' : 'var(--subtle-foreground)',
          }}
        >
          <Icono nombre="favorito" tamano={18} fill={liked ? 'currentColor' : 'none'} />
          {likes > 0 ? likes : 'Me gusta'}
        </button>
        <button
          type="button"
          onClick={() => void abrirComentarios()}
          aria-expanded={comentariosAbiertos}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', borderRadius: 999, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--subtle-foreground)',
          }}
        >
          <Icono nombre="comentario" tamano={18} />
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
            <div
              key={c.id}
              data-testid="comentario"
              role="button"
              tabIndex={0}
              aria-label={c.esMio ? 'Opciones de tu comentario' : 'Opciones del comentario'}
              aria-haspopup="dialog"
              onClick={() => setOpciones(c)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpciones(c); } }}
              style={{ display: 'flex', gap: 8, cursor: 'pointer' }}
            >
              <span aria-hidden style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 999, background: 'var(--muted)', fontSize: 'var(--t-micro)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {c.autorInicial ?? '?'}
              </span>
              <div style={{ flex: 1, minWidth: 0, background: 'var(--muted)', borderRadius: 12, padding: '7px 10px' }}>
                <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 800 }}>
                  {c.autorNombre} {c.esMio && <span className="t-meta" style={{ fontWeight: 600 }}>(tú)</span>}
                  {c.oculto && <span className="t-meta" style={{ fontWeight: 600 }}> · Retirado por el estudio</span>}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--t-small)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.texto}</p>
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
              style={{ flex: 1, resize: 'none', fontSize: 'var(--t-small)', minHeight: 36, padding: '8px 10px' }}
            />
            <Button size="sm" onClick={() => void enviarComentario()} loading={enviandoComentario} disabled={!borrador.trim()}>
              Enviar
            </Button>
          </div>
        </div>
      )}
      {hojaNormas}
      {/* Montada solo mientras se usa: un `Sheet` cerrado sigue en el DOM. */}
      {opciones && (
        <HojaComentario
          comentario={opciones}
          studioId={studioId}
          onClose={() => setOpciones(null)}
          onHecho={(que) => void trasModerar(opciones, que)}
        />
      )}
    </article>
  );
}

/**
 * Lo que se puede hacer con un comentario. El suyo: borrarlo. El de otra
 * persona: denunciarlo al momento («Gracias. Lo revisaremos.») y, si es de una
 * compañera, bloquearla, que pide confirmación.
 */
function HojaComentario({ comentario, studioId, onClose, onHecho }: {
  comentario: ComentarioTablon;
  studioId: string;
  onClose: () => void;
  onHecho: (que: 'borrado' | 'bloqueada') => void;
}) {
  const { toast } = useToast();
  const [paso, setPaso] = useState<'opciones' | 'borrar' | 'bloquear'>('opciones');
  const [ocupado, setOcupado] = useState(false);

  const hacer = async (accion: 'borrar' | 'denunciar' | 'bloquear') => {
    setOcupado(true);
    const r = accion === 'borrar' ? await borrarComentario(studioId, comentario.id)
      : accion === 'denunciar' ? await denunciarComentarioTablon(studioId, comentario.id)
        : await bloquearAutoraComentario(studioId, comentario.id);
    setOcupado(false);
    if (!r.ok) { toast(r.error); return; }
    if (accion === 'borrar') { toast('Comentario borrado.'); onHecho('borrado'); }
    if (accion === 'denunciar') toast(r.mensaje ?? TEXTO_GRACIAS_DENUNCIA);
    if (accion === 'bloquear') { toast(`Has bloqueado a ${comentario.autorNombre}.`); onHecho('bloqueada'); }
    onClose();
  };

  return (
    <Sheet open onClose={onClose} label="Opciones del comentario">
      <div data-testid="hoja-comentario">
        {paso === 'opciones' && (
          <>
            <p className="t-meta" style={{ margin: 0, padding: '8px 12px', borderRadius: 12, background: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'hidden' }}>
              {comentario.texto}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {comentario.esMio ? (
                <Button full variant="danger" disabled={ocupado} onClick={() => setPaso('borrar')}>Borrar mi comentario</Button>
              ) : (
                <>
                  <Button full variant="secondary" loading={ocupado} onClick={() => void hacer('denunciar')}>Denunciar este comentario</Button>
                  {comentario.deAlumna && (
                    <Button full variant="danger" disabled={ocupado} onClick={() => setPaso('bloquear')}>Bloquear a {comentario.autorNombre}</Button>
                  )}
                </>
              )}
              <Button full variant="ghost" disabled={ocupado} onClick={onClose}>Cancelar</Button>
            </div>
          </>
        )}
        {paso === 'borrar' && (
          <>
            <h3 className="t-h2" style={{ margin: 0 }}>¿Borrar tu comentario?</h3>
            <p className="t-meta" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>Desaparece del tablón para todas. No se puede deshacer.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <Button full variant="danger" loading={ocupado} onClick={() => void hacer('borrar')}>Borrar</Button>
              <Button full variant="ghost" disabled={ocupado} onClick={() => setPaso('opciones')}>Cancelar</Button>
            </div>
          </>
        )}
        {paso === 'bloquear' && (
          <>
            <h3 className="t-h2" style={{ margin: 0 }}>¿Bloquear a {comentario.autorNombre}?</h3>
            <p className="t-meta" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
              En el tablón de este estudio dejaréis de ver vuestros comentarios. El estudio lo sabrá para revisarlo. Puedes desbloquearla en Perfil › Privacidad y datos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <Button full variant="danger" loading={ocupado} onClick={() => void hacer('bloquear')}>Bloquear</Button>
              <Button full variant="ghost" disabled={ocupado} onClick={() => setPaso('opciones')}>Cancelar</Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
