'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/auth-js';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { sesionAutenticadaPorEmailDespuesDe } from '@/lib/widget/puente-sesion';

// Mitad cliente de app/widget-auth-retorno/page.tsx. `destino`, `nonce` y
// `abiertoEn` ya vienen resueltos por el servidor — este componente NUNCA
// vuelve a leer la URL ni a decidir a quién mandar los tokens.
//
// ⚠️ Nunca reenvía la sesión que ya hubiera en el navegador. Solo la que nace
// de un acceso por email completado después de abrir esta página (ver
// `sesionAutenticadaPorEmailDespuesDe`). El tipo de evento de auth-js NO sirve
// de señal: al arrancar emite `INITIAL_SESSION`/`SIGNED_IN` con la sesión
// guardada. Por eso cada vía de entrada pasa por el mismo filtro.
//
// Cómo se entera esta pestaña: la alumna abre el enlace del email en OTRA
// pestaña (sin `opener`), allí auth-js guarda la sesión y la anuncia por
// BroadcastChannel (canal = storageKey); aquí llega a `onAuthStateChange` con
// la sesión en el propio evento — útil también si la sesión vive en
// sessionStorage, que no se comparte entre pestañas. Como red de seguridad
// para navegadores sin BroadcastChannel, se sondea `getSession()`.
const SONDEO_MS = 3_000;

export function WidgetAuthRetornoCliente({ destino, nonce, abiertoEn }: {
  destino: string | null;
  nonce: string | null;
  abiertoEn: number;
}) {
  const [estado, setEstado] = useState<'esperando' | 'enviado' | 'error'>(destino && nonce ? 'esperando' : 'error');

  useEffect(() => {
    if (!destino || !nonce) return;

    let cancelado = false;
    let enviado = false;
    function enviarSiNueva(session: Session | null) {
      if (cancelado || enviado || !session?.access_token || !session.refresh_token) return;
      if (!sesionAutenticadaPorEmailDespuesDe(session.access_token, abiertoEn)) return;
      if (!window.opener) return;
      enviado = true;
      window.opener.postMessage({
        tipo: 'tentare-widget-auth', ok: true, nonce,
        access_token: session.access_token, refresh_token: session.refresh_token,
      }, destino!);
      setEstado('enviado');
      window.close();
    }
    async function sondear() {
      const { data: { session } } = await supabasePortal.auth.getSession();
      enviarSiNueva(session);
    }
    void sondear();
    const intervalo = setInterval(() => { void sondear(); }, SONDEO_MS);
    const { data: sub } = supabasePortal.auth.onAuthStateChange((_evento, session) => {
      enviarSiNueva(session);
    });
    // Si en 20s no ha pasado nada (enlace no completado, o el navegador
    // bloqueó el cierre), se muestra el botón de cerrar manual — nunca una
    // pestaña colgada sin salida. Se sigue escuchando por si llega tarde.
    const timeout = setTimeout(() => { if (!cancelado) setEstado((e) => (e === 'esperando' ? 'error' : e)); }, 20_000);
    return () => { cancelado = true; sub.subscription.unsubscribe(); clearInterval(intervalo); clearTimeout(timeout); };
  }, [destino, nonce, abiertoEn]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 16, fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center',
    }}>
      {estado === 'esperando' && <p>Confirmando tu acceso…</p>}
      {estado === 'enviado' && <p>Ya puedes cerrar esta ventana.</p>}
      {estado === 'error' && (
        <>
          <p>No hemos podido confirmar el acceso automáticamente.</p>
          <button
            type="button"
            onClick={() => window.close()}
            style={{ padding: '8px 20px', borderRadius: 999, border: '1px solid #ddd8c8', background: 'none', cursor: 'pointer' }}
          >
            Cerrar
          </button>
        </>
      )}
    </div>
  );
}
