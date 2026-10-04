// Dispositivos de confianza: la parte que habla con la base de datos (reglas y
// explicación en ./dispositivo-confianza-reglas.ts). Solo servidor, con
// service_role: las tablas no tienen permisos para el navegador.
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { caducidadDesde, formatoTokenValido, MAX_DISPOSITIVOS_POR_CUENTA } from './dispositivo-confianza-reglas.ts';

type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** La huella de la cuenta que da nombre a su cookie (ver `nombreCookieDispositivo`). */
export function huellaCuenta(userId: string): string {
  return createHash('sha256').update(`dispositivo:${userId}`).digest('hex').slice(0, 16);
}

function nuevoToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Recuerda este navegador para la cuenta. Quien llama ya ha comprobado que la
 * sesión ha escrito el código (`aal2`). Si el navegador ya tenía un dispositivo
 * de esta cuenta, lo alarga en vez de crear otro. Devuelve el token de la cookie.
 */
export async function recordarDispositivo(db: Db, p: {
  userId: string; nombre: string; ip: string | null; tokenActual: string | null; ahora?: Date;
}): Promise<string> {
  const ahora = p.ahora ?? new Date();
  const renovacion = { nombre: p.nombre, ip_ultima: p.ip, ultimo_uso_en: ahora.toISOString(), caduca_en: caducidadDesde(ahora).toISOString() };
  if (formatoTokenValido(p.tokenActual)) {
    const { data, error } = await db.from('dispositivos_confianza')
      .update(renovacion)
      .eq('token_hash', hashToken(p.tokenActual)).eq('auth_user_id', p.userId)
      .select('id');
    if (error) throw new Error(`renovar dispositivo: ${error.message}`);
    if (data?.length) return p.tokenActual;
  }
  const token = nuevoToken();
  const { error } = await db.from('dispositivos_confianza').insert({
    ...renovacion, auth_user_id: p.userId, token_hash: hashToken(token), creado_en: ahora.toISOString(),
  });
  if (error) throw new Error(`recordar dispositivo: ${error.message}`);
  await podar(db, p.userId, ahora);
  return token;
}

/** Qué hacer con la cookie de esta cuenta al contestar. */
export type AccionCookie = { poner: string } | 'borrar' | null;

export interface ResultadoUsar {
  /** La sesión cuenta como verificada. */
  confiada: boolean;
  /** Se acaba de confiar ahora (lo que el panel ya pidió con ella, lo pidió sin). */
  nueva: boolean;
  cookie: AccionCookie;
}

/**
 * ¿Esta sesión puede entrar sin código?
 *   1. Si ya la confió el servidor y su dispositivo no ha caducado, sí, y se
 *      alarga: los 30 días cuentan desde la última vez que se usa.
 *   2. Si no, con la cookie: un dispositivo de ESTA cuenta y sin caducar. Al
 *      confiar, el token ROTA: una cookie copiada deja de valer en cuanto el
 *      navegador de verdad vuelve a entrar.
 * Lanza si la base de datos falla: quien llama responde error y la sesión se
 * queda como estaba (sin confiar), nunca al revés.
 */
