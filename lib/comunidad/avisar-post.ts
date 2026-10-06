import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverDestinatariasCampana, segmentoNecesitaEstado } from '@/lib/marketing/segmentos';
import { cargarEstadosClientas } from '@/lib/clientas/estado-servidor';
import { emitirPostComunidadNuevo } from '@/lib/notifications/emit';
import type { DestinatariosCampana, Socio, Suscripcion, Recibo } from '@/lib/types';

/**
 * El aviso a las alumnas de una publicación nueva de la Comunidad (un post o un
 * evento). Una sola implementación para quien publica desde la pantalla
 * (`app/api/comunidad/posts`) y para el asistente: se llama DESPUÉS de guardar,
 * dentro de `after()`, y nunca revierte ni bloquea la publicación. Sin reintento:
 * si falla, el post ya está guardado y solo se pierde el aviso.
 */
export async function avisarPostComunidad(p: {
  studioId: string; postId: string; autorNombre: string; texto: string; audiencia: DestinatariosCampana;
}): Promise<void> {
  try {
    const adminAfter = getSupabaseAdmin();
    if (!adminAfter) return;
    const { studioId, postId, audiencia } = p;
    const [{ data: sociosRaw }, { data: susRaw }, { data: recRaw }, { data: studioRaw }] = await Promise.all([
      adminAfter.from('socios').select('id, activo, tags, fecha_nacimiento').eq('studio_id', studioId),
      adminAfter.from('suscripciones').select('socio_id, estado, sesiones_restantes, fecha_fin').eq('studio_id', studioId).eq('estado', 'ACTIVA'),
      adminAfter.from('recibos').select('socio_id, estado').eq('studio_id', studioId).eq('estado', 'FALLIDO'),
      adminAfter.from('studios').select('slug').eq('id', studioId).maybeSingle(),
    ]);
    const socios = (sociosRaw ?? []).map(r => ({
      id: r.id, activo: r.activo, tags: r.tags ?? undefined, fechaNacimiento: r.fecha_nacimiento ?? undefined,
    })) as unknown as Socio[];
    const suscripciones = (susRaw ?? []).map(r => ({
      socioId: r.socio_id, estado: r.estado, sesionesRestantes: r.sesiones_restantes, fechaFin: r.fecha_fin,
    })) as unknown as Suscripcion[];
    const recibos = (recRaw ?? []).map(r => ({ socioId: r.socio_id, estado: r.estado })) as unknown as Recibo[];

    const ahora = new Date();
    // El estado de cada una (Activa, Sin renovar…), solo si la audiencia lo usa.
    // Si no se puede leer, no se avisa a nadie antes que a quien no toca.
    const estados = segmentoNecesitaEstado(audiencia)
      ? await cargarEstadosClientas(adminAfter, studioId, { ahora })
      : null;
    if (segmentoNecesitaEstado(audiencia) && !estados) return;
    const destinatarias = resolverDestinatariasCampana(audiencia, { socios, suscripciones, recibos, estados }, ahora);
    if (destinatarias.length === 0) return;
    await emitirPostComunidadNuevo(adminAfter, {
      studioId, postId, autorNombre: p.autorNombre,
      previsualizacion: p.texto ? p.texto.slice(0, 80) : null,
      socioIds: destinatarias.map(s => s.id),
      slug: (studioRaw as { slug: string | null } | null)?.slug ?? null,
    });
  } catch (e) {
    console.error('[comunidad/posts:POST] fan-out tras respuesta falló', e instanceof Error ? e.message : e);
  }
}
