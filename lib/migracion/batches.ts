import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Migración Mágica · lotes reversibles (0080). Los importadores registran aquí
// los IDs que crean cuando la petición trae un batchId; deshacer borra
// exactamente esos IDs, en orden inverso de dependencias, y nada más.

export type EntidadBatch = 'socios' | 'suscripciones' | 'tipos_clase' | 'sesiones' | 'reservas' | 'citas' | 'plazas_fijas' | 'pagos_historicos' | 'recuperaciones';

// El cliente genera el batchId; se valida el formato para no aceptar basura.
export const RE_BATCH_ID = /^mig-[A-Za-z0-9-]{6,48}$/;

// Orden de BORRADO: primero lo que referencia, después lo referenciado.
// pagos_historicos no referencia nada más que socios, así que va indiferente
// respecto a citas/reservas/plazas_fijas — se pone junto a ellas por claridad.
export const ORDEN_DESHACER: EntidadBatch[] = ['citas', 'reservas', 'plazas_fijas', 'pagos_historicos', 'recuperaciones', 'suscripciones', 'sesiones', 'tipos_clase', 'socios'];

const TABLA: Record<EntidadBatch, string> = {
  socios: 'socios', suscripciones: 'suscripciones', tipos_clase: 'tipos_clase',
  sesiones: 'sesiones', reservas: 'reservas', citas: 'citas', plazas_fijas: 'plazas_fijas',
  recuperaciones: 'recuperaciones',
  pagos_historicos: 'pagos_historicos',
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
 * Tablas que NO deben impedir deshacer una migración.
 *
 * Son rastro que genera el propio producto —no algo que hiciera la socia— y que
 * se puede borrar con ella sin pérdida real. Sin esta lista el preflight sería
 * peor que el bug que arregla: `recordatorio_envios` cuelga de `sesiones` y de
 * `socios` con CASCADE y el cron escribe ahí por cada recordatorio enviado, así
 * que a las pocas horas de migrar TODO lote quedaría bloqueado para siempre.
 *
 * La lista es corta a propósito. Todo lo demás (recibos, créditos, reservas,
 * ficha clínica, documentos, mensajes, valoraciones) SÍ bloquea: es información
 * que alguien introdujo, y perderla en silencio es lo que se está arreglando.
 */
const RASTRO_DEL_SISTEMA = [
  'recordatorio_envios',        // cron de recordatorios
  'comunicaciones_socio',       // log de emails/WhatsApp enviados
  'intentos_reserva_fallidos',  // telemetría de reservas que no cuajaron
  'recomendaciones',            // Decision OS, se regenera solo
  'memoria_socio',              // Decision OS, se regenera solo
];

// Cómo se llama cada entidad en el mensaje que lee la propietaria.
const ETIQUETA: Record<EntidadBatch, string> = {
  socios: 'clientas', suscripciones: 'membresías', tipos_clase: 'tipos de clase',
  sesiones: 'clases', reservas: 'reservas', citas: 'citas', plazas_fijas: 'plazas fijas',
  recuperaciones: 'recuperaciones', pagos_historicos: 'pagos históricos',
};

/**
 * Preflight del borrado: cuenta lo que la CASCADA destruiría sin avisar.
 *
 * El 23503 solo protege de las FK que son NO ACTION (7 de las que cuelgan de
 * `socios`). Las otras 39 son ON DELETE CASCADE: Postgres las borra en silencio
 * y `delete` devuelve éxito. Medido en prod sobre una socia real: 17 tablas,
 * 128 filas, 12 de ellas recibos. Sin esta comprobación, deshacer una migración
 * de hace tres días se llevaba por delante todo lo que esas socias hicieron
 * DESPUÉS de migrar, y la pantalla seguía prometiendo «y nada más».
 *
 * Se ejecuta justo antes de borrar cada entidad; como ORDEN_DESHACER ya ha
 * borrado lo que el propio lote creó, lo que quede colgando es ajeno al lote.
 *
 * Falla CERRADO: si no se puede comprobar, no se borra. Un deshacer que no se
 * hace es un incordio; uno que borra la ficha clínica de una socia, no.
 */
async function dependenciasExternas(
  admin: SupabaseClient,
  entidad: EntidadBatch,
  ids: string[],
  todosLosIds: Partial<Record<EntidadBatch, string[]>>,
): Promise<{ bloquea: false } | { bloquea: true; motivo: string }> {
  // Lo que el propio lote creó nunca es "ajeno". El orden de ORDEN_DESHACER ya
  // lo cubre casi siempre, pero no si `registrarIdsBatch` falló para una
  // entidad y no para otra (justo el caso que `batchAviso` avisa): entonces las
  // reservas del lote se verían como ajenas y bloquearían para siempre.
  const excluir: Record<string, string[]> = {};
  for (const [ent, lista] of Object.entries(todosLosIds) as [EntidadBatch, string[]][]) {
    if (lista?.length) excluir[TABLA[ent]] = lista;
  }

  const { data, error } = await admin.rpc('migracion_dependencias_bloqueantes', {
    p_tabla: TABLA[entidad],
    p_ids: ids,
    p_ignorar: RASTRO_DEL_SISTEMA,
    p_excluir: excluir,
  });
  if (error) {
    // El aviso NUNCA puede decidir el flujo: si el SDK no está inicializado
    // (fuera del runtime de Next, p. ej. en `node --test`), reventar aquí
    // convertiría un "no borro por precaución" en un 500 sin explicación. Mismo
    // criterio que `sentry-cola.ts` con los métodos que el SDK no tenga.
    try {
      Sentry.captureException(new Error(`Preflight del deshacer falló: ${error.message}`), {
        level: 'error', tags: { area: 'migracion' }, extra: { entidad, cuantos: ids.length },
      });
    } catch { /* observabilidad opcional; la decisión de no borrar no lo es */ }
    return {
      bloquea: true,
      motivo: `No se ha podido comprobar si hay datos posteriores que dependan de ${ETIQUETA[entidad]}. `
        + 'No se ha borrado nada para no arriesgarnos a perder información. Inténtalo de nuevo o contacta con soporte.',
    };
  }
  const filas = (data ?? []) as { tabla_hija: string; filas: number }[];
  if (filas.length === 0) return { bloquea: false };

  const total = filas.reduce((n, f) => n + Number(f.filas), 0);
  // Nombres únicos: una tabla con varias FK a la misma padre (socio_companeras
  // tiene tres) saldría repetida en el mensaje.
  const nombres = [...new Set(filas.map(f => f.tabla_hija.replace(/_/g, ' ')))];
  return {
    bloquea: true,
    motivo: `No se puede deshacer: ${ETIQUETA[entidad]} de esta importación tienen ${total} `
      + `${total === 1 ? 'registro creado' : 'registros creados'} después de migrar `
      + `(${nombres.slice(0, 4).join(', ')}${nombres.length > 4 ? '…' : ''}), `
      + 'y borrarlas se los llevaría por delante. '
      + 'No se ha borrado nada. Contacta con soporte si aun así quieres deshacer la migración.',
  };
}

/**
 * Borra TODO lo creado por un batch, en orden inverso de dependencias, acotado
 * al estudio. Si una FK bloquea un borrado, o si la CASCADA se llevaría datos
 * ajenos al lote (ver `dependenciasExternas`), se PARA con un mensaje claro y
 * sin marcar el batch como deshecho — mejor un deshacer a medias visible que
 * uno que miente.
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

    // Antes de borrar: ¿la cascada se llevaría algo que no creó este lote?
    const dep = await dependenciasExternas(admin, entidad, lista, ids);
    if (dep.bloquea) return { ok: false, borrados, error: dep.motivo };

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

export interface BatchReciente {
  id: string;
  creadoEn: string;
  // Recuento de lo que creó cada lote, derivado de ids_creados (no hace falta
  // guardar un resumen aparte: la fuente de la verdad son los propios ids).
  conteos: Partial<Record<EntidadBatch, number>>;
  total: number;
}

/**
 * Lista los lotes de migración que TODAVÍA se pueden deshacer (no deshechos) de
 * un estudio, con el recuento de lo que creó cada uno. Es lo que hace que el
 * botón de deshacer sobreviva a una recarga: el id del lote deja de vivir solo
 * en la memoria del navegador y se puede recuperar del servidor.
 */
export async function listarBatchesRecientes(
  admin: SupabaseClient,
  params: { studioId: string; limite?: number },
): Promise<BatchReciente[]> {
  const { studioId, limite = 10 } = params;
  const { data, error } = await admin
    .from('migracion_batches')
    .select('id, creado_en, ids_creados')
    .eq('studio_id', studioId)
    .is('deshecho_en', null)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map(fila => {
      const ids = (fila.ids_creados ?? {}) as Partial<Record<EntidadBatch, string[]>>;
      const conteos: Partial<Record<EntidadBatch, number>> = {};
      let total = 0;
      for (const entidad of Object.keys(ids) as EntidadBatch[]) {
        const n = (ids[entidad] ?? []).length;
        if (n > 0) { conteos[entidad] = n; total += n; }
      }
      return { id: fila.id as string, creadoEn: fila.creado_en as string, conteos, total };
    })
    // Un lote sin ids (creado pero sin registrar nada) no tiene nada que deshacer.
    .filter(b => b.total > 0);
}
