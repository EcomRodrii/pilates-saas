'use client';

// Chat de equipo con CANALES/grupos — hook autónomo (lo consume la página del chat).
//
// - Canales por estudio (canales_equipo). Al montar carga los canales y activa el
//   primero ("General"). Se pueden crear canales nuevos (crearCanal).
// - Mensajes por canal: al cambiar de canal se recargan y se re-suscribe Realtime
//   (postgres_changes filtrado por canal_id). Red de seguridad: refresco al foco.
// - Envío optimista con estado por mensaje (enviando → enviado | fallido) + reintento.

import { useCallback, useEffect, useRef, useState } from 'react';
import { uid } from '@/lib/utils';
import { supabase } from '@/lib/db/supabase';
import {
  getCurrentStudioId,
  dbInsertMensajeEquipo,
  dbListMensajesEquipo,
  dbListCanalesEquipo,
  dbCreateCanalEquipo,
  mapMensajeEquipo,
} from '@/lib/supabase-data';
import type { MensajeEquipo, CanalEquipo } from '@/lib/types';
import type { RowMensajesEquipo } from '@/lib/db-types';

export type EstadoEnvio = 'enviando' | 'enviado' | 'fallido';
export type EstadoCarga = 'cargando' | 'listo' | 'error';

export interface MensajeChat extends MensajeEquipo {
  estado?: EstadoEnvio;
}

export function useTeamChat(deps: { autorInstructorId: string | null; autorNombre: string }) {
  const [canales, setCanales] = useState<CanalEquipo[]>([]);
  const [canalActivo, setCanalActivo] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [estadoCarga, setEstadoCarga] = useState<EstadoCarga>('cargando');

  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Cargar canales al montar y activar el primero (General). Si el estudio no
  // tiene ningún canal (estudio nuevo, o creado antes de esta feature), se
  // autoprovisiona "General" — si no, canalActivo quedaría null y el chat se
  // colgaría en "cargando" para siempre.
  useEffect(() => {
    let vivo = true;
    const sid = getCurrentStudioId();
    if (!sid) { setEstadoCarga('listo'); return; }
    dbListCanalesEquipo().then(cs => {
      if (!vivo) return;
      if (cs.length === 0) {
        const general: CanalEquipo = { id: `canal-${uid()}`, studioId: sid, nombre: 'General', creadoEn: new Date().toISOString() };
        setCanales([general]);
        setCanalActivo(general.id);
        void dbCreateCanalEquipo(general);
      } else {
        setCanales(cs);
        setCanalActivo(prev => prev ?? cs[0].id);
      }
    }).catch(() => { if (vivo) setEstadoCarga('error'); });
    return () => { vivo = false; };
  }, []);

  const fusionar = useCallback((m: MensajeChat) => {
    setMensajes(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Mensajes + Realtime del canal activo. Se re-ejecuta al cambiar de canal.
  useEffect(() => {
    if (!canalActivo) return;
    let vivo = true;
    setEstadoCarga('cargando');
    setMensajes([]);

    dbListMensajesEquipo(canalActivo)
      .then(lista => { if (vivo) { setMensajes(lista.map(m => ({ ...m, estado: 'enviado' as const }))); setEstadoCarga('listo'); } })
      .catch(() => { if (vivo) setEstadoCarga('error'); });

    const onFocus = () => {
      if (document.visibilityState === 'visible' && vivo) {
        dbListMensajesEquipo(canalActivo).then(lista => {
          if (!vivo) return;
          // Merge en vez de reemplazo: conserva los mensajes locales aún no
          // confirmados (enviando/fallido) para no perder un mensaje ni su reintento.
          setMensajes(prev => {
            const server = lista.map(m => ({ ...m, estado: 'enviado' as const }));
            const ids = new Set(server.map(m => m.id));
            const pendientes = prev.filter(m => m.estado !== 'enviado' && !ids.has(m.id));
            return [...server, ...pendientes];
          });
        });
      }
    };
    document.addEventListener('visibilitychange', onFocus);

    let canal: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!vivo) return;
      canal = supabase
        .channel(`mensajes_equipo:${canalActivo}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'mensajes_equipo', filter: `canal_id=eq.${canalActivo}` },
          payload => fusionar({ ...mapMensajeEquipo(payload.new as RowMensajesEquipo), estado: 'enviado' }),
        )
        .subscribe();
    })();

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', onFocus);
      if (canal) supabase.removeChannel(canal);
    };
  }, [canalActivo, fusionar]);

  async function persistir(mensaje: MensajeChat) {
    const ok = await dbInsertMensajeEquipo(mensaje);
    setMensajes(prev => prev.map(m => (m.id === mensaje.id ? { ...m, estado: ok ? 'enviado' : 'fallido' } : m)));
  }

  const enviar = useCallback((textoRaw: string) => {
    const texto = textoRaw.trim();
    if (!texto || !canalActivo) return;
    const { autorInstructorId, autorNombre } = depsRef.current;
    const nuevo: MensajeChat = {
      id: `msgeq-${uid()}`,
      studioId: getCurrentStudioId(),
      canalId: canalActivo,
      autorInstructorId,
      autorNombre,
      texto,
      creadoEn: new Date().toISOString(),
      estado: 'enviando',
    };
    setMensajes(prev => [...prev, nuevo]);
    void persistir(nuevo);
  }, [canalActivo]);

  const reintentar = useCallback((id: string) => {
    setMensajes(prev => {
      const objetivo = prev.find(m => m.id === id);
      if (objetivo) void persistir({ ...objetivo, estado: 'enviando' });
      return prev.map(m => (m.id === id ? { ...m, estado: 'enviando' } : m));
    });
  }, []);

  const crearCanal = useCallback(async (nombreRaw: string) => {
    const nombre = nombreRaw.trim();
    if (!nombre) return;
    const canal: CanalEquipo = { id: `canal-${uid()}`, studioId: getCurrentStudioId(), nombre, creadoEn: new Date().toISOString() };
    const prevActivo = canalActivo;
    setCanales(prev => [...prev, canal]);   // optimista
    setCanalActivo(canal.id);
    const ok = await dbCreateCanalEquipo(canal);
    if (!ok) {
      // Revertir: quitar el canal fantasma Y volver al canal activo anterior (si
      // no, canalActivo apuntaría a un id inexistente y los mensajes violarían la FK).
      setCanales(prev => prev.filter(c => c.id !== canal.id));
      setCanalActivo(prevActivo);
    }
  }, [canalActivo]);

  return { canales, canalActivo, setCanalActivo, mensajes, estadoCarga, enviar, reintentar, crearCanal };
}
