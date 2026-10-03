// Qué paso de verificación en dos pasos le falta a la sesión del panel
// (reglas en lib/auth/doble-factor-reglas.ts). Lo usa DashboardShell al
// arrancar para mandar a /verificar-acceso antes de pintar un panel que, sin
// ese paso, la base de datos dejaría vacío.
//
// Es una guardia de USABILIDAD: la cerradura es la base de datos (política
// `exige_doble_factor`) y `verificarSesionStaff`. Por eso, si algo falla aquí,
// devuelve 'ok' y deja que el panel siga: el servidor no dará nada que no deba.
import { supabase } from '@/lib/db/supabase';
import type { PasoDobleFactor } from '@/lib/auth/doble-factor-reglas';

/**
 * 'recargar': la sesión se acaba de confiar por un dispositivo recordado, y lo
 * que el panel ya hubiera pedido con ella le llegó vacío. Una recarga lo arregla.
 */
export type PasoDelPanel = PasoDobleFactor | 'recargar';

export async function pasoDobleFactorDelPanel(accessToken: string): Promise<PasoDelPanel> {
  try {
    // Sin red: el nivel sale del propio token y los factores, de la sesión.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') return 'ok';
    if (aal?.nextLevel === 'aal2') {
      // Tiene la verificación activada y la sesión no la ha pasado: si viene de
      // un dispositivo recordado, entra sin código.
      const confianza = await confiarEnEsteDispositivo(accessToken);
      if (confianza === 'confiada') return 'ok';
      if (confianza === 'nueva') return 'recargar';
      return 'verificar';
    }
    // Sin factor: solo falta algo si su estudio la exige, y eso lo sabe el servidor.
    const res = await fetch('/api/auth/doble-factor', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (!res.ok) return 'ok';
    const { paso } = await res.json() as { paso?: PasoDobleFactor };
    return paso === 'activar' || paso === 'verificar' ? paso : 'ok';
  } catch {
    return 'ok';
  }
}

/**
 * Presenta el dispositivo recordado de esta cuenta (su cookie HttpOnly viaja
 * sola) para que la sesión cuente como verificada sin escribir el código
 * (lib/auth/dispositivo-confianza-reglas.ts). 'nueva' = se acaba de confiar;
 * 'confiada' = ya lo estaba; 'no' = hay que escribir el código.
 */
export async function confiarEnEsteDispositivo(accessToken: string): Promise<'nueva' | 'confiada' | 'no'> {
  try {
    const res = await fetch('/api/auth/dispositivo-confianza/usar', {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
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
 * Tras el login, ANTES de ir al panel: si a esta sesión le falta el código y el
 * navegador está recordado, que cuente ya como verificada. Así el panel arranca
 * con todos sus datos en vez de recargarse. Sin la verificación activada no
 * hace ninguna llamada.
 */
export async function confiarAntesDeEntrar(accessToken: string): Promise<void> {
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') await confiarEnEsteDispositivo(accessToken);
  } catch {
    // El panel lo vuelve a intentar al arrancar.
  }
}

/**
 * Recuerda este navegador, justo después de escribir el código. Si falla, solo
 * significa que la próxima vez lo volverá a pedir: no impide entrar.
 */
export async function recordarEsteDispositivo(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;
    const res = await fetch('/api/auth/dispositivo-confianza', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      // Un iPad se presenta como Mac: la pantalla táctil lo distingue (solo para el nombre).
      body: JSON.stringify({ tactil: typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── El segundo paso por correo (lib/auth/codigo-correo-reglas.ts) ───────────

export type EnvioCorreo =
  | { tipo: 'enviado'; esperaSegundos: number }
  /** El correo no sirve en esta sesión: a la app, con este motivo. */
  | { tipo: 'no-disponible'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

async function tokenActual(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Pide que manden el código al correo de la cuenta. `reenviar: false` al abrir
 * la pantalla (si ya hay uno vivo, no sale otro); `true`, el botón.
 */
export async function enviarCodigoPorCorreo(reenviar: boolean): Promise<EnvioCorreo> {
  try {
    const token = await tokenActual();
    if (!token) return { tipo: 'error', mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' };
    const res = await fetch('/api/auth/doble-factor-correo/enviar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reenviar }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const r = await res.json().catch(() => ({})) as {
      enviado?: boolean; yaEnviado?: boolean; espera?: number; disponible?: boolean; mensaje?: string; error?: string;
    };
    if (!res.ok) return { tipo: 'error', mensaje: r.error ?? 'No se ha podido enviar el código. Vuelve a intentarlo o usa tu app de autenticación.' };
    if (r.disponible === false) return { tipo: 'no-disponible', mensaje: r.mensaje ?? 'Usa tu app de autenticación.' };
    if (r.enviado) return { tipo: 'enviado', esperaSegundos: 30 };
    if (typeof r.espera === 'number') return { tipo: 'enviado', esperaSegundos: r.espera };
    return { tipo: 'enviado', esperaSegundos: 0 };
  } catch {
    return { tipo: 'error', mensaje: 'No se ha podido enviar el código. Vuelve a intentarlo o usa tu app de autenticación.' };
  }
}

/** Comprueba el código del correo. `aLaApp`: el correo ya no vale en esta sesión. */
export async function verificarCodigoDelCorreo(
  codigo: string, recordar: boolean,
): Promise<{ ok: true } | { ok: false; mensaje: string; aLaApp: boolean }> {
  try {
    const token = await tokenActual();
    if (!token) return { ok: false, mensaje: 'Tu sesión ha caducado. Vuelve a entrar.', aLaApp: false };
    const res = await fetch('/api/auth/doble-factor-correo/verificar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, recordar, tactil: typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const r = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; aLaApp?: boolean };
    if (res.ok && r.ok) return { ok: true };
    return { ok: false, mensaje: r.error ?? 'No se ha podido comprobar el código. Vuelve a intentarlo.', aLaApp: r.aLaApp === true };
  } catch {
    return { ok: false, mensaje: 'No se ha podido comprobar el código. Vuelve a intentarlo.', aLaApp: false };
  }
}

/**
 * Justo después de pasar la app (sesión `aal2`): reabre el correo como segundo
 * paso si un cambio de contraseña o de correo lo había cerrado. Si falla, la
 * próxima vez se volverá a pedir la app; no impide entrar.
 */
export async function reabrirCorreoTrasLaApp(): Promise<void> {
  try {
    const token = await tokenActual();
    if (!token) return;
    await fetch('/api/auth/doble-factor-correo/reabrir', {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
  } catch {
    // ver arriba
  }
}
