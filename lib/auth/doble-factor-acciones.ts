// Lo que el NAVEGADOR le pide al servidor en la verificación en dos pasos, con
// el token de la sesión que toque: el del panel (lib/auth/doble-factor-cliente.ts)
// o el de la app del estudio (lib/student/doble-factor-portal.ts). No importa
// ningún cliente de Supabase a propósito: así lo comparten los dos sin que uno
// arrastre al otro, y el servidor decide igual para los dos (la puerta es
// `pasoDeLaSesion`, lib/auth-server.ts).
//
// Todo falla hacia «hay que escribir el código», nunca hacia dentro.

import { senalConLimite } from '@/lib/senal-con-limite';

const tactil = () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;

/**
 * Presenta el dispositivo recordado de esta cuenta (su cookie HttpOnly viaja
 * sola) para que la sesión cuente como verificada sin escribir el código.
 * 'nueva' = se acaba de confiar; 'confiada' = ya lo estaba (también la que
 * confió el código del correo); 'no' = hay que escribir el código.
 */
export async function confiarDispositivo(token: string): Promise<'nueva' | 'confiada' | 'no'> {
  try {
    const res = await fetch('/api/auth/dispositivo-confianza/usar', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!res.ok) return 'no';
    const r = await res.json() as { confiada?: boolean; nueva?: boolean };
    if (!r.confiada) return 'no';
    return r.nueva ? 'nueva' : 'confiada';
  } catch {
    return 'no';
  }
}

/**
 * Recuerda este navegador, justo después de escribir el código de la app
 * (sesión `aal2`). Si falla, solo significa que la próxima vez lo volverá a
 * pedir: no impide entrar.
 */
export async function recordarDispositivo(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/dispositivo-confianza', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      // Un iPad se presenta como Mac: la pantalla táctil lo distingue (solo para el nombre).
      body: JSON.stringify({ tactil: tactil() }),
      cache: 'no-store',
      signal: senalConLimite(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type EnvioCorreo =
  | { tipo: 'enviado'; esperaSegundos: number }
  /** El correo no sirve en esta sesión: a la app, con este motivo. */
  | { tipo: 'no-disponible'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

const ERROR_ENVIO = 'No se ha podido enviar el código. Vuelve a intentarlo o usa tu app de autenticación.';
const ERROR_COMPROBAR = 'No se ha podido comprobar el código. Vuelve a intentarlo.';

/**
 * Pide que manden el código al correo de la cuenta (nunca a otro: el servidor
 * lo saca de la sesión). `reenviar: false` al abrir la pantalla (si ya hay uno
 * vivo, no sale otro); `true`, el botón. `slug`: desde la app de un estudio, el
 * correo lleva su marca (el servidor comprueba que sea alumna o del equipo).
 */
export async function enviarCodigoCorreo(token: string, reenviar: boolean, slug?: string): Promise<EnvioCorreo> {
  try {
    const res = await fetch('/api/auth/doble-factor-correo/enviar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(slug ? { reenviar, slug } : { reenviar }),
      cache: 'no-store',
      signal: senalConLimite(15000),
    });
    const r = await res.json().catch(() => ({})) as {
      enviado?: boolean; espera?: number; disponible?: boolean; mensaje?: string; error?: string;
    };
    if (!res.ok) return { tipo: 'error', mensaje: r.error ?? ERROR_ENVIO };
    if (r.disponible === false) return { tipo: 'no-disponible', mensaje: r.mensaje ?? 'Usa tu app de autenticación.' };
    if (r.enviado) return { tipo: 'enviado', esperaSegundos: 30 };
    if (typeof r.espera === 'number') return { tipo: 'enviado', esperaSegundos: r.espera };
    return { tipo: 'enviado', esperaSegundos: 0 };
  } catch {
    return { tipo: 'error', mensaje: ERROR_ENVIO };
  }
}

/** Comprueba el código del correo. `aLaApp`: el correo ya no vale en esta sesión. */
export async function verificarCodigoCorreo(
  token: string, codigo: string, recordar: boolean,
): Promise<{ ok: true } | { ok: false; mensaje: string; aLaApp: boolean }> {
  try {
    const res = await fetch('/api/auth/doble-factor-correo/verificar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, recordar, tactil: tactil() }),
      cache: 'no-store',
      signal: senalConLimite(15000),
    });
    const r = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; aLaApp?: boolean };
    if (res.ok && r.ok) return { ok: true };
    return { ok: false, mensaje: r.error ?? ERROR_COMPROBAR, aLaApp: r.aLaApp === true };
  } catch {
    return { ok: false, mensaje: ERROR_COMPROBAR, aLaApp: false };
  }
}

/**
 * Justo después de pasar la app (sesión `aal2`): reabre el correo como segundo
 * paso si un cambio de contraseña o de correo lo había cerrado. Si falla, la
 * próxima vez se volverá a pedir la app; no impide entrar.
 */
export async function reabrirCorreo(token: string): Promise<void> {
  try {
    await fetch('/api/auth/doble-factor-correo/reabrir', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: senalConLimite(8000),
    });
  } catch {
    // ver arriba
  }
}
