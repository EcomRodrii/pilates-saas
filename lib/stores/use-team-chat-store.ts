'use client';

// Store de dominio: Chat de equipo (canal único compartido) (Fase B).
//
// A diferencia de los dominios anteriores, este NO es del todo autónomo: el
// autor del mensaje depende de quién está logueado (yo?.id / actorNombre), que
// se derivan en el provider. Se inyectan como argumentos del hook — el provider
// los recalcula cada render, así que la acción siempre usa el autor actual.

import { useState } from 'react';
import { uid } from '@/lib/utils';
import { getCurrentStudioId, dbInsertMensajeEquipo } from '@/lib/supabase-data';
import type { MensajeEquipo } from '@/lib/types';

export function useTeamChatStore(deps: { autorInstructorId: string | null; autorNombre: string | null }) {
  const [mensajesEquipo, setMensajesEquipo] = useState<MensajeEquipo[]>([]);

  function addMensajeEquipo(texto: string) {
    const nuevo: MensajeEquipo = {
      id: `msgeq-${uid()}`,
      studioId: getCurrentStudioId(),
      autorInstructorId: deps.autorInstructorId,
      autorNombre: deps.autorNombre ?? 'Propietaria',
      texto,
      creadoEn: new Date().toISOString(),
    };
    setMensajesEquipo(prev => [...prev, nuevo]);
    dbInsertMensajeEquipo(nuevo);
  }

  return { mensajesEquipo, setMensajesEquipo, addMensajeEquipo };
}
