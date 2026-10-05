'use client';
// Tentare Network vive fuera del panel (app/network/layout.tsx) pero entra con
// la MISMA cuenta y el mismo cliente: una persona del equipo con la verificación
// en dos pasos activada que abre /network con una sesión sin verificar recibiría
// 401 en cada llamada (`verificarUsuarioSupabase` la corta en el servidor). Esto
// la manda antes a /verificar-acceso y la devuelve a donde iba. Solo mira la
// verificación de la CUENTA (factor): «exigirla a todo el equipo» es del panel.
//
// Guardia de USABILIDAD: la cerradura es el servidor.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/db/supabase';
import { confiarDispositivo } from '@/lib/auth/doble-factor-acciones';
import { sesionPideCodigo } from '@/lib/auth/doble-factor-reglas';

export type PasoNetwork = 'mirando' | 'ok' | 'saliendo';

export function useSegundoPasoNetwork(): PasoNetwork {
  const pathname = usePathname();
  const [paso, setPaso] = useState<PasoNetwork>('mirando');
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { if (vivo) setPaso('ok'); return; }
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!sesionPideCodigo({ actual: aal?.currentLevel, factores: session.user.factors })) { if (vivo) setPaso('ok'); return; }
        const confianza = await confiarDispositivo(session.access_token);
        if (!vivo) return;
        if (confianza === 'confiada') { setPaso('ok'); return; }
        setPaso('saliendo');
        // 'nueva': lo que ya se hubiera pedido llegó vacío; una recarga lo arregla.
        if (confianza === 'nueva') { window.location.reload(); return; }
        const volver = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/verificar-acceso?volver=${encodeURIComponent(volver)}`);
      } catch {
        if (vivo) setPaso('ok');
      }
    })();
    return () => { vivo = false; };
  }, [pathname]);
  return paso;
}
