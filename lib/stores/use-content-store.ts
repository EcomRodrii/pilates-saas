'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Store de dominio: Contenido y Comunidad (vídeos on-demand + posts).
//
// Primera rebanada del troceo del god-context (ver studio-context.tsx). Es un
// dominio deliberadamente autocontenido: solo depende de helpers de módulo
// (getCurrentStudioId, uid, db*), no llama a ningún hub cross-dominio
// (otorgarCreditos, addActividadReciente…) y nadie fuera del contexto llama a
// sus funciones. Sirve de patrón para extraer los siguientes dominios.
//
// El provider (StudioProvider) llama a este hook y compone su retorno dentro
// del value de useStudio(), así que la API pública NO cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { uid } from '@/lib/utils';
import type { VideoOnDemand, PostComunidad, DestinatariosCampana } from '@/lib/types';
import {
  getCurrentStudioId,
  dbInsertVideoOnDemand,
  dbUpdateVideoOnDemand,
  dbCrearPostComunidad,
  dbToggleLikePost,
  dbUpdatePostComunidad,
  dbDeletePostComunidad,
} from '@/lib/supabase-data';

// Exportado para que `lib/studio-context.tsx` tipe `addPost` con la firma
// real (no solo `(texto: string) => void`) — sin esto, cualquier caller que
// pase el segundo argumento (audiencia/imagenUrl/evento) falla en tsc contra
// el tipo del contexto aunque la implementación lo acepte perfectamente.
export type OpcionesAddPost = {
  audiencia?: DestinatariosCampana; imagenUrl?: string | null;
  tipo?: 'TEXTO' | 'EVENTO'; eventoFecha?: string | null; eventoAforo?: number | null; eventoLugar?: string | null;
};

