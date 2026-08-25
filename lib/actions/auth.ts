'use server';

import { accionSinImplementar } from '@/lib/actions/errores';

/**
 * Server Action: Resetear intentos de verificación OTP tras reenvío exitoso.
 *
 * SIN IMPLEMENTAR a propósito. El cuerpo anterior sí borraba de verdad la fila
 * de `rate_limits` con `bucket_key = otp-verify-email:<email>` —que es el
 * cerrojo de 6 intentos / 15 min que protege un código de 6 dígitos— y lo
 * hacía SIN autenticación y SIN el rate limit por IP que sí tiene la ruta de
 * API original (`app/api/auth/otp/reenviado/route.ts`: 10 resets / 5 min).
 * Conectarla habría dejado el cerrojo del OTP reseteable a voluntad por
 * cualquiera que conociese un email.
 *
 * Mientras la identidad no viaje bien hasta las Server Actions (ver el aviso
 * de `requireAuthInServerAction`), la ruta de API es la buena.
 */
export async function resetearIntentosOtpAction(_email: string) {
  accionSinImplementar('resetearIntentosOtpAction');
}

/**
 * Server Action: Verificar código OTP y crear sesión.
 *
 * SIN IMPLEMENTAR. El cuerpo anterior devolvía `{ ok: true }` para CUALQUIER
 * par email/token no vacío, sin llegar a llamar a `verifyOtp`. Por sí sola no
 * creaba sesión, así que no autenticaba a nadie; el peligro era el llamante
 * futuro que leyese ese `ok: true` como "el código es correcto".
 */
export async function verificarOtpAction(_email: string, _token: string) {
  accionSinImplementar('verificarOtpAction');
}
