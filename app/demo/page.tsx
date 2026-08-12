'use client';

// Puerta de entrada al estudio de demostración ("Estudio Aurora",
// studio-demo) — cien por cien ficticio, pensado para grabar vídeo del
// producto real sin exponer datos de un estudio de verdad. Inicia sesión
// SOLA con una cuenta dedicada solo a este estudio y entra directo al panel.
// Página temporal: se borra cuando ya no haga falta grabar.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/db/supabase';

// Cuenta de demo: no tiene ficha de socia ni instructora en ningún estudio
// real, solo es propietaria de studio-demo. Contraseña fija a propósito —
// esta página es la única puerta, nadie la teclea a mano.
const DEMO_EMAIL = 'demo@estudioaurora.tentare.app';
const DEMO_PASSWORD = 'AuroraDemo2026!';

export default function DemoGatePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { error: err } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      if (!vivo) return;
      if (err) { setError(err.message); return; }
      router.replace('/dashboard');
    })();
    return () => { vivo = false; };
  }, [router]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 14, background: '#F6F4EF', fontFamily: 'var(--font-ui), system-ui, sans-serif', color: '#22261F',
    }}>
      {error ? (
        <>
          <p style={{ fontWeight: 700 }}>No se ha podido entrar a la demo.</p>
          <p style={{ fontSize: 13, color: '#6E7065', maxWidth: 320, textAlign: 'center' }}>{error}</p>
        </>
      ) : (
        <>
          <div style={{ width: 28, height: 28, borderRadius: 999, border: '3px solid #E7E4DB', borderTopColor: '#343825' }} className="animate-spin" />
          <p style={{ fontSize: 13, color: '#6E7065' }}>Entrando en el estudio de demostración…</p>
        </>
      )}
    </div>
  );
}
