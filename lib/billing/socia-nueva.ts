import type { SupabaseClient } from '@supabase/supabase-js';

// ¿La compra la hace una clienta NUEVA? Es lo que gobierna `soloNuevas` de los
// códigos de descuento (lib/billing/descuento-checkout.ts).
//
// Por qué existe (auditoría 22-ago): los dos endpoints de compra de plan
// resolvían `esNueva: !socioId`. Como el JWT es OPCIONAL en el checkout
// embebido, cualquier clienta ya dada de alta podía no mandar `socioId`, poner
// su propio email y quedarse el código de bienvenida — una y otra vez. Y el
// email SÍ localiza su ficha: `entregarPlanComprado` la encuentra después por
// `ilike(email)` y le apunta la compra a su ficha de siempre.
//
// Fuente única a propósito: los dos endpoints son gemelos y el fallo recurrente
// de este repo es arreglar uno y no el otro.
export async function esSociaNueva(
  admin: SupabaseClient,
  studioId: string,
  socioId: string | null,
  socioEmail: string | null | undefined,
): Promise<boolean> {
  if (socioId) return false;
  const email = socioEmail?.trim();
  if (!email) return true;
  // `%` y `_` son COMODINES en `ilike` de PostgREST: escaparlos evita que un
  // email tipo `a%@x.com` case con fichas ajenas. Mismo criterio que la guarda
  // de EMAIL_RE del checkout embebido.
  // `*` PostgREST lo traduce a `%` ANTES de llegar a Postgres, así que no hay
  // barra invertida que lo escape: un email con `*` casaría con cualquier ficha
  // del estudio. Como tampoco es un email válido, se corta aquí.
  if (email.includes('*')) return false;
  const patron = email.replace(/([%_\\])/g, '\\$1');
  const { data, error } = await admin
    .from('socios')
    .select('id')
    .eq('studio_id', studioId)
    .ilike('email', patron)
    .limit(1)
    .maybeSingle();
  // Fail-CLOSED: si la consulta falla no sabemos si tiene ficha, y la respuesta
  // cómoda («es nueva») regala el código de bienvenida justo en el caso que
  // esta función existe para cerrar. Encontrado revisando este mismo fix.
  if (error) return false;
  return !data;
}
