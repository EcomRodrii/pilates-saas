// ─────────────────────────────────────────────────────────────────────────────
// El segundo paso por CORREO (3-oct-2026, decisión del fundador): al entrar al
// panel con la verificación en dos pasos activada, lo primero que se ofrece es
// un código de un solo uso enviado al correo de la cuenta; la app de
// autenticación queda para «No tengo acceso a mi correo».
//
// Cómo encaja: Supabase no tiene el correo como factor, así que verificarlo NO
// sube la sesión a `aal2`. La sesión se queda en `aal1` y el servidor la apunta
// en `sesiones_confiadas` con origen 'correo' (migr 20261003160000): la misma
// regla única que ya usan los dispositivos recordados (`sesion_confiada_de`),
// así que la base de datos y `verificarSesionStaff` la aceptan sin tocar una
// sola política.
//
// Lo que el correo NO da, a propósito:
//   · Activar la verificación: sigue siendo con la app (hace falta un factor de
//     Supabase para que exista la regla y para poder llegar a `aal2`).
//   · Quitar o añadir un factor, o apagar «exigir a todo el equipo»: lo protege
//     GoTrue / la ruta con `aal2` de verdad, que solo da la app.
//   · La zona interna (/interno): su propio `aal2`.
//
// Dos casos en los que el correo NO sirve de segundo paso, porque sería el
// mismo factor dos veces (fallan cerrado, y la pantalla ofrece la app). Los
// decide la BASE DE DATOS (`correo_doble_factor_disponible`), no este fichero:
//   · La sesión no entró con contraseña (`auth.mfa_amr_claims`): con Google, si
//     el correo es de Gmail, la cuenta de Google y el buzón son lo mismo; con un
//     enlace o código por correo (el acceso de la app de la alumna usa el mismo
//     usuario si alguien del equipo es también alumna), el primer paso YA fue el
//     correo.
//   · La cuenta cambió la contraseña o el correo y no ha vuelto a pasar la app:
//     con el buzón se restablece la contraseña, y el código llegaría a ese mismo
//     buzón. Dura hasta un `aal2` de verdad, no un plazo.
//
// Puro, sin imports de Next ni de `@/`, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

export const DIGITOS_CODIGO_CORREO = 6;
export const MINUTOS_CODIGO_CORREO = 10;
/** Intentos por código. Pasados, hay que pedir otro (y los envíos tienen límite). */
export const MAX_INTENTOS_CODIGO_CORREO = 5;
/** Entre un envío y el siguiente a la misma sesión. */
export const SEGUNDOS_ENTRE_ENVIOS = 30;
/** Envíos por cuenta en la ventana (además del intervalo mínimo). */
export const MAX_ENVIOS_POR_VENTANA = 5;
export const VENTANA_ENVIOS_SEGUNDOS = 15 * 60;
/** Intentos de verificar por cuenta en la ventana, sumando todos sus códigos. */
export const MAX_VERIFICACIONES_POR_VENTANA = 10;

export function caducidadCodigo(ahora: Date): Date {
  return new Date(ahora.getTime() + MINUTOS_CODIGO_CORREO * 60_000);
}

export function formatoCodigoValido(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && /^\d{6}$/.test(codigo);
}

/** Seis dígitos con ceros a la izquierda a partir de un entero uniforme en [0, 1e6). */
export function codigoDesdeEntero(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 10 ** DIGITOS_CODIGO_CORREO) throw new Error('fuera de rango');
  return String(n).padStart(DIGITOS_CODIGO_CORREO, '0');
}

export type MotivoSinCorreo =
  | 'sin_verificacion'  // no tiene la verificación activada: no hay segundo paso que dar
  | 'ya_verificada'     // la sesión ya está en `aal2`
  | 'sin_sesion'        // el token no trae una sesión viva de esa cuenta
  | 'sin_contrasena'    // entró con Google o por correo (lo decide la BD)
  | 'bloqueado'         // cambió la contraseña o el correo y no ha pasado la app (lo decide la BD)
  | 'sin_correo'        // la cuenta no tiene correo
  | 'buzon_rebota'      // su correo rebota o está suprimido: no le llegaría
  | 'sin_envio';        // el envío de correos no está disponible ahora

/** Lo que se comprueba antes de preguntar a la base de datos. */
export function motivoAntesDeLaBd(p: {
  nivel: 'aal1' | 'aal2'; factoresVerificados: number; sesion: string | null; email: string | null | undefined;
}): MotivoSinCorreo | null {
  if (p.factoresVerificados === 0) return 'sin_verificacion';
  if (p.nivel === 'aal2') return 'ya_verificada';
  if (!p.sesion) return 'sin_sesion';
  if (!p.email) return 'sin_correo';
  return null;
}

const MOTIVOS_BD: ReadonlySet<string> = new Set(['sin_sesion', 'sin_verificacion', 'sin_contrasena', 'bloqueado']);

/**
 * Lo que contesta `correo_doble_factor_disponible`: `null` = puede. Falla
 * cerrado: un error o un valor que no conocemos no es un «sí».
 */
export function motivoDeLaBd(valor: unknown, error: unknown): MotivoSinCorreo | null {
  if (error) return 'sin_envio';
  if (valor === null) return null;
  return typeof valor === 'string' && MOTIVOS_BD.has(valor) ? valor as MotivoSinCorreo : 'sin_sesion';
}

/** Lo que se le dice a la persona cuando el correo no le sirve (y se le pasa a la app). */
export function textoSinCorreo(m: MotivoSinCorreo): string {
  switch (m) {
    case 'sin_contrasena':
      return 'Has entrado sin contraseña, así que el código no puede ir a tu correo. Usa tu app de autenticación.';
    case 'bloqueado':
      return 'La contraseña o el correo de esta cuenta han cambiado. Por seguridad, esta vez el código es el de tu app de autenticación; después podrás volver a recibirlo por correo.';
    case 'sin_correo':
      return 'Tu cuenta no tiene correo. Usa tu app de autenticación.';
    case 'buzon_rebota':
      return 'Los correos a tu dirección no se están entregando. Usa tu app de autenticación.';
    case 'sin_envio':
      return 'Ahora mismo no podemos enviarte el código por correo. Usa tu app de autenticación.';
    case 'ya_verificada':
      return 'Esta sesión ya ha pasado la verificación.';
    case 'sin_sesion':
    case 'sin_verificacion':
      return 'No se puede enviar el código a esta sesión. Usa tu app de autenticación.';
  }
}

/** Segundos que faltan para poder pedir otro código (0 = ya se puede). */
export function esperaParaReenviar(enviadoEn: string | null | undefined, ahora: Date): number {
  if (!enviadoEn) return 0;
  const t = new Date(enviadoEn).getTime();
  if (!Number.isFinite(t)) return 0;
  const faltan = SEGUNDOS_ENTRE_ENVIOS * 1000 - (ahora.getTime() - t);
  return faltan > 0 ? Math.ceil(faltan / 1000) : 0;
}

export type ResultadoCodigo = 'ok' | 'incorrecto' | 'caducado' | 'agotado' | 'sin_codigo';

export function textoResultadoCodigo(r: Exclude<ResultadoCodigo, 'ok'>): string {
  switch (r) {
    case 'incorrecto': return 'Código incorrecto. Revisa el último correo que te hemos enviado.';
    case 'caducado': return `El código ha caducado (dura ${MINUTOS_CODIGO_CORREO} minutos). Pide otro.`;
    case 'agotado': return 'Demasiados intentos con este código. Pide otro.';
    case 'sin_codigo': return 'No hay ningún código pendiente para esta sesión. Pide uno.';
  }
}
