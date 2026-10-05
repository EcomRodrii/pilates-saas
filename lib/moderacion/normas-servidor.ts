// Normas de la comunidad: lo que comprueban y guardan las rutas de servidor.
// Con service-role (`normas_comunidad_aceptaciones` no tiene políticas para el
// navegador). Sin `@/`: se prueba con `node --test` y un doble del cliente.

import { CODIGO_NORMAS_PENDIENTES, TEXTO_NORMAS_PENDIENTES, VERSION_NORMAS } from './normas.ts';
import { TEXTO_FILTRO, palabrasNoPermitidas } from './filtro.ts';
import type { SupabaseClient } from '@supabase/supabase-js';


/** ¿Ha aceptado esta cuenta la versión vigente? Un fallo de lectura LANZA: nunca se lee como «sí». */
export async function normasAceptadas(admin: SupabaseClient, authUserId: string): Promise<boolean> {
  const { data, error } = await admin.from('normas_comunidad_aceptaciones')
    .select('version').eq('auth_user_id', authUserId).eq('version', VERSION_NORMAS).maybeSingle();
  if (error) throw new Error(`normas_comunidad_aceptaciones: ${error.message}`);
  return Boolean(data);
}

/** Registra la aceptación de la versión vigente. Repetirla no cambia nada (ni la fecha). */
export async function aceptarNormas(admin: SupabaseClient, authUserId: string): Promise<void> {
  const { error } = await admin.from('normas_comunidad_aceptaciones')
    .upsert({ auth_user_id: authUserId, version: VERSION_NORMAS }, { onConflict: 'auth_user_id,version', ignoreDuplicates: true });
  if (error) throw new Error(`normas_comunidad_aceptaciones: ${error.message}`);
}

export type MotivoNoPublicar =
  | { status: 409; error: string; codigo: typeof CODIGO_NORMAS_PENDIENTES; version: string }
  | { status: 422; error: string; codigo: 'FILTRO' };

/**
 * Lo que comprueba toda ruta de la app que publica texto (chat de la alumna y de
 * la instructora, comentarios del tablón) ANTES de guardar: normas aceptadas y
 * filtro de palabras. `null` = se puede publicar.
 */
export async function antesDePublicar(admin: SupabaseClient, authUserId: string, texto: string): Promise<MotivoNoPublicar | null> {
  if (!(await normasAceptadas(admin, authUserId))) {
    return { status: 409, error: TEXTO_NORMAS_PENDIENTES, codigo: CODIGO_NORMAS_PENDIENTES, version: VERSION_NORMAS };
  }
  if (palabrasNoPermitidas(texto).length > 0) return { status: 422, error: TEXTO_FILTRO, codigo: 'FILTRO' };
  return null;
}

/** El cuerpo JSON de la respuesta, sin el status. */
export function cuerpoNoPublicar(m: MotivoNoPublicar): Record<string, unknown> {
  return m.status === 409 ? { error: m.error, codigo: m.codigo, version: m.version } : { error: m.error, codigo: m.codigo };
}
