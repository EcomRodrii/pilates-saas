// El fragmento con el que vuelve a la app un enlace de recuperación de
// contraseña del equipo (flujo implícito de gotrue).
//
// El token tiene la FORMA de los de gotrue porque `/clave-nueva` lo lee: solo
// abre el formulario si la sesión nació de verificar el correo en ese mismo
// momento (`amr` = `otp`, sellado a la vez que el token —
// lib/auth/recuperacion-contrasena.ts). La firma no la comprueba el navegador
// (en la vida real la comprueba el servidor de auth al canjear), y aquí
// `GET /auth/v1/user` va mockeado en cada spec.

function b64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

/** Access token de una sesión nacida con el método `metodo` (por defecto, el del enlace de correo). */
export function tokenDeSesion(sub: string, metodo = 'otp') {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = {
    sub, aud: 'authenticated', role: 'authenticated', iat: ahora, exp: ahora + 3600,
    amr: [{ method: metodo, timestamp: ahora }],
  };
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.firma-e2e`;
}

/** `#…` tal cual lo deja gotrue al volver de un enlace de recuperación. */
export function fragmentoDeRecuperacion(accessToken: string) {
  return `access_token=${accessToken}&refresh_token=e2e-fake-refresh`
    + '&expires_in=3600&token_type=bearer&type=recovery';
}
