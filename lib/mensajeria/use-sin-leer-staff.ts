'use client';

// Contador de conversaciones sin leer para el badge del menú lateral —
// existía ya el cálculo (`sinLeerTotal` dentro de ConversacionesTab), pero
// vivía solo dentro de la propia pestaña de Mensajería: la propietaria no
// tenía forma de saber que tenía algo pendiente sin entrar antes a mirar.
// Mismo patrón de polling que components/notifications/notification-bell.tsx
// (fetch al montar + cada 120s, pausado con la pestaña oculta) — sin Realtime
// propio aquí porque el Sidebar vive en TODAS las páginas del panel, no solo
// en Mensajería, y no vale la pena mantener un canal por conversación abierto
// en todo momento solo para un contador.

import { useCallback, useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { tieneSinLeer, type ConversacionConResumen } from '@/lib/mensajeria/presentacion';
import { useAuth } from '@/lib/auth-context';

export function useMensajesSinLeerStaff(activo: boolean): number {
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  const [total, setTotal] = useState(0);

  const cargar = useCallback(async () => {
    if (!authUserId) { setTotal(0); return; }
    try {
      const res = await fetch('/api/mensajeria/conversaciones', { headers: await authHeader() });
      if (!res.ok) return;
      const { conversaciones } = await res.json() as { conversaciones: ConversacionConResumen[] };
      setTotal(conversaciones.filter(c => tieneSinLeer(c, authUserId, 'equipo')).length);
    } catch {
      // Silencioso: un badge que no se actualiza esta vez no es un error que
      // deba interrumpir a nadie — se corrige solo en el próximo tick.
    }
  }, [authUserId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- apaga el badge al desmontar/ocultar, no es un valor derivado.
    if (!activo) { setTotal(0); return; }
    void cargar();
    // 120 s y no 60 (6-oct-2026): ver notification-bell.tsx. Al volver a la
    // pestaña se recarga al instante, así que el badge no se queda viejo.
    const t = setInterval(() => { if (!document.hidden) void cargar(); }, 120_000);
    const alVolver = () => { if (!document.hidden) void cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [activo, cargar]);

  return total;
}
