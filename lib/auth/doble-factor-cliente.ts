// Qué paso de verificación en dos pasos le falta a la sesión del panel
// (reglas en lib/auth/doble-factor-reglas.ts). Lo usa DashboardShell al
// arrancar para mandar a /verificar-acceso antes de pintar un panel que, sin
// ese paso, la base de datos dejaría vacío.
//
// Es una guardia de USABILIDAD: la cerradura es la base de datos (política
// `exige_doble_factor`) y `verificarSesionStaff`. Por eso, si algo falla aquí,
// devuelve 'ok' y deja que el panel siga: el servidor no dará nada que no deba.
import { supabase } from '@/lib/db/supabase';
import { sesionPideCodigo, type PasoDobleFactor } from '@/lib/auth/doble-factor-reglas';
import {
  confiarDispositivo, enviarCodigoCorreo, recordarDispositivo, reabrirCorreo, verificarCodigoCorreo, type EnvioCorreo,
} from '@/lib/auth/doble-factor-acciones';

/**
 * 'recargar': la sesión se acaba de confiar por un dispositivo recordado, y lo
 * que el panel ya hubiera pedido con ella le llegó vacío. Una recarga lo arregla.
 */
export type PasoDelPanel = PasoDobleFactor | 'recargar';

export async function pasoDobleFactorDelPanel(accessToken: string): Promise<PasoDelPanel> {
  try {
    // Sin red: el nivel sale del propio token y los factores, de la sesión.
    const [{ data: aal }, { data: { session } }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.getSession(),
    ]);
    if (aal?.currentLevel === 'aal2') return 'ok';
    if (sesionPideCodigo({ actual: aal?.currentLevel, factores: session?.user.factors })) {
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

/** Presenta el dispositivo recordado (ver `confiarDispositivo`, lib/auth/doble-factor-acciones.ts). */
export async function confiarEnEsteDispositivo(accessToken: string): Promise<'nueva' | 'confiada' | 'no'> {
  return confiarDispositivo(accessToken);
}

/**
 * Tras el login, ANTES de ir al panel: si a esta sesión le falta el código y el
 * navegador está recordado, que cuente ya como verificada. Así el panel arranca
 * con todos sus datos en vez de recargarse. Sin la verificación activada no
 * hace ninguna llamada.
 */
export async function confiarAntesDeEntrar(accessToken: string): Promise<void> {
  try {
    const [{ data: aal }, { data: { session } }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.getSession(),
    ]);
    if (sesionPideCodigo({ actual: aal?.currentLevel, factores: session?.user.factors })) await confiarEnEsteDispositivo(accessToken);
  } catch {
    // El panel lo vuelve a intentar al arrancar.
  }
}

async function tokenActual(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/** Recuerda este navegador tras escribir el código (ver lib/auth/doble-factor-acciones.ts). */
export async function recordarEsteDispositivo(): Promise<boolean> {
  const token = await tokenActual();
  return token ? recordarDispositivo(token) : false;
}

// ── El segundo paso por correo (lib/auth/codigo-correo-reglas.ts) ───────────

export type { EnvioCorreo } from '@/lib/auth/doble-factor-acciones';

const SIN_SESION = 'Tu sesión ha caducado. Vuelve a entrar.';

export async function enviarCodigoPorCorreo(reenviar: boolean): Promise<EnvioCorreo> {
  const token = await tokenActual();
  return token ? enviarCodigoCorreo(token, reenviar) : { tipo: 'error', mensaje: SIN_SESION };
}

export async function verificarCodigoDelCorreo(
  codigo: string, recordar: boolean,
): Promise<{ ok: true } | { ok: false; mensaje: string; aLaApp: boolean }> {
  const token = await tokenActual();
  return token ? verificarCodigoCorreo(token, codigo, recordar) : { ok: false, mensaje: SIN_SESION, aLaApp: false };
}

export async function reabrirCorreoTrasLaApp(): Promise<void> {
  const token = await tokenActual();
  if (token) await reabrirCorreo(token);
}
