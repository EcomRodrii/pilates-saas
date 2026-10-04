// Escribir el código de la app de autenticación (TOTP) con un cliente de auth
// cualquiera: el de la app del estudio o el del widget (los dos son
// `supabasePortal`). Sube la sesión a `aal2`. El panel tiene su propia pantalla
// (app/verificar-acceso), con el mismo criterio de mensajes.
import type { AuthClient } from '@supabase/auth-js';

type ClienteMfa = Pick<InstanceType<typeof AuthClient>, 'mfa' | 'refreshSession'>;

export function mensajeErrorCodigoApp(e: { code?: string } | null | undefined): string {
  switch (e?.code) {
    case 'mfa_verification_failed':
    case 'mfa_verification_rejected':
      return 'Código incorrecto. Comprueba que la hora del móvil es la correcta y prueba con el siguiente.';
    case 'mfa_challenge_expired':
      return 'El código ha caducado. Escribe el que muestra ahora la app.';
    case 'over_request_rate_limit':
    case 'too_many_requests':
      return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
    default:
      return 'No se ha podido comprobar el código. Vuelve a intentarlo.';
  }
}

/** Comprueba el código del factor de la app ya activado. */
export async function verificarCodigoApp(auth: ClienteMfa, codigo: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  try {
    const { data: lista, error: eLista } = await auth.mfa.listFactors();
    const factor = lista?.totp?.find((f: { status: string }) => f.status === 'verified');
    if (eLista || !factor) return { ok: false, mensaje: mensajeErrorCodigoApp(eLista) };
    const reto = await auth.mfa.challenge({ factorId: factor.id });
    if (reto.error) return { ok: false, mensaje: mensajeErrorCodigoApp(reto.error) };
    const ok = await auth.mfa.verify({ factorId: factor.id, challengeId: reto.data.id, code: codigo });
    if (ok.error) return { ok: false, mensaje: mensajeErrorCodigoApp(ok.error) };
    // `verify` ya guarda la sesión nueva; refrescar deja el token en `aal2`
    // antes de que nada vuelva a pedir datos.
    await auth.refreshSession();
    return { ok: true };
  } catch {
    return { ok: false, mensaje: mensajeErrorCodigoApp(null) };
  }
}
