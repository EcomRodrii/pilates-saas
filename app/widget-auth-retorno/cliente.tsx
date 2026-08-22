'use client';

import { useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';

// Mitad cliente de app/widget-auth-retorno/page.tsx. `destino` ya viene
// resuelto y validado por el servidor (contra widget_dominios_autorizados) —
// este componente NUNCA vuelve a leer la URL ni a decidir a quién mandar los
// tokens, solo espera la sesión y hace el `postMessage` al origen que ya se
// validó arriba.
export function WidgetAuthRetornoCliente({ destino }: { destino: string | null }) {
  const [estado, setEstado] = useState<'esperando' | 'enviado' | 'error'>(destino ? 'esperando' : 'error');

  useEffect(() => {
    if (!destino) return;

    let cancelado = false;
    async function intentar() {
      const { data: { session } } = await supabasePortal.auth.getSession();
      if (cancelado || !session?.access_token || !session.refresh_token) return;
      window.opener?.postMessage({
        tipo: 'tentare-widget-auth', ok: true,
        access_token: session.access_token, refresh_token: session.refresh_token,
      }, destino!);
      setEstado('enviado');
      window.close();
    }
    intentar();
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') intentar();
    });
    // Si en 20s no ha pasado nada (enlace no completado, o el navegador
    // bloqueó el cierre), se deja de esperar en silencio y se muestra el
    // botón de cerrar manual — nunca una pestaña colgada sin salida.
    const timeout = setTimeout(() => { if (!cancelado) setEstado((e) => (e === 'esperando' ? 'error' : e)); }, 20_000);
    return () => { cancelado = true; sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, [destino]);

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
