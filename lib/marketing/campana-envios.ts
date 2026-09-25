import type { SupabaseClient } from '@supabase/supabase-js';

// AUT-B: registro por destinataria de una campaña (`campana_envios`). Hasta hoy
// el único rastro de una campaña a 500 socias era el entero `campanas.enviados`:
// no se podía contestar «¿le llegó?», cruzar un rebote con su envío ni reanudar
// una campaña de WhatsApp caída a mitad.
//
// NUNCA lanza: anotar el rastro es importante, pero no tanto como no romper un
// envío que ya salió (reintentar un step de WhatsApp reenviaría el mensaje, que
// no tiene clave de idempotencia). Devuelve el error y quien llama lo reporta.

export type EstadoEnvioCampana = 'ENVIADO' | 'FALLIDO' | 'OMITIDO';

export interface EnvioCampana {
  campanaId: string;
  studioId: string;
  socioId: string;
  canal: 'EMAIL' | 'WHATSAPP';
  estado: EstadoEnvioCampana;
  /** Id del envío en el proveedor (Resend), para cruzar un rebote con él. */
  providerId?: string | null;
  /** Motivo. Sin nombres ni correos: es dato personal y `anonimizar_socio` lo vacía. */
  detalle?: string | null;
}

const LOTE = 500;

export async function anotarEnviosCampana(
  admin: SupabaseClient,
  envios: readonly EnvioCampana[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!envios.length) return { ok: true };
  try {
    for (let i = 0; i < envios.length; i += LOTE) {
      const filas = envios.slice(i, i + LOTE).map(e => ({
        campana_id: e.campanaId,
        studio_id: e.studioId,
        socio_id: e.socioId,
        canal: e.canal,
        estado: e.estado,
        provider_id: e.providerId ?? null,
        detalle: e.detalle ?? null,
      }));
      // UNIQUE (campana_id, socio_id): un reintento del step actualiza la fila.
      const { error } = await admin.from('campana_envios').upsert(filas, { onConflict: 'campana_id,socio_id' });
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
