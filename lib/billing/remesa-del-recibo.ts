// ─────────────────────────────────────────────────────────────────────────────
// ¿Pudo salir este recibo en una remesa?
//
// Un recibo «en el banco» (EN_CURSO) sin ningún cobro de Stripe en marcha parece
// una remesa, pero no tiene por qué serlo. También sale de un «Reintentar» del
// panel anterior al 2-oct-2026 (lo ponía EN_CURSO desde el navegador sin mandar
// nada a ningún banco) y de una remesa cuyo fichero falló y no se pudo deshacer.
// Darlo entonces por «cobrado por el banco» borraría una deuda e inventaría un
// ingreso y una factura.
//
// Solo pudo ir en una remesa si el estudio las hace (tiene sus datos de acreedor
// SEPA) y la clienta tiene, o tuvo, una domiciliación: la remesa solo mete
// recibos de clientas con mandato. No prueba que fuera, pero descarta todo lo
// que seguro que no fue. Lo usan «El banco lo ha cobrado» y «El banco lo devolvió»
// desde EN_CURSO; para lo demás está «No llegó a ir al banco».
//
// Sin `@/`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export const TEXTO_SIN_REMESAS =
  'Este estudio no prepara remesas: este recibo no salió en ninguna. Si no llegó a ir al banco, usa «No llegó a ir al banco».';
export const TEXTO_SIN_DOMICILIACION =
  'Esta clienta no tiene domiciliación: este recibo no pudo salir en una remesa. Si no llegó a ir al banco, usa «No llegó a ir al banco».';

export type LecturaRemesa =
  | { ok: true; motivoPorRecibo: Map<string, string | null> }
  | { ok: false };

/**
 * Para cada recibo, `null` si pudo salir en una remesa o el texto de por qué no.
 * Los recibos que no son del estudio no aparecen (ya los rechaza el que cobra).
 */
export async function motivosParaNoSerRemesa(
  admin: SupabaseClient, studioId: string, reciboIds: readonly string[],
): Promise<LecturaRemesa> {
  const motivoPorRecibo = new Map<string, string | null>();
  if (reciboIds.length === 0) return { ok: true, motivoPorRecibo };
  const [{ data: estudio, error: errEstudio }, { data: recibos, error: errRecibos }] = await Promise.all([
    admin.from('studios').select('sepa_acreedor_id, sepa_iban, sepa_titular').eq('id', studioId).maybeSingle(),
    admin.from('recibos').select('id, socio_id').eq('studio_id', studioId).in('id', [...reciboIds]),
  ]);
  if (errEstudio || errRecibos) return { ok: false };
  const haceRemesas = !!(estudio?.sepa_acreedor_id && estudio.sepa_iban && estudio.sepa_titular);
  const filas = (recibos ?? []) as { id: string; socio_id: string | null }[];
  if (!haceRemesas) {
    for (const r of filas) motivoPorRecibo.set(r.id, TEXTO_SIN_REMESAS);
    return { ok: true, motivoPorRecibo };
  }
  const socios = [...new Set(filas.map(r => r.socio_id).filter((s): s is string => !!s))];
  const { data: mandatos, error: errMandatos } = socios.length === 0
    ? { data: [] as { socio_id: string }[], error: null }
    : await admin.from('mandatos_sepa').select('socio_id').eq('studio_id', studioId).in('socio_id', socios);
  if (errMandatos) return { ok: false };
  const conMandato = new Set(((mandatos ?? []) as { socio_id: string }[]).map(m => m.socio_id));
  for (const r of filas) motivoPorRecibo.set(r.id, r.socio_id && conMandato.has(r.socio_id) ? null : TEXTO_SIN_DOMICILIACION);
  return { ok: true, motivoPorRecibo };
}
