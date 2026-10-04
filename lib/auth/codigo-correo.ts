// El segundo paso por correo: la parte que habla con la base de datos (reglas
// y explicación en ./codigo-correo-reglas.ts). Solo servidor, con service_role:
// las tablas no tienen permisos para el navegador.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  caducidadCodigo, codigoDesdeEntero, esperaParaReenviar, formatoCodigoValido, MAX_INTENTOS_CODIGO_CORREO,
  motivoDeLaBd, type MotivoSinCorreo, type ResultadoCodigo,
} from './codigo-correo-reglas.ts';

type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

/**
 * El hash que se guarda: HMAC con un secreto del servidor, atado a la cuenta y
 * a la sesión. Seis dígitos son un millón de posibilidades: con un sha256 a
 * pelo, un volcado de la tabla los sacaría en milisegundos.
 */
export function hashCodigo(secreto: string, userId: string, sessionId: string, codigo: string): string {
  if (!secreto) throw new Error('sin secreto para el código del correo');
  return createHmac('sha256', secreto).update(`doble-factor-correo:v1:${userId}:${sessionId}:${codigo}`).digest('hex');
}

/** ¿Puede esta sesión pasar el segundo paso por correo? Lo decide la BD. */
export async function correoDisponible(db: Db, userId: string, sessionId: string): Promise<MotivoSinCorreo | null> {
  const { data, error } = await db.rpc('correo_doble_factor_disponible', { p_usuario: userId, p_sesion: sessionId });
  return motivoDeLaBd(data, error);
}

export type ResultadoPedir =
  | { codigo: string }
  /** Hay uno vivo y no se ha pedido otro a propósito: no se manda nada. */
  | { yaEnviado: true }
  | { espera: number }
  | { motivo: MotivoSinCorreo };

/**
 * Crea (o sustituye) el código de esta sesión. Devuelve el código en claro para
 * enviarlo: es la única vez que existe fuera del correo.
 *   · `reenviar: false` (al abrir la pantalla): si ya hay uno vivo, no se
 *     manda otro — recargar la página no llena el buzón.
 *   · `reenviar: true` (el botón): uno nuevo, pero no antes de 30 s del último.
 */
export async function pedirCodigo(db: Db, p: {
  userId: string; sessionId: string; secreto: string; reenviar: boolean; ahora?: Date;
}): Promise<ResultadoPedir> {
  const ahora = p.ahora ?? new Date();
  const motivo = await correoDisponible(db, p.userId, p.sessionId);
  if (motivo) return { motivo };

  const { data: actual, error } = await db.from('codigos_correo_doble_factor')
    .select('enviado_en, caduca_en, usado_en, intentos')
    .eq('session_id', p.sessionId).eq('auth_user_id', p.userId).maybeSingle();
  if (error) throw new Error(`leer código: ${error.message}`);
  if (actual && !actual.usado_en) {
    const vivo = new Date(actual.caduca_en as string).getTime() > ahora.getTime()
      && (actual.intentos as number) < MAX_INTENTOS_CODIGO_CORREO;
    if (vivo && !p.reenviar) return { yaEnviado: true };
    const espera = esperaParaReenviar(actual.enviado_en as string, ahora);
    if (espera > 0) return { espera };
  }

  const codigo = codigoDesdeEntero(randomInt(0, 1_000_000));
  const { error: errorAlta } = await db.from('codigos_correo_doble_factor').upsert({
    session_id: p.sessionId, auth_user_id: p.userId,
    codigo_hash: hashCodigo(p.secreto, p.userId, p.sessionId, codigo),
    intentos: 0, enviado_en: ahora.toISOString(), caduca_en: caducidadCodigo(ahora).toISOString(), usado_en: null,
  }, { onConflict: 'session_id' });
  if (errorAlta) throw new Error(`guardar código: ${errorAlta.message}`);
  return { codigo };
}

/** Si el correo no llegó a salir: que el código no quede vivo sin que nadie lo tenga. */
export async function anularCodigo(db: Db, userId: string, sessionId: string): Promise<void> {
  await db.from('codigos_correo_doble_factor').delete().eq('session_id', sessionId).eq('auth_user_id', userId);
}

/**
 * Comprueba el código. Si es el bueno, la sesión queda confiada (origen
 * 'correo') en la misma transacción en que se gasta el código.
 *   1. `intento_codigo_correo` cuenta el intento con el candado de la fila y
 *      devuelve el hash solo si el código está vivo.
 *   2. Se compara aquí, en tiempo constante.
 *   3. `confirmar_codigo_correo` lo gasta con compare-and-set y confía la sesión.
 * Lanza si la base de datos falla: quien llama responde error y la sesión se
 * queda sin confiar, nunca al revés.
 */
export async function comprobarCodigo(db: Db, p: {
  userId: string; sessionId: string; codigo: unknown; secreto: string;
}): Promise<ResultadoCodigo | 'no_disponible'> {
  if (!formatoCodigoValido(p.codigo)) return 'incorrecto';
  const { data, error } = await db.rpc('intento_codigo_correo', {
    p_usuario: p.userId, p_sesion: p.sessionId, p_max_intentos: MAX_INTENTOS_CODIGO_CORREO,
  });
  if (error) throw new Error(`intento de código: ${error.message}`);
  const fila = (Array.isArray(data) ? data[0] : data) as { estado?: string; codigo_hash?: string | null } | null;
  switch (fila?.estado) {
    case 'vivo': break;
    case 'caducado': return 'caducado';
    case 'agotado': return 'agotado';
    case 'no_disponible': return 'no_disponible';
    default: return 'sin_codigo';
  }
  const esperado = Buffer.from(String(fila.codigo_hash ?? ''), 'hex');
  const recibido = Buffer.from(hashCodigo(p.secreto, p.userId, p.sessionId, p.codigo), 'hex');
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return 'incorrecto';

  const { data: confirmado, error: errorConfirmar } = await db.rpc('confirmar_codigo_correo', {
    p_usuario: p.userId, p_sesion: p.sessionId, p_hash: recibido.toString('hex'),
  });
  if (errorConfirmar) throw new Error(`confirmar código: ${errorConfirmar.message}`);
  // Otra petición lo gastó a la vez (o caducó justo ahora): como si no hubiera código.
  return confirmado === true ? 'ok' : 'sin_codigo';
}

/**
 * Tras pasar la app de verdad (`aal2`): el correo vuelve a valer como segundo
 * paso si se había cerrado por un cambio de contraseña o de correo.
 */
export async function reabrirCorreo(db: Db, userId: string): Promise<void> {
  const { error } = await db.from('doble_factor_correo_bloqueos').delete().eq('auth_user_id', userId);
  if (error) throw new Error(`reabrir correo: ${error.message}`);
}
