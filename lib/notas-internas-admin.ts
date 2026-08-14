import type { SupabaseClient } from '@supabase/supabase-js';
import { uid } from '@/lib/utils';

// Wrapper service-role de notas_internas (nota operativa, NO ficha clínica —
// salud_notas_progreso es otra tabla, excluida a propósito del scope OAuth
// `notas:*`, ver docs/oauth-arquitectura.md). Mismo patrón que
// registrarSociaPublica: valida que el socio pertenece al estudio antes de
// escribir, porque aquí no hay RLS que lo haga por nosotros (service-role).
export async function crearNotaInternaAdmin(
  admin: SupabaseClient,
  params: { studioId: string; socioId: string; texto: string },
): Promise<{ ok: true; id: string } | { error: string }> {
  const { data: socio } = await admin
    .from('socios').select('id').eq('id', params.socioId).eq('studio_id', params.studioId).maybeSingle();
  if (!socio) return { error: 'Clienta no encontrada' };

  const id = `nota-${uid()}`;
  const { error } = await admin.from('notas_internas').insert({
    id, studio_id: params.studioId, socio_id: params.socioId, texto: params.texto, tipo: 'NOTA',
  });
  // Mensaje genérico ante un fallo no previsto: a diferencia del email
  // duplicado de clientas (23505 con patrón conocido), aquí el error crudo de
  // Postgres podría filtrar nombre de tabla/columna a un tercero autenticado
  // (Zapier), no a la propia propietaria.
  if (error) return { error: 'No se pudo crear la nota' };
  return { ok: true, id };
}
