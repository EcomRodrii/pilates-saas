// Lectura y escritura de los textos de aviso del estudio desde el panel. Va con
// la sesión de la propietaria: la RLS (`template_write`, solo PROPIETARIO de su
// estudio) es la cerradura; esto solo valida antes para dar un error legible.
import { supabase } from '@/lib/db/supabase';
import { authHeader } from '@/lib/api-client';
import { validarTexto, type TextoAviso } from './textos-estudio.ts';

export type ResultadoPrueba = { ok: true; dispositivos: number } | { ok: false; error: string };

/** Manda el texto que se está escribiendo, como push de prueba, a los dispositivos de quien lo pide. */
export async function enviarPruebaPush(evento: string, t: TextoAviso): Promise<ResultadoPrueba> {
  const invalido = validarTexto(evento, t);
  if (invalido) return { ok: false, error: invalido };
  try {
    const res = await fetch('/api/notifications/prueba-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ evento, title: t.title, body: t.body }),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as { dispositivos?: number; error?: string };
    if (!res.ok) return { ok: false, error: cuerpo.error ?? 'No se ha podido enviar la prueba. Inténtalo de nuevo.' };
    return { ok: true, dispositivos: cuerpo.dispositivos ?? 1 };
  } catch {
    return { ok: false, error: 'No se ha podido enviar la prueba. Revisa tu conexión.' };
  }
}

// Un id fijo por (estudio, tipo): el índice único de la tabla es PARCIAL
// (`uq_template_studio ... WHERE studio_id IS NOT NULL`) y PostgREST no sabe
// hacer upsert contra uno así; contra la PK, sí.
const idDe = (studioId: string, evento: string) => `tpl-${studioId}-${evento}-es`;

export async function dbListTextosAviso(studioId: string): Promise<Record<string, TextoAviso>> {
  const { data, error } = await supabase.from('notification_template')
    .select('event_type, title_tpl, body_tpl')
    .eq('studio_id', studioId).eq('locale', 'es');
  if (error) throw error;
  return Object.fromEntries((data ?? []).map(r => [r.event_type as string, { title: r.title_tpl as string, body: r.body_tpl as string }]));
}

export type ResultadoTexto = { ok: true } | { ok: false; error: string };

export async function dbGuardarTextoAviso(studioId: string, evento: string, t: TextoAviso): Promise<ResultadoTexto> {
  const invalido = validarTexto(evento, t);
  if (invalido) return { ok: false, error: invalido };
  const { data, error } = await supabase.from('notification_template').upsert({
    id: idDe(studioId, evento), studio_id: studioId, event_type: evento, locale: 'es',
    title_tpl: t.title.trim(), body_tpl: t.body.trim(), updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('id');
  // Sin filas y sin error = la RLS no casó (no es la propietaria de este estudio).
  if (error || !data?.length) return { ok: false, error: 'No se ha podido guardar el texto. Inténtalo de nuevo.' };
  return { ok: true };
}

export async function dbRestaurarTextoAviso(studioId: string, evento: string): Promise<ResultadoTexto> {
  const { error } = await supabase.from('notification_template').delete().eq('id', idDe(studioId, evento));
  if (error) return { ok: false, error: 'No se ha podido volver al texto original. Inténtalo de nuevo.' };
  return { ok: true };
}
