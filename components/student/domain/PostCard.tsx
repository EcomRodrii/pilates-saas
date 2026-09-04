'use client';

import { useState } from 'react';
import type { Post } from '@/lib/student/tipos';
import { relativo } from '@/lib/student/formato';
import { estadoEvento, plazasTexto, puedeApuntarse } from '@/lib/student/comunidad-reglas';
import { rsvpEvento } from '@/lib/student/comunidad';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { Badge } from '@/components/student/ui/Badge';

// Una publicación del tablón. Mismo idioma que NotificationItem: avatar
// redondo, título en 800, cuerpo en t-meta, fecha relativa en t-mono.
//
// Los «me gusta» los pone el estudio desde el panel y aquí solo se leen: no hay
// ruta pública para darlos, y pintar un corazón que no guarda nada sería un
// control muerto.

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

      {post.likes > 0 && (
        <p className="t-meta" style={{ margin: '10px 0 0' }}>♥ {post.likes}</p>
      )}
    </article>
  );
}
