import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@/lib/utils';

// "Tarea" no existía como concepto de negocio en el repo (lib/tareas.ts es
// solo el catálogo estático del command-palette ⌘K) — tabla nueva mínima
// para la Fase 5 del OAuth (supabase/migrations/20260814150000_oauth_fase5_tareas.sql).
// Sin "asignado a": eso es trabajo de equipo, no de esta tabla.
export async function crearTareaAdmin(
  admin: SupabaseClient,
  params: { studioId: string; titulo: string; descripcion?: string | null; socioId?: string | null; origen?: 'PANEL' | 'API' },
): Promise<{ ok: true; id: string } | { error: string }> {
  if (params.socioId) {
    const { data: socio } = await admin
      .from('socios').select('id').eq('id', params.socioId).eq('studio_id', params.studioId).maybeSingle();
    if (!socio) return { error: 'Clienta no encontrada' };
  }

  const id = `tarea-${uid()}`;
  const { error } = await admin.from('tareas').insert({
    id, studio_id: params.studioId, titulo: params.titulo,
    descripcion: params.descripcion ?? null, socio_id: params.socioId ?? null,
    origen: params.origen ?? 'PANEL',
  });
  // Mismo criterio que crearNotaInternaAdmin: mensaje genérico, no el error
  // crudo de Postgres, para un tercero autenticado (Zapier).
  if (error) return { error: 'No se pudo crear la tarea' };
  return { ok: true, id };
}
