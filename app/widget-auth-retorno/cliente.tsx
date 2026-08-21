'use client';

// Mitad cliente del puente de auth del widget. `origenEstudio` llega YA
// validado contra `studios.widget_dominios_autorizados` desde el server
// component de al lado (page.tsx): aquí nunca se lee de la URL. Si es `null`,
// el origen no estaba autorizado (o faltaba el slug) y no se emite nada.
import { useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';

export function WidgetAuthRetornoCliente({ origenEstudio }: { origenEstudio: string | null }) {
  const [estado, setEstado] = useState<'esperando' | 'enviado' | 'error'>(
    origenEstudio ? 'esperando' : 'error',
  );

  useEffect(() => {
    if (!origenEstudio) return;

    let cancelado = false;
    async function intentar() {
      const { data: { session } } = await supabasePortal.auth.getSession();
      if (cancelado || !session?.access_token || !session.refresh_token) return;
      // El origen de destino restringe quién puede LEER este mensaje — nunca
      // '*', y nunca un valor que venga del cliente: lo ha autorizado el
      // servidor contra la lista blanca del estudio.
      window.opener?.postMessage({
        tipo: 'tentare-widget-auth', ok: true,
        access_token: session.access_token, refresh_token: session.refresh_token,
      }, origenEstudio!);
      setEstado('enviado');
      window.close();
    }
    void intentar();
    const { data: sub } = supabasePortal.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void intentar();
    });
    // Si en 20s no ha pasado nada (enlace no completado, o el navegador
    // bloqueó el cierre), se deja de esperar en silencio y se muestra el
    // botón de cerrar manual — nunca una pestaña colgada sin salida.
    const timeout = setTimeout(() => { if (!cancelado) setEstado((e) => (e === 'esperando' ? 'error' : e)); }, 20_000);
    return () => { cancelado = true; sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, [origenEstudio]);

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
