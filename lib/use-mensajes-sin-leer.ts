'use client';

// Cuántas conversaciones tienen mensajes sin leer, para el badge fuera de la
// propia bandeja de Mensajes (Perfil, y cualquier otra pantalla que lo
// necesite). Reutiliza EXACTAMENTE las mismas piezas que ya usa
// `app/portal/[slug]/mensajes/page.tsx` para pintar el punto de "sin leer" en
// cada fila (`fetchConversaciones` + `tieneSinLeer`) — cero contador nuevo,
// cero número inventado.
//
// Se calcula UNA vez al montar, sin Realtime: mismo criterio ya cerrado para
// la propia bandeja ("Sin Realtime a propósito en la LISTA", comentario en
// `mensajes/page.tsx`) — un badge fuera del hilo tampoco necesita estar al
// segundo, se refresca al volver a entrar en la pantalla que lo pinta.

import { useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { portalAuthHeader } from '@/lib/api-client';
import { fetchConversaciones } from '@/lib/mensajeria-portal.ts';
import { contarSinLeer } from '@/lib/mensajeria/presentacion.ts';

export function useMensajesSinLeer(studioId: string | null): number {
  const [n, setN] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset síncrono al cambiar/perder studioId, misma forma que el resto del portal.
    if (!studioId) { setN(0); return; }
    let vivo = true;
    void (async () => {
      const { data } = await supabasePortal.auth.getSession();
      const authUserId = data.session?.user.id ?? null;
      const headers = await portalAuthHeader();
      const r = await fetchConversaciones(headers, studioId);
      if (!vivo || 'error' in r) return;
      setN(contarSinLeer(r.conversaciones, authUserId));
    })();
    return () => { vivo = false; };
  }, [studioId]);

  return n;
}
