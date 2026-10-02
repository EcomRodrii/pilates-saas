'use client';

// «Verificación en dos pasos» en Mi perfil (2-oct-2026, contrato de encargo):
// cualquiera del equipo del panel puede activarla para su cuenta. Activar y
// escribir el código se hace en /verificar-acceso; aquí se ve cómo está y se
// puede quitar (salvo que el estudio la exija a todo el equipo).
//
// Quitarla exige la sesión verificada (`aal2`): Supabase lo rechaza si no, y
// con la sesión sin verificar ni se llega a este panel.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';

type Estado = { tipo: 'cargando' } | { tipo: 'listo'; factores: { id: string }[]; exigida: boolean };

export function BloqueDobleFactor() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [quitando, setQuitando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; error: boolean } | null>(null);

  const leer = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const [factores, porEstudio] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      fetch('/api/auth/doble-factor', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ estudioLoExige?: boolean } | null>,
    ]);
    setEstado({ tipo: 'listo', factores: factores.data?.totp ?? [], exigida: porEstudio?.estudioLoExige === true });
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- setState tras await, no en cascada
  useEffect(() => { void leer(); }, [leer]);

  async function quitar() {
    if (estado.tipo !== 'listo' || quitando) return;
    setQuitando(true); setMsg(null);
    try {
      for (const f of estado.factores) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
        if (error) {
          setMsg({ texto: 'No se ha podido quitar. Vuelve a entrar con tu código y prueba otra vez.', error: true });
          return;
        }
      }
      await supabase.auth.refreshSession();
      setConfirmar(false);
      setMsg({ texto: 'Verificación en dos pasos desactivada.', error: false });
      await leer();
    } finally {
      setQuitando(false);
    }
  }

  const activa = estado.tipo === 'listo' && estado.factores.length > 0;
  const exigida = estado.tipo === 'listo' && estado.exigida;

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-1.5">
        <ShieldCheck size={15} className="text-muted-foreground" aria-hidden /> Verificación en dos pasos
      </h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        Además de la contraseña, al entrar te pedimos un código de una app de autenticación. Así nadie entra solo con tu contraseña.
      </p>

      {estado.tipo === 'cargando' ? (
        <p className="text-[12px] text-muted-foreground">Comprobando…</p>
      ) : activa ? (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-success">Activada en tu cuenta.</p>
          {exigida ? (
            <p className="text-[12px] text-muted-foreground">Tu estudio la pide a todo el equipo, así que no se puede quitar.</p>
          ) : confirmar ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-foreground">¿Seguro? Volverás a entrar solo con la contraseña.</span>
              <button
                onClick={() => void quitar()} disabled={quitando}
                className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-destructive hover:bg-background disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {quitando && <Loader2 size={13} className="animate-spin" aria-hidden />} Sí, quitarla
              </button>
              <button onClick={() => setConfirmar(false)} className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium hover:bg-background">
                No
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmar(true)} className="px-4 py-2 rounded-lg bg-card border border-border text-[12px] font-medium hover:bg-background">
              Desactivar
            </button>
          )}
        </div>
      ) : (
        <Link
          href="/verificar-acceso?activar=1&volver=/mi-perfil"
          className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-bold hover:brightness-95"
        >
          Activar
        </Link>
      )}
      {msg && <p className={cn('text-[11px] mt-3', msg.error ? 'text-destructive' : 'text-success')}>{msg.texto}</p>}
    </div>
  );
}
