import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Migración Mágica · lotes reversibles (0075). Los importadores registran aquí
// los IDs que crean cuando la petición trae un batchId; deshacer borra
// exactamente esos IDs, en orden inverso de dependencias, y nada más.

export type EntidadBatch = 'socios' | 'suscripciones' | 'tipos_clase' | 'sesiones' | 'reservas' | 'citas' | 'plazas_fijas';

// El cliente genera el batchId; se valida el formato para no aceptar basura.
export const RE_BATCH_ID = /^mig-[A-Za-z0-9-]{6,48}$/;

// Orden de BORRADO: primero lo que referencia, después lo referenciado.
export const ORDEN_DESHACER: EntidadBatch[] = ['citas', 'reservas', 'plazas_fijas', 'suscripciones', 'sesiones', 'tipos_clase', 'socios'];

const TABLA: Record<EntidadBatch, string> = {
  socios: 'socios', suscripciones: 'suscripciones', tipos_clase: 'tipos_clase',
  sesiones: 'sesiones', reservas: 'reservas', citas: 'citas', plazas_fijas: 'plazas_fijas',
};

/**
 * Añade IDs creados al batch (lo crea si no existe). La ejecución de una
 * migración es secuencial desde un solo cliente, así que el read-merge-write
 * no compite consigo mismo. Devuelve false si no pudo registrar — el llamante
 * DEBE avisar (esas filas quedarían fuera del deshacer), nunca tragárselo.
 */
export async function registrarIdsBatch(
  admin: SupabaseClient,
  params: { studioId: string; batchId: string; entidad: EntidadBatch; ids: string[] },
): Promise<boolean> {
  const { studioId, batchId, entidad, ids } = params;
  if (ids.length === 0) return true;
  if (!RE_BATCH_ID.test(batchId)) return false;
  try {
    const { data: existente, error: selErr } = await admin
      .from('migracion_batches')
      .select('ids_creados')
      .eq('id', batchId)
      .eq('studio_id', studioId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    const actual = (existente?.ids_creados ?? {}) as Partial<Record<EntidadBatch, string[]>>;
    const fusionado = { ...actual, [entidad]: [...(actual[entidad] ?? []), ...ids] };

    if (existente) {
      const { error } = await admin
        .from('migracion_batches')
        .update({ ids_creados: fusionado })
        .eq('id', batchId)
        .eq('studio_id', studioId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from('migracion_batches')
        .insert({ id: batchId, studio_id: studioId, ids_creados: fusionado });
      if (error) throw new Error(error.message);
    }
    return true;
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error('Fallo registrando batch de migración'), {
      level: 'error', tags: { area: 'migracion' }, extra: { batchId, entidad, cuantos: ids.length },
    });
    return false;
  }
}

export interface ResultadoDeshacer {
  ok: boolean;
  borrados: Partial<Record<EntidadBatch, number>>;
  error?: string;
}

/**
 * Borra TODO lo creado por un batch, en orden inverso de dependencias, acotado
 * al estudio. Si una FK bloquea un borrado (p. ej. una socia migrada que ya
 * tiene reservas nuevas de después de la migración), se PARA con un mensaje
 * claro y sin marcar el batch como deshecho — mejor un deshacer a medias
 * visible que uno que miente.
 */
export async function deshacerBatch(
  admin: SupabaseClient,
  params: { studioId: string; batchId: string },
): Promise<ResultadoDeshacer> {
  const { studioId, batchId } = params;
  const borrados: Partial<Record<EntidadBatch, number>> = {};

  const { data: batch, error: selErr } = await admin
    .from('migracion_batches')
    .select('ids_creados, deshecho_en')
    .eq('id', batchId)
    .eq('studio_id', studioId)
    .maybeSingle();
  if (selErr) return { ok: false, borrados, error: 'No se ha podido leer el lote de migración' };
  if (!batch) return { ok: false, borrados, error: 'Lote de migración no encontrado' };
  if (batch.deshecho_en) return { ok: false, borrados, error: 'Este lote ya se deshizo' };

  const ids = (batch.ids_creados ?? {}) as Partial<Record<EntidadBatch, string[]>>;

  for (const entidad of ORDEN_DESHACER) {
    const lista = ids[entidad] ?? [];
    if (lista.length === 0) continue;
    let total = 0;
    for (let i = 0; i < lista.length; i += 500) {
      const trozo = lista.slice(i, i + 500);
      const { data, error } = await admin
        .from(TABLA[entidad])
        .delete()
        .in('id', trozo)
        .eq('studio_id', studioId)
        .select('id');
      if (error) {
        const esFk = error.code === '23503';
        borrados[entidad] = total;
        return {
          ok: false,
          borrados,
          error: esFk
            ? `No se puede deshacer del todo: hay datos nuevos (posteriores a la migración) que dependen de ${entidad.replace('_', ' ')} importados. Borra primero esos datos o contacta con soporte.`
            : `Fallo al borrar ${entidad.replace('_', ' ')}: inténtalo de nuevo.`,
        };
      }
      total += (data ?? []).length;
    }
    borrados[entidad] = total;
  }

  const { error: updErr } = await admin
    .from('migracion_batches')
    .update({ deshecho_en: new Date().toISOString() })
    .eq('id', batchId)
    .eq('studio_id', studioId);
  if (updErr) {
    Sentry.captureMessage('Batch deshecho pero no se pudo marcar deshecho_en', {
      level: 'warning', tags: { area: 'migracion' }, extra: { batchId },
    });
  }

  return { ok: true, borrados };
}
