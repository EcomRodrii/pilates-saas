'use client';

// «Verificación en dos pasos» en Mi perfil (2-oct-2026, contrato de encargo):
// cualquiera del equipo del panel puede activarla para su cuenta. Activar y
// escribir el código se hace en /verificar-acceso; aquí se ve cómo está y se
// puede quitar (salvo que el estudio la exija a todo el equipo, o que la cuenta
// sea del equipo de Tentare: `/interno` la volvería a crear, ver
// lib/auth/obligatoria-tentare.ts).
//
// Quitarla exige la sesión verificada (`aal2`): Supabase lo rechaza si no, y
// con la sesión sin verificar ni se llega a este panel. Una sesión que entró
// sin código por un dispositivo recordado, o con el código del correo, tampoco
// vale para eso (lo decide Supabase): se le ofrece escribir el de la app
// (`/verificar-acceso?codigo=1`).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { cn } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
import { DispositivosConfianza } from '@/components/auth/dispositivos-confianza';

// `sinCodigo`: tiene la verificación activada y esta sesión entró sin escribir
// el código (dispositivo recordado). Para lo que Supabase protege con el código
// de verdad —quitarla, cambiar email o contraseña— primero hay que escribirlo.
type Estado = { tipo: 'cargando' } | { tipo: 'listo'; factores: { id: string }[]; exigida: boolean; tentare: boolean; sinCodigo: boolean };

export function BloqueDobleFactor() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [quitando, setQuitando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; error: boolean; pedirCodigo?: boolean } | null>(null);

  const leer = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const [factores, porEstudio, aal] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      fetch('/api/auth/doble-factor', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ estudioLoExige?: boolean; obligatoriaTentare?: boolean } | null>,
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const totp = factores.data?.totp ?? [];
    setEstado({
      tipo: 'listo', factores: totp, exigida: porEstudio?.estudioLoExige === true,
      tentare: porEstudio?.obligatoriaTentare === true,
      sinCodigo: totp.length > 0 && aal.data?.currentLevel === 'aal1',
    });
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
          setMsg({ texto: 'Para quitarla tienes que escribir el código en esta sesión.', error: true, pedirCodigo: true });
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
  const tentare = estado.tipo === 'listo' && estado.tentare;

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-1.5">
        <ShieldCheck size={15} className="text-muted-foreground" aria-hidden /> Verificación en dos pasos
      </h3>
      <p className="text-[12px] text-muted-foreground mb-4">
        Además de la contraseña, al entrar te enviamos un código a tu correo; si no puedes abrirlo, vale el de tu app de autenticación. Así nadie entra solo con tu contraseña.
      </p>

      {estado.tipo === 'cargando' ? (
        <p className="text-[12px] text-muted-foreground">Comprobando…</p>
      ) : activa ? (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-success">Activada en tu cuenta.</p>
          {estado.tipo === 'listo' && estado.sinCodigo && (
            <p className="text-[12px] text-muted-foreground">
              Has entrado con el código del correo o desde un dispositivo de confianza. Para {tentare ? '' : 'quitar la verificación o '}cambiar tu email o contraseña, escribe antes el código de tu app.{' '}
              <Link href="/verificar-acceso?codigo=1&volver=/mi-perfil" className="font-semibold text-foreground underline">Escribir el código de la app</Link>
            </p>
          )}
          {tentare ? (
            <p className="text-[12px] text-muted-foreground">Tu cuenta es del equipo de Tentare y la zona interna la exige, así que no se puede quitar. Marca «No volver a pedirlo en este dispositivo» al escribir el código y no te lo pediremos en 30 días.</p>
          ) : exigida ? (
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
          <DispositivosConfianza />
        </div>
      ) : (
        <Link
          href="/verificar-acceso?activar=1&volver=/mi-perfil"
          className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[12px] font-bold hover:brightness-95"
        >
          Activar
        </Link>
      )}
      {msg && (
        <p className={cn('text-[11px] mt-3', msg.error ? 'text-destructive' : 'text-success')}>
          {msg.texto}
          {msg.pedirCodigo && (
            <>
              {' '}
              <Link href="/verificar-acceso?codigo=1&volver=/mi-perfil" className="font-semibold underline">Escribir el código</Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
