'use client';

// El código de 6 cifras que llega por correo para entrar.
//
// Las plantillas del proyecto mandan SOLO el código, sin enlace: la de «confirma
// tu correo» (alta) desde que el alta del equipo pasó a código, y la de «entrar»
// (Magic Link) desde #2522. A una cuenta nueva gotrue le manda la primera; a una
// que ya existe, la segunda. Las dos traen un código de 6 cifras.
//
// El código se comprueba en /api/auth/otp/verificar, el mismo que usa el alta
// del equipo (lleva el límite de intentos por email que gotrue no tiene), y la
// sesión que devuelve se abre en el cliente del PORTAL. Desde ahí cada pantalla
// sigue su camino de siempre, igual que si hubiera abierto un enlace.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { LONGITUD_OTP, limpiarCodigo } from '@/lib/otp-utils';
import { codigoCaducado, type FalloCodigo } from '@/lib/student/entrada-codigo';

type Resultado = { ok: true } | { error: string };
type ResultadoCodigo = { ok: true } | { error: string; errorCode?: string; intentosRestantes?: number };

/** Comprueba el código y, si vale, deja la sesión abierta en el cliente del portal. */
export async function entrarConCodigoDelCorreo(email: string, codigo: string): Promise<ResultadoCodigo> {
  let data: {
    ok?: true; session?: { access_token: string; refresh_token: string };
    error?: string; errorCode?: string; intentosRestantes?: unknown;
  } | null = null;
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
    return {
      error: data?.error ?? 'No hemos podido comprobar el código. Inténtalo de nuevo.',
      errorCode: data?.errorCode,
      // Solo si el servidor los ha contado de verdad (ver la ruta).
      intentosRestantes: typeof data?.intentosRestantes === 'number' ? data.intentosRestantes : undefined,
    };
  }
  const { error } = await supabasePortal.auth.setSession(data.session);
  if (error) return { error: 'El código era correcto, pero no hemos podido abrir tu sesión. Inténtalo de nuevo.' };
  return { ok: true };
}

/** Mismo margen que el servidor entre dos correos a la misma dirección. */
const ESPERA_REENVIO_S = 60;

export interface OpcionesCodigo {
  /**
   * Al fallar un código, con el porqué (P08: pintar las casillas en rojo y
   * volver a la primera). Que sea estable (`useCallback`): entra en las
   * dependencias de la comprobación.
   */
  alFallar?: (f: FalloCodigo) => void;
  /** Si el código ya había caducado al escribirlo, manda otro sin que lo pida. */
  reenviarSiCaduca?: boolean;
}

/**
 * Estado del campo del código. `reenviar` lo pone cada pantalla, porque cada
 * una manda el correo a su manera (alta con contraseña o enlace de acceso).
 * `alEntrar`, si la pantalla no se entera sola de la sesión nueva: se llama al
 * acertar, venga el código del botón o de completar las seis cifras.
 *
 * `error` es el texto del servidor tal cual; `fallo`, el porqué estructurado,
 * para la pantalla que quiera decirlo con sus palabras (`mensajeCodigoFallido`).
 * `anotarEnvio` la llama la pantalla que manda el PRIMER correo: arranca la
 * cuenta atrás del reenvío y deja saber, más tarde, si el código ha caducado.
 */
export function useCodigoDelCorreo(email: string, reenviar: () => Promise<Resultado>, alEntrar?: () => void, opciones: OpcionesCodigo = {}) {
  const { alFallar, reenviarSiCaduca = false } = opciones;
  const [codigo, setCodigoCrudo] = useState('');
  const [error, setError] = useState('');
  const [fallo, setFallo] = useState<FalloCodigo | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [espera, setEspera] = useState(0);
  const [reenviado, setReenviado] = useState(false);
  // Cuándo salió el último correo. Una ref y no un estado: no se pinta, solo
  // se consulta al fallar.
  const enviadoEn = useRef<number | null>(null);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setInterval(() => setEspera((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [espera]);

  const anotarEnvio = useCallback(() => {
    enviadoEn.current = Date.now();
    setEspera(ESPERA_REENVIO_S);
  }, []);

  const verificar = useCallback(async (valor: string): Promise<boolean> => {
    if (valor.length !== LONGITUD_OTP) { setError(`El código tiene ${LONGITUD_OTP} cifras.`); return false; }
    if (!email.trim()) { setError('Escribe el email al que te ha llegado el código.'); return false; }
    setError(''); setFallo(null); setVerificando(true);
    const res = await entrarConCodigoDelCorreo(email, valor);
    if (!('error' in res)) { setVerificando(false); alEntrar?.(); return true; }

    setCodigoCrudo('');
    let f: FalloCodigo;
    if (res.errorCode === 'INVALIDO' && codigoCaducado(enviadoEn.current, Date.now())) {
      // Ese ya no puede valer: si la pantalla lo pide, sale otro sin tener que pulsar nada.
      const otro = reenviarSiCaduca ? await reenviar() : null;
      const salio = !!otro && !('error' in otro);
      if (salio) { enviadoEn.current = Date.now(); setEspera(ESPERA_REENVIO_S); setReenviado(true); }
      f = { tipo: 'caducado', reenviado: salio };
    } else if (res.errorCode === 'INVALIDO') {
      f = { tipo: 'incorrecto', intentosRestantes: res.intentosRestantes ?? null };
    } else {
      f = { tipo: 'otro' };
    }
    setVerificando(false);
    setError(res.error);
    setFallo(f);
    alFallar?.(f);
    return false;
  }, [email, alEntrar, alFallar, reenviar, reenviarSiCaduca]);

  /** Al teclear o pegar. Con las seis cifras ya puestas se comprueba solo (el autocompletado del móvil las pone de golpe). */
  const escribir = useCallback((texto: string) => {
    const limpio = limpiarCodigo(texto);
    setCodigoCrudo(limpio);
    setError(''); setFallo(null);
    if (limpio.length === LONGITUD_OTP && !verificando) void verificar(limpio);
  }, [verificar, verificando]);

  const pedirOtro = useCallback(async () => {
    if (espera > 0) return;
    setError(''); setFallo(null); setReenviado(false);
    const res = await reenviar();
    if ('error' in res) { setError(res.error); return; }
    enviadoEn.current = Date.now();
    setReenviado(true);
    setEspera(ESPERA_REENVIO_S);
  }, [espera, reenviar]);

  return { codigo, escribir, verificar: () => verificar(codigo), verificando, error, fallo, pedirOtro, espera, reenviado, anotarEnvio };
}
