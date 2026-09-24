'use client';

// El código de 6 cifras que llega por correo a una alumna NUEVA.
//
// La plantilla de «confirma tu correo» del proyecto manda SOLO el código, sin
// enlace (el alta del equipo la pasó a código a propósito). Y no solo la usa el
// registro con contraseña: cuando alguien pide «entrar con enlace» con un email
// que todavía no tiene cuenta confirmada, gotrue la crea y le manda ESE mismo
// correo, no el del enlace. Así que el registro del portal, el «enlace» del
// portal y el de /reservar dejaban a toda alumna nueva con un código en la mano
// y ningún sitio donde escribirlo.
//
// El código se comprueba en /api/auth/otp/verificar, el mismo que usa el alta
// del equipo (lleva el límite de intentos por email que gotrue no tiene), y la
// sesión que devuelve se abre en el cliente del PORTAL. Desde ahí cada pantalla
// sigue su camino de siempre, igual que si hubiera abierto un enlace.

import { useCallback, useEffect, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { LONGITUD_OTP, limpiarCodigo } from '@/lib/otp-utils';

type Resultado = { ok: true } | { error: string };

/** Comprueba el código y, si vale, deja la sesión abierta en el cliente del portal. */
export async function entrarConCodigoDelCorreo(email: string, codigo: string): Promise<Resultado> {
  let data: { ok?: true; session?: { access_token: string; refresh_token: string }; error?: string } | null = null;
  try {
    const res = await fetch('/api/auth/otp/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), token: codigo }),
    });
    data = await res.json().catch(() => null);
  } catch {
    return { error: 'No hemos podido comprobar el código. Revisa tu conexión e inténtalo de nuevo.' };
  }
  if (!data?.ok || !data.session) {
    return { error: data?.error ?? 'No hemos podido comprobar el código. Inténtalo de nuevo.' };
  }
  const { error } = await supabasePortal.auth.setSession(data.session);
  if (error) return { error: 'El código era correcto, pero no hemos podido abrir tu sesión. Inténtalo de nuevo.' };
  return { ok: true };
}

/** Mismo margen que el servidor entre dos correos a la misma dirección. */
const ESPERA_REENVIO_S = 60;

/**
 * Estado del campo del código. `reenviar` lo pone cada pantalla, porque cada
 * una manda el correo a su manera (alta con contraseña o enlace de acceso).
 * `alEntrar`, si la pantalla no se entera sola de la sesión nueva: se llama al
 * acertar, venga el código del botón o de completar las seis cifras.
 */
export function useCodigoDelCorreo(email: string, reenviar: () => Promise<Resultado>, alEntrar?: () => void) {
  const [codigo, setCodigoCrudo] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [espera, setEspera] = useState(0);
  const [reenviado, setReenviado] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setInterval(() => setEspera((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [espera]);

  const verificar = useCallback(async (valor: string): Promise<boolean> => {
    if (valor.length !== LONGITUD_OTP) { setError(`El código tiene ${LONGITUD_OTP} cifras.`); return false; }
    if (!email.trim()) { setError('Escribe el email al que te ha llegado el código.'); return false; }
    setError(''); setVerificando(true);
    const res = await entrarConCodigoDelCorreo(email, valor);
    setVerificando(false);
    if ('error' in res) { setError(res.error); setCodigoCrudo(''); return false; }
    alEntrar?.();
    return true;
  }, [email, alEntrar]);

  /** Al teclear o pegar. Con las seis cifras ya puestas se comprueba solo (el autocompletado del móvil las pone de golpe). */
  const escribir = useCallback((texto: string) => {
    const limpio = limpiarCodigo(texto);
    setCodigoCrudo(limpio);
    setError('');
    if (limpio.length === LONGITUD_OTP && !verificando) void verificar(limpio);
  }, [verificar, verificando]);

  const pedirOtro = useCallback(async () => {
    if (espera > 0) return;
    setError(''); setReenviado(false);
    const res = await reenviar();
    if ('error' in res) { setError(res.error); return; }
    setReenviado(true);
    setEspera(ESPERA_REENVIO_S);
  }, [espera, reenviar]);

  return { codigo, escribir, verificar: () => verificar(codigo), verificando, error, pedirOtro, espera, reenviado };
}
