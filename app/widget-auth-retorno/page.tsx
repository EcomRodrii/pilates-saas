'use client';

// Puente del magic link para el widget embebido (Modo B, Shadow DOM).
//
// El bundle corre en el DOM del ESTUDIO, así que no puede recibir el retorno
// de un enlace mágico directamente: `detectSessionInUrl` de Supabase solo
// procesa el fragmento de la URL en la pestaña que lo carga, y esa pestaña es
// esta (tentare.app), no la ventana del sitio del estudio. El widget abre
// esta página en una pestaña/ventana aparte (`window.open`, ver
// lib/widget/usar-auth-widget.ts); en cuanto aquí hay sesión, se la pasamos
// de vuelta por `postMessage` al `opener` y esta pestaña se cierra sola.
//
// Ver docs/auth-widget-diseno.md §2 para el diseño completo, incluido el
// spike pendiente de validar en Safari real con "Prevent Cross-Site
// Tracking" — este flujo no se ha probado todavía fuera de este repo.
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabasePortal } from '@/lib/db/supabase-portal';

export default function WidgetAuthRetorno() {
  return (
    <Suspense fallback={null}>
      <WidgetAuthRetornoInner />
    </Suspense>
  );
}

function WidgetAuthRetornoInner() {
  const searchParams = useSearchParams();
  const [estado, setEstado] = useState<'esperando' | 'enviado' | 'error'>('esperando');

  useEffect(() => {
    const origenEstudio = searchParams.get('origenEstudio');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Validación del parámetro de URL al montar, no una sincronización con un sistema externo que se repita.
    if (!origenEstudio) { setEstado('error'); return; }

    let cancelado = false;
    async function intentar() {
      const { data: { session } } = await supabasePortal.auth.getSession();
      if (cancelado || !session?.access_token || !session.refresh_token) return;
      // El origen de destino restringe quién puede LEER este mensaje — nunca
      // '*'. Viene del propio widget al abrir esta pestaña (su propio
      // `window.location.origin`), no de datos ajenos.
      window.opener?.postMessage({
        tipo: 'tentare-widget-auth', ok: true,
        access_token: session.access_token, refresh_token: session.refresh_token,
      }, origenEstudio!);
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
  }, [searchParams]);

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
