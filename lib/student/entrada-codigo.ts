// Los textos de entrar en el estudio con el código del correo (P08), puros para
// poder probarlos sin navegador.
//
// ⚠️ Sin imports ni `@/`: `node --test --experimental-strip-types` no resuelve
// ese alias, y un test que lo use no falla — deja de ejecutarse.

/**
 * Lo que dura un código: el `mailer_otp_exp` del proyecto (10 min), el mismo
 * para el correo de alta y el de entrar. Lo dicen la pantalla y el correo.
 */
export const MINUTOS_CADUCIDAD_CODIGO = 10;

/**
 * El correo en pantalla, con la parte de delante tapada: «lu•••@example.com».
 *
 * El dominio se deja ENTERO a propósito (la maqueta tapaba también el dominio):
 * es donde se cuelan las erratas —«exmaple.com», «.con» en vez de «.com»— y el único motivo
 * real de que un código no llegue nunca. Tapado, la alumna esperaría un correo
 * que no va a llegar y lo buscaría en spam; viéndolo, pulsa «Cambiar correo».
 */
export function enmascararCorreo(email: string): string {
  const limpio = email.trim();
  const arroba = limpio.lastIndexOf('@');
  if (arroba <= 0) return limpio;
  const local = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);
  const visible = local.length <= 3 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}•••@${dominio}`;
}

/** Por qué no ha valido el código, tal como lo sabe la pantalla. */
export type FalloCodigo =
  /** El servidor dice que no es, y no ha pasado el tiempo de caducar. */
  | { tipo: 'incorrecto'; intentosRestantes: number | null }
  /** Han pasado más de 10 minutos desde que se mandó: ya no vale aunque estuviera bien. */
  | { tipo: 'caducado'; reenviado: boolean }
  /** Demasiados intentos, sin conexión, el servidor caído…: el texto lo pone el servidor. */
  | { tipo: 'otro' };

/**
 * ¿Ha caducado? gotrue contesta lo MISMO a un código mal escrito y a uno
 * caducado —a propósito, para no dar pistas a quien prueba—, así que el
 * servidor no lo puede decir. La pantalla sí sabe cuándo lo mandó: pasados los
 * 10 minutos, ese código no vale, esté bien o mal.
 */
export function codigoCaducado(enviadoEn: number | null, ahora: number): boolean {
  return enviadoEn !== null && ahora - enviadoEn > MINUTOS_CADUCIDAD_CODIGO * 60_000;
}

/**
 * El mensaje de un código que no ha valido, o `null` si lo que hay que enseñar
 * es el texto del servidor (`tipo: 'otro'`).
 *
 * Los intentos solo se cuentan si el servidor los ha contado: sin ese dato,
 * decir «te quedan 5» sería inventárselo.
 */
export function mensajeCodigoFallido(f: FalloCodigo): string | null {
  if (f.tipo === 'caducado') {
    return f.reenviado
      ? 'Ha caducado. Te hemos mandado otro: usa el del último correo.'
      : `Ha caducado: los códigos duran ${MINUTOS_CADUCIDAD_CODIGO} minutos. Pide otro abajo.`;
  }
  if (f.tipo === 'otro') return null;
  const n = f.intentosRestantes;
  if (n === null) return 'Ese código no es. Revisa el último correo que te hemos mandado.';
  if (n <= 0) return 'Ese código no es, y no te quedan más intentos. Espera unos minutos y pide otro código.';
  return `Ese código no es. Te ${n === 1 ? 'queda 1 intento' : `quedan ${n} intentos`}.`;
}
