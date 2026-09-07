import type { SupabaseClient } from '@supabase/supabase-js';

// P-5 (auditoría 26ª pasada): qué códigos de descuento ya ha canjeado esta
// socia. `codigos_descuento_consumos` no tenía `socio_id` — la única barrera
// era el tope GLOBAL (`usos_max`, opcional), así que un código sin tope era
// reutilizable indefinidamente por la misma persona. Cada código es ahora
// como mucho una vez por socia, tenga o no tope global.
//
// Fail-open ante un fallo de lectura: negar una compra entera por un problema
// transitorio de esta consulta secundaria sería peor que el riesgo residual
// que cierra — y el UNIQUE (codigo_id, socio_id) de `codigos_descuento_consumos`
// (ver lib/billing/confirmar-cobro.ts) sigue defendiendo en el momento de
// consumir, aunque esta comprobación previa no se haya podido hacer.
export async function codigosYaUsadosPorSocia(
  admin: SupabaseClient,
  socioId: string | null | undefined,
): Promise<ReadonlySet<string>> {
  if (!socioId) return new Set();
  const { data, error } = await admin
    .from('codigos_descuento_consumos')
    .select('codigo_id')
    .eq('socio_id', socioId);
  if (error) return new Set();
  return new Set((data ?? []).map(r => r.codigo_id as string));
}
