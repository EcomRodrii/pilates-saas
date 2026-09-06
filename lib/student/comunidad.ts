'use client';

import { portalAuthHeader } from '@/lib/api-client';
import type { ComentarioTablon, Post } from '@/lib/student/tipos';

// El tablón del estudio, contra `/api/public/comunidad/posts` (que ya filtra
// por audiencia en el servidor), el RSVP de eventos contra
// `/posts/[id]/asistentes`, el "me gusta" contra `/posts/[id]/like` y los
// comentarios contra `/comentarios`. Aquí solo se traduce; quién puede ver
// qué, si queda plaza y si el like/comentario es válido lo decide el
// servidor.

export const LIMITE_TABLON = 20;

interface FilaPost {
  id: string; texto: string; imagenUrl: string | null; autorNombre: string; autorInicial: string;
  creadoEn: string; likes: number; likedByMe?: boolean; comentariosCount: number; tipo: 'TEXTO' | 'EVENTO';
  eventoFecha: string | null; eventoAforo: number | null; eventoLugar: string | null;
  totalAsistentes?: number; apuntada?: boolean;
}

export async function getTablon(studioId: string, antes?: string, limite = LIMITE_TABLON): Promise<Post[] | null> {
  try {
    const auth = await portalAuthHeader();
    const url = `/api/public/comunidad/posts?studioId=${encodeURIComponent(studioId)}&limite=${limite}${antes ? `&antes=${encodeURIComponent(antes)}` : ''}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) return null;
    const cuerpo = (await res.json()) as { posts?: FilaPost[] };
    return (cuerpo.posts ?? []).map((p) => ({
      id: p.id, texto: p.texto, imagenUrl: p.imagenUrl ?? null, autorNombre: p.autorNombre, autorInicial: p.autorInicial,
      creadoEn: p.creadoEn, likes: p.likes ?? 0, likedByMe: p.likedByMe === true,
      comentariosCount: p.comentariosCount ?? 0, tipo: p.tipo ?? 'TEXTO',
      eventoFecha: p.eventoFecha ?? null, eventoAforo: p.eventoAforo ?? null, eventoLugar: p.eventoLugar ?? null,
      totalAsistentes: p.totalAsistentes, apuntada: p.apuntada === true,
    }));
  } catch {
    return null;
  }
}

export type ResultadoLike = { ok: true; liked: boolean; likes: number } | { ok: false; error: string };

export async function toggleLikePost(studioId: string, postId: string): Promise<ResultadoLike> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch(`/api/public/comunidad/posts/${encodeURIComponent(postId)}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { liked?: boolean; likes?: number; error?: string } | null;
    if (!res.ok) return { ok: false, error: cuerpo?.error ?? 'No se ha podido guardar.' };
    return { ok: true, liked: cuerpo?.liked === true, likes: cuerpo?.likes ?? 0 };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

export async function fetchComentarios(studioId: string, postId: string): Promise<ComentarioTablon[] | null> {
  try {
    const auth = await portalAuthHeader();
    const url = `/api/public/comunidad/comentarios?studioId=${encodeURIComponent(studioId)}&postId=${encodeURIComponent(postId)}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) return null;
    const cuerpo = (await res.json()) as { comentarios?: ComentarioTablon[] };
    return cuerpo.comentarios ?? [];
  } catch {
    return null;
  }
}

export type ResultadoComentario = { ok: true; comentario: ComentarioTablon } | { ok: false; error: string };

export async function postComentario(studioId: string, postId: string, texto: string): Promise<ResultadoComentario> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/comunidad/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId, postId, texto }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { comentario?: ComentarioTablon; error?: string } | null;
    if (!res.ok || !cuerpo?.comentario) return { ok: false, error: cuerpo?.error ?? 'No se ha podido publicar el comentario.' };
    return { ok: true, comentario: cuerpo.comentario };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

export type ResultadoRsvp = { ok: true; apuntada: boolean; totalAsistentes: number } | { ok: false; error: string };

export async function rsvpEvento(studioId: string, postId: string, apuntar: boolean): Promise<ResultadoRsvp> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch(`/api/public/comunidad/posts/${encodeURIComponent(postId)}/asistentes`, {
      method: apuntar ? 'POST' : 'DELETE',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId }),
    });
    const cuerpo = (await res.json().catch(() => null)) as { apuntada?: boolean; totalAsistentes?: number; error?: string } | null;
    if (!res.ok) return { ok: false, error: cuerpo?.error ?? 'No se ha podido guardar.' };
    return { ok: true, apuntada: cuerpo?.apuntada === true, totalAsistentes: cuerpo?.totalAsistentes ?? 0 };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}