export async function usarDispositivo(db: Db, p: {
  userId: string; sessionId: string | null; token: string | null; ip: string | null; ahora?: Date;
}): Promise<ResultadoUsar> {
  const ahora = p.ahora ?? new Date();
  if (!p.sessionId) return { confiada: false, nueva: false, cookie: null };
  const renovacion = { ip_ultima: p.ip, ultimo_uso_en: ahora.toISOString(), caduca_en: caducidadDesde(ahora).toISOString() };
  const tokenValido = formatoTokenValido(p.token);

  const { data: ya, error: errorYa } = await db.from('sesiones_confiadas')
    // `*` y no `origen` a pelo: con el código desplegado antes que la migración
    // 20261003160000 la columna no existe, y pedirla por nombre tumbaba también los
    // dispositivos recordados. Sin columna, `origen` llega undefined: dispositivo.
    .select('*').eq('session_id', p.sessionId).eq('auth_user_id', p.userId).maybeSingle();
  if (errorYa) throw new Error(`leer sesión confiada: ${errorYa.message}`);
  // Confiada por el código del correo (lib/auth/codigo-correo.ts): vale lo que
  // viva la sesión, sin dispositivo que alargar ni cookie que rotar. Sin esto,
  // la rama de la cookie la daba por «nueva» en cada carga y el panel se
  // recargaba sin fin.
  if (ya && ya.origen === 'correo') return { confiada: true, nueva: false, cookie: null };
  if (ya) {
    const { data: d, error } = await db.from('dispositivos_confianza')
      .select('id, caduca_en, token_hash').eq('id', ya.dispositivo_id).eq('auth_user_id', p.userId).maybeSingle();
    if (error) throw new Error(`leer dispositivo: ${error.message}`);
    if (d && new Date(d.caduca_en as string).getTime() > ahora.getTime()) {
      // Alargarlo es secundario: si falla, la sesión sigue confiada igual.
      await db.from('dispositivos_confianza').update(renovacion).eq('id', d.id).eq('auth_user_id', p.userId);
      // La cookie se alarga solo si es la de ESTE dispositivo.
      const cookie = tokenValido && hashToken(p.token as string) === d.token_hash ? { poner: p.token as string } : null;
      return { confiada: true, nueva: false, cookie };
    }
    // Caducado: como si no estuviera confiada.
  }

  if (!tokenValido) return { confiada: false, nueva: false, cookie: p.token != null ? 'borrar' : null };
  const hashActual = hashToken(p.token as string);
  const { data: disp, error } = await db.from('dispositivos_confianza')
    .select('id, caduca_en').eq('token_hash', hashActual).eq('auth_user_id', p.userId).maybeSingle();
  if (error) throw new Error(`leer dispositivo: ${error.message}`);
  if (!disp || new Date(disp.caduca_en as string).getTime() <= ahora.getTime()) {
    return { confiada: false, nueva: false, cookie: 'borrar' };
  }

  const { error: errorAlta } = await db.from('sesiones_confiadas').upsert(
    { session_id: p.sessionId, auth_user_id: p.userId, dispositivo_id: disp.id },
    { onConflict: 'session_id', ignoreDuplicates: true },
  );
  if (errorAlta) throw new Error(`confiar sesión: ${errorAlta.message}`);
  // Rotación con compare-and-set sobre el hash de antes: si otra pestaña del
  // mismo navegador lo rotó a la vez, su respuesta ya trae la cookie nueva.
  const tokenNuevo = nuevoToken();
  const { data: rotado } = await db.from('dispositivos_confianza')
    .update({ ...renovacion, token_hash: hashToken(tokenNuevo) })
    .eq('id', disp.id).eq('token_hash', hashActual)
    .select('id');
  await podar(db, p.userId, ahora);
  return { confiada: true, nueva: true, cookie: rotado?.length ? { poner: tokenNuevo } : null };
}

/**
 * ¿La confió el servidor? Lo pregunta `verificarSesionStaff` en cada ruta, a
 * la MISMA función SQL que usa la base de datos (`sesion_confiada_de`, migr
 * 20261003110108): no pueden decir cosas distintas. Ante cualquier fallo,
 * `false`: la sesión se trata como sin verificar.
 */
export async function sesionConfiada(db: Db, userId: string, sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;
  const { data, error } = await db.rpc('sesion_confiada_de', { p_usuario: userId, p_sesion: sessionId });
  return !error && data === true;
}

export interface DispositivoListado {
  id: string; nombre: string; ip: string | null; creadoEn: string; ultimoUsoEn: string; caducaEn: string; esEste: boolean;
}

export async function listarDispositivos(db: Db, userId: string, tokenActual: string | null, ahora = new Date()): Promise<DispositivoListado[]> {
  const { data, error } = await db.from('dispositivos_confianza')
    .select('id, nombre, ip_ultima, creado_en, ultimo_uso_en, caduca_en, token_hash')
    .eq('auth_user_id', userId).gt('caduca_en', ahora.toISOString())
    .order('ultimo_uso_en', { ascending: false });
  if (error) throw new Error(`listar dispositivos: ${error.message}`);
  const hashActual = formatoTokenValido(tokenActual) ? hashToken(tokenActual) : null;
  return (data ?? []).map(d => ({
    id: d.id as string, nombre: d.nombre as string, ip: (d.ip_ultima as string | null) ?? null,
    creadoEn: d.creado_en as string, ultimoUsoEn: d.ultimo_uso_en as string, caducaEn: d.caduca_en as string,
    esEste: hashActual != null && d.token_hash === hashActual,
  }));
}

/** Quita uno (`id`) o todos los de la cuenta. Sus sesiones dejan de contar como verificadas. */
export async function quitarDispositivos(db: Db, userId: string, id: string | null): Promise<void> {
  let consulta = db.from('dispositivos_confianza').delete().eq('auth_user_id', userId);
  if (id) consulta = consulta.eq('id', id);
  const { error } = await consulta;
  if (error) throw new Error(`quitar dispositivos: ${error.message}`);
}

/** Fuera los caducados y, si sobran, los menos usados. Limpieza: si falla, no pasa nada. */
async function podar(db: Db, userId: string, ahora: Date): Promise<void> {
  await db.from('dispositivos_confianza').delete().eq('auth_user_id', userId).lte('caduca_en', ahora.toISOString());
  const { data } = await db.from('dispositivos_confianza').select('id')
    .eq('auth_user_id', userId).order('ultimo_uso_en', { ascending: false });
  const sobran = (data ?? []).slice(MAX_DISPOSITIVOS_POR_CUENTA).map(d => d.id as string);
  if (sobran.length) await db.from('dispositivos_confianza').delete().in('id', sobran);
}
