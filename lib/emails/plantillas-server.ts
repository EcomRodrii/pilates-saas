import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ─────────────────────────────────────────────────────────────────────────────
// Resuelve el override de plantilla de email de un estudio (asunto + intro).
// Solo servidor (usa service-role). Si no hay override, o está desactivado, o el
// tipo no es editable, devuelve {} y el emisor cae a los textos por defecto.
// ─────────────────────────────────────────────────────────────────────────────

export type PlantillaOverride = { asunto?: string; intro?: string };

// Los 5 transaccionales relacionales que el estudio puede personalizar. `recibo`
// (contenido fiscal) y `automatizacion` (100% dinámico) quedan fuera a propósito.
export const TIPOS_PLANTILLA_EDITABLES = ['bienvenida', 'reserva', 'recordatorio', 'cancelacion', 'promocion'] as const;
export type TipoPlantillaEditable = (typeof TIPOS_PLANTILLA_EDITABLES)[number];

export function esTipoEditable(tipo: string): tipo is TipoPlantillaEditable {
  return (TIPOS_PLANTILLA_EDITABLES as readonly string[]).includes(tipo);
}

export async function resolverPlantilla(studioId: string | null | undefined, tipo: string): Promise<PlantillaOverride> {
  if (!studioId || !esTipoEditable(tipo)) return {};
  const admin = getSupabaseAdmin();
  if (!admin) return {};
  const { data } = await admin
    .from('plantillas_email')
    .select('asunto, intro, activa')
    .eq('studio_id', studioId)
    .eq('tipo', tipo)
    .maybeSingle();
  if (!data || data.activa === false) return {};
  return {
    asunto: (data.asunto as string | null)?.trim() || undefined,
    intro: (data.intro as string | null)?.trim() || undefined,
  };
}

// Sustituye las variables permitidas en el texto editable por el estudio.
export function interpolar(texto: string, vars: { nombre?: string; estudio?: string; clase?: string }): string {
  return texto
    .replace(/\{nombre\}/gi, vars.nombre ?? '')
    .replace(/\{estudio\}/gi, vars.estudio ?? '')
    .replace(/\{clase\}/gi, vars.clase ?? '');
}
