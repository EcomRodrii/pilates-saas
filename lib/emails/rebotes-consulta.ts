import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarEmail, type TipoRebote } from './rebotes.ts';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Este buzón está roto?» — la ÚNICA forma de preguntárselo a `email_rebotes`.
//
// Antes esta consulta vivía suelta dentro de `hueco/avisar`, y la ficha de la
// clienta iba a necesitar la misma. Dos copias de «cómo se compara un correo
// contra la tabla» es justo donde se cuela el bug: basta que una normalice y la
// otra no para que «Maria@Gmail.com» salga limpia en una pantalla y rota en la
// otra, con los mismos datos delante.
//
// ⚠️ Server-only por construcción: recibe el cliente `service_role` ya montado.
// `email_rebotes` no tiene políticas y tiene los grants revocados a
// `anon`/`authenticated` a propósito — que una dirección cualquiera rebote es
// información de la DIRECCIÓN, no del estudio que pregunta. Quien llame desde
// una ruta HTTP tiene que acotar él las direcciones a las suyas ANTES de
// preguntar; esta función no sabe de estudios y no puede hacerlo por él.
// ─────────────────────────────────────────────────────────────────────────────

/** Las direcciones rotas de entre las preguntadas, normalizadas como la tabla. */
export async function rebotesDeEmails(
  admin: SupabaseClient,
  emails: readonly (string | null | undefined)[],
): Promise<Map<string, TipoRebote>> {
  const buscar = [...new Set(emails.filter((e): e is string => !!e && e.trim() !== '').map(normalizarEmail))];
  // Sin esto, `.in('email', [])` es una consulta de ida y vuelta para preguntar
  // por nada — y la pantalla que la dispara puede no tener ni una socia.
  if (!buscar.length) return new Map();

  const { data } = await admin.from('email_rebotes').select('email, tipo').in('email', buscar);
  return new Map(
    (data ?? []).map((r) => [normalizarEmail(r.email as string), r.tipo as TipoRebote]),
  );
}
