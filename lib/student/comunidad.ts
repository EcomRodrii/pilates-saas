'use client';

import { portalAuthHeader } from '@/lib/api-client';
import type { Post } from '@/lib/student/tipos';

// El tablón del estudio, contra `/api/public/comunidad/posts` (que ya filtra
// por audiencia en el servidor) y el RSVP de eventos contra
// `/posts/[id]/asistentes`. Aquí solo se traduce; quién puede ver qué y si
// queda plaza lo decide el servidor.

export const LIMITE_TABLON = 20;

interface FilaPost {
  id: string; texto: string; imagenUrl: string | null; autorNombre: string; autorInicial: string;
  creadoEn: string; likes: number; comentariosCount: number; tipo: 'TEXTO' | 'EVENTO';
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
      creadoEn: p.creadoEn, likes: p.likes ?? 0, tipo: p.tipo ?? 'TEXTO',
      eventoFecha: p.eventoFecha ?? null, eventoAforo: p.eventoAforo ?? null, eventoLugar: p.eventoLugar ?? null,
      totalAsistentes: p.totalAsistentes, apuntada: p.apuntada === true,
    }));
  } catch {
    return null;
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
