import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { configLegalDe, textoLegalCompleto } from '@/lib/legal-textos';
import { hashTextoLegal } from '@/lib/legal-hash';

// Sella qué condiciones estaban vigentes cuando una clienta compra.
//
// ── Por qué en servidor y no en el cliente ───────────────────────────────────
// El hash lo calcula QUIEN CREA EL PAGO, a partir de los textos del estudio en
// ese instante. Si lo mandara el navegador, la prueba de qué se aceptó vendría
// de la parte que tiene interés en discutirla — y bastaría con editar una
// petición para «aceptar» otras condiciones distintas de las que se enseñaron.
//
// ── Best-effort, a propósito ─────────────────────────────────────────────────
// Si esto falla, la compra SIGUE. Un fallo registrando la versión de unas
// condiciones no puede impedir que alguien pague lo que ha decidido pagar; se
// queda sin sello (`NULL`, que la columna admite y significa exactamente eso)
// en vez de tumbar el cobro. Mismo criterio que `emitirPagoRealizado`.

export interface SelloLegal {
  hash: string;
  aceptadoEn: string;
}

/**
 * Compone el texto legal vigente del estudio, lo guarda UNA vez por versión, y
 * devuelve su huella. `null` si no se pudo (y entonces la compra va sin sello).
 */
export async function sellarCondicionesVigentes(
  admin: SupabaseClient,
  studioId: string,
): Promise<SelloLegal | null> {
  try {
    const { data: s } = await admin
      .from('studios')
      .select('nombre, razon_social, nif, direccion, ciudad, codigo_postal, email, politica_privacidad, terminos_servicio')
      .eq('id', studioId)
      .maybeSingle();
    if (!s) return null;

    const e = s as Record<string, string | null>;
    // La MISMA composición que firma la clienta en el portal: sus textos si los
    // ha reescrito, y si no los de por defecto redactados con sus datos
    // fiscales. `configLegalDe` vive en `lib/legal-textos.ts` justamente para
    // que servidor y cliente no tengan dos reglas distintas.
    const config = configLegalDe(e, {
      politicaPrivacidad: e.politica_privacidad,
      terminosServicio: e.terminos_servicio,
    });
    const texto = textoLegalCompleto(config);
    const hash = hashTextoLegal(texto);

    // Una fila por texto y estudio. `ignoreDuplicates` porque la carrera normal
    // aquí son dos compras simultáneas con el mismo texto: las dos quieren
    // escribir la misma versión y da igual cuál gane.
    await admin.from('terminos_versiones').upsert(
      { id: `tv-${studioId}-${hash.slice(0, 16)}`, studio_id: studioId, hash, texto },
      { onConflict: 'studio_id,hash', ignoreDuplicates: true },
    );

    return { hash, aceptadoEn: new Date().toISOString() };
  } catch {
    // Ver la nota de arriba: sin sello, pero la compra sigue.
    return null;
  }
}
