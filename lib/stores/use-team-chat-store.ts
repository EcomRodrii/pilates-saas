'use client';

// Chat de equipo (canal único por estudio) — hook AUTÓNOMO.
//
// A diferencia del resto de "stores", este NO se monta dentro del StudioProvider:
// lo consume directamente la página del chat. Así, enviar un mensaje solo
// re-renderiza el chat y no todo el dashboard (antes vivía en el mega-contexto),
// y los mensajes se cargan bajo demanda al abrir la pantalla, no en el arranque.
//
// Fase 1 (tiempo real): carga inicial acotada + suscripción Realtime a los INSERT
// de mensajes_equipo del propio estudio (RLS lo aísla). Requiere que la tabla esté
// en la publicación `supabase_realtime` (migración 0022). Si Realtime no está
// habilitado, el chat sigue funcionando: carga al abrir y refresca al recuperar el
// foco de la pestaña; solo pierde la actualización "instantánea".
//
// Fase 2 (robustez): el envío es optimista con estado por mensaje
// (enviando → enviado | fallido) y reintento, en vez de fire-and-forget.

import { useCallback, useEffect, useRef, useState } from 'react';
import { uid } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  getCurrentStudioId,
  dbInsertMensajeEquipo,
  dbListMensajesEquipo,
  mapMensajeEquipo,
} from '@/lib/supabase-data';
import type { MensajeEquipo } from '@/lib/types';
import type { RowMensajesEquipo } from '@/lib/db-types';

export type EstadoEnvio = 'enviando' | 'enviado' | 'fallido';
export type EstadoCarga = 'cargando' | 'listo' | 'error';

// Mensaje en memoria: el de dominio + estado de envío local (solo para los que
// mando yo; los recibidos por Realtime nacen ya como 'enviado').
export interface MensajeChat extends MensajeEquipo {
  estado?: EstadoEnvio;
}

export function useTeamChat(deps: { autorInstructorId: string | null; autorNombre: string }) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [estadoCarga, setEstadoCarga] = useState<EstadoCarga>('cargando');

  // Autor actual sin re-suscribir Realtime en cada render: el efecto lee siempre
  // el valor más reciente vía ref.
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Añade un mensaje si no está ya (dedupe por id). Los mensajes que mando yo se
  // insertan con su id generado en cliente, así que el eco de Realtime trae el
  // MISMO id y no duplica.
  const fusionar = useCallback((m: MensajeChat) => {
    setMensajes(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  const recargar = useCallback(async () => {
    if (!getCurrentStudioId()) {
      setEstadoCarga('listo');
      return;
    }
    try {
      const lista = await dbListMensajesEquipo();
      setMensajes(lista.map(m => ({ ...m, estado: 'enviado' as const })));
      setEstadoCarga('listo');
    } catch {
      setEstadoCarga('error');
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    const sid = getCurrentStudioId();

    setEstadoCarga('cargando');
    recargar();

    // Refresco al recuperar el foco: red de seguridad si Realtime no está activo.
    const onFocus = () => { if (document.visibilityState === 'visible') recargar(); };
    document.addEventListener('visibilitychange', onFocus);

    let canal: ReturnType<typeof supabase.channel> | null = null;
    if (sid) {
      (async () => {
        // Realtime respeta RLS → hay que pasarle el JWT de la sesión.
        const { data } = await supabase.auth.getSession();
        if (!vivo) return;
        await supabase.realtime.setAuth(data.session?.access_token ?? null);
        if (!vivo) return;
        canal = supabase
          .channel(`mensajes_equipo:${sid}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'mensajes_equipo', filter: `studio_id=eq.${sid}` },
            payload => {
              const nuevo = mapMensajeEquipo(payload.new as RowMensajesEquipo);
              fusionar({ ...nuevo, estado: 'enviado' });
            },
          )
          .subscribe();
      })();
    }

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', onFocus);
      if (canal) supabase.removeChannel(canal);
    };
  }, [recargar, fusionar]);

  async function persistir(mensaje: MensajeChat) {
    const ok = await dbInsertMensajeEquipo(mensaje);
    setMensajes(prev =>
      prev.map(m => (m.id === mensaje.id ? { ...m, estado: ok ? 'enviado' : 'fallido' } : m)),
    );
  }

  const enviar = useCallback((textoRaw: string) => {
    const texto = textoRaw.trim();
    if (!texto) return;
    const { autorInstructorId, autorNombre } = depsRef.current;
    const nuevo: MensajeChat = {
      id: `msgeq-${uid()}`,
      studioId: getCurrentStudioId(),
      autorInstructorId,
      autorNombre,
      texto,
      creadoEn: new Date().toISOString(),
      estado: 'enviando',
    };
    setMensajes(prev => [...prev, nuevo]);
    void persistir(nuevo);
  }, []);

  const reintentar = useCallback((id: string) => {
    setMensajes(prev => {
      const objetivo = prev.find(m => m.id === id);
      if (objetivo) void persistir({ ...objetivo, estado: 'enviando' });
      return prev.map(m => (m.id === id ? { ...m, estado: 'enviando' } : m));
    });
  }, []);

  return { mensajes, estadoCarga, enviar, reintentar };
}