export function useContentStore() {
  const [videosOnDemand, setVideosOnDemand] = useState<VideoOnDemand[]>([]);
  const [postsComunidad, setPostsComunidad] = useState<PostComunidad[]>([]);
  // post_ids que el usuario actual ha likeado (para el estado "me gusta" y para
  // que el toggle sea idempotente: like ↔ unlike, no un +1 infinito).
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

  // ── Vídeos on-demand ──────────────────────────────────────────────────────
  function addVideo(fields: Omit<VideoOnDemand, 'id' | 'studioId' | 'vistas' | 'likes' | 'creadoEn'>) {
    const nuevo: VideoOnDemand = {
      id: `vid-${uid()}`,
      studioId: getCurrentStudioId(),
      vistas: 0,
      likes: 0,
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setVideosOnDemand(prev => [nuevo, ...prev]);
    dbInsertVideoOnDemand(nuevo);
  }

  function toggleVideo(videoId: string) {
    const actual = videosOnDemand.find(v => v.id === videoId);
    setVideosOnDemand(prev => prev.map(v =>
      v.id === videoId ? { ...v, activo: !v.activo } : v
    ));
    if (actual) dbUpdateVideoOnDemand(videoId, { activo: !actual.activo });
  }

  // ── Comunidad ─────────────────────────────────────────────────────────────
  // P1: `audiencia`/`imagenUrl` opcionales — 'TODAS' y null mantienen el
  // comportamiento previo intacto para quien siga llamando a addPost(texto).
  // La persistencia real (y el fan-out de notificación) vive detrás de
  // dbCrearPostComunidad (/api/comunidad/posts), no de un insert directo.
  function addPost(texto: string, opts?: OpcionesAddPost) {
    const nuevo: PostComunidad = {
      id: `post-${uid()}`,
      studioId: getCurrentStudioId(),
      autorId: null,
      autorNombre: 'Tentare',
      autorInicial: 'TE',
      texto,
      audiencia: opts?.audiencia ?? 'TODAS',
      imagenUrl: opts?.imagenUrl ?? null,
      tipo: opts?.tipo ?? 'TEXTO',
      eventoFecha: opts?.eventoFecha ?? null,
      eventoAforo: opts?.eventoAforo ?? null,
      eventoLugar: opts?.eventoLugar ?? null,
      likes: 0,
      comentariosCount: 0,
      fijado: false,
      creadoEn: new Date().toISOString(),
    };
    setPostsComunidad(prev => [nuevo, ...prev]);
    // 19ª auditoría · F-2: mismo criterio que `toggleLikePost` — si el servidor
    // rechaza, se retira el optimista. Dejarlo pintado hacía creer que el aviso
    // estaba publicado (y notificado a la audiencia) cuando no había llegado ni
    // a la BD ni al fan-out.
    //
    // F-19: el servidor ya no respeta `nuevo.id` (lo genera él, ver
    // dbCrearPostComunidad) — hay que reconciliar el id optimista con el real
    // o un like/editar/borrar sobre este post antes del próximo refresco
    // apuntaría a un id que nunca se guardó.
    void dbCrearPostComunidad(nuevo).then(guardado => {
      if (!guardado) { setPostsComunidad(prev => prev.filter(p => p.id !== nuevo.id)); return; }
      if (guardado.id === nuevo.id) return;
      setPostsComunidad(prev => prev.map(p => p.id === nuevo.id ? { ...p, id: guardado.id } : p));
    });
  }

  function toggleLikePost(postId: string) {
    const studioId = getCurrentStudioId();
    const yaLiked = likedPostIds.has(postId);
    // Optimista: alterna el estado y ajusta el contador ±1.
    setLikedPostIds(prev => {
      const n = new Set(prev);
      if (yaLiked) n.delete(postId); else n.add(postId);
      return n;
    });
    setPostsComunidad(prev => prev.map(p =>
      p.id === postId ? { ...p, likes: Math.max(0, p.likes + (yaLiked ? -1 : 1)) } : p
    ));
    // Persistencia idempotente; reconcilia con la verdad del servidor (estado +
    // conteo real recomputado). Si falla, revierte al valor del servidor.
    dbToggleLikePost(postId, studioId).then(res => {
      if (!res) {
        // El servidor rechazó (red / NO_AUTH / STUDIO_MISMATCH): revertir el
        // optimista para no dejar el corazón/contador divergiendo de la BD.
        setLikedPostIds(prev => {
          const n = new Set(prev);
          if (yaLiked) n.add(postId); else n.delete(postId);
          return n;
        });
        setPostsComunidad(prev => prev.map(p =>
          p.id === postId ? { ...p, likes: Math.max(0, p.likes + (yaLiked ? 1 : -1)) } : p
        ));
        return;
      }
      setLikedPostIds(prev => {
        const n = new Set(prev);
        if (res.liked) n.add(postId); else n.delete(postId);
        return n;
      });
      setPostsComunidad(prev => prev.map(p => p.id === postId ? { ...p, likes: res.likes } : p));
    });
  }

  // Editar un post ya publicado. Optimista, mismo criterio que addPost: sin
  // rollback si falla el guardado — `dbUpdatePostComunidad` ya reporta el
  // error, y revertir un texto/audiencia/evento que la propietaria ya ha
  // vuelto a leer y dado por bueno en pantalla generaría más confusión que
  // dejarlo como está hasta el próximo refresco real.
  //
  // F-26: `opts` cubre audiencia/tipo/evento, no solo texto — antes de esto
  // no había forma de corregir la fecha/aforo/lugar de un EVENTO mal puesto
  // sin borrar y republicar el post entero (con el fan-out otra vez).
  function updatePost(postId: string, texto: string, opts?: OpcionesAddPost) {
    setPostsComunidad(prev => prev.map(p => p.id === postId ? { ...p, texto, ...opts } : p));
    void dbUpdatePostComunidad(postId, { texto, ...opts });
  }

  // 19ª auditoría · F-2: el borrado NO puede ser optimista-sin-vuelta como el
  // texto. Un post que sigue en la BD sigue sirviéndose a todas las socias
  // desde el feed público, así que "desaparece del panel" sin haberse borrado
  // es exactamente el caso que hay que evitar: la propietaria cree retirado un
  // precio mal puesto o un dato personal que en realidad sigue publicado.
  function deletePost(postId: string) {
    // Se guardan fila y posición para reponerlo EXACTAMENTE donde estaba: el
    // tablón mezcla fijados y no fijados, así que reordenar por fecha al
    // reponer movería el post de sitio.
    const posicion = postsComunidad.findIndex(p => p.id === postId);
    const anterior = posicion >= 0 ? postsComunidad[posicion] : undefined;
    setPostsComunidad(prev => prev.filter(p => p.id !== postId));
    void dbDeletePostComunidad(postId).then(ok => {
      if (ok || !anterior) return;
      setPostsComunidad(prev => {
        if (prev.some(p => p.id === postId)) return prev;
        const n = [...prev];
        n.splice(Math.min(Math.max(posicion, 0), n.length), 0, anterior);
        return n;
      });
    });
  }

  return {
    // estado
    videosOnDemand,
    postsComunidad,
    likedPostIds,
    // hidratación (usada por el fetchAll del provider)
    setVideosOnDemand,
    setPostsComunidad,
    setLikedPostIds,
    // acciones
    addVideo,
    toggleVideo,
    addPost,
    toggleLikePost,
    updatePost,
    deletePost,
  };
}
