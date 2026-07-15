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
import type { VideoOnDemand, PostComunidad } from '@/lib/types';
import {
  getCurrentStudioId,
  dbInsertVideoOnDemand,
  dbUpdateVideoOnDemand,
  dbInsertPostComunidad,
  dbToggleLikePost,
} from '@/lib/supabase-data';

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
  function addPost(texto: string) {
    const nuevo: PostComunidad = {
      id: `post-${uid()}`,
      studioId: getCurrentStudioId(),
      autorId: null,
      autorNombre: 'Tentare',
      autorInicial: 'TE',
      texto,
      likes: 0,
      comentariosCount: 0,
      fijado: false,
      creadoEn: new Date().toISOString(),
    };
    setPostsComunidad(prev => [nuevo, ...prev]);
    dbInsertPostComunidad(nuevo);
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
      if (!res) return;
      setLikedPostIds(prev => {
        const n = new Set(prev);
        if (res.liked) n.add(postId); else n.delete(postId);
        return n;
      });
      setPostsComunidad(prev => prev.map(p => p.id === postId ? { ...p, likes: res.likes } : p));
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
  };
}
