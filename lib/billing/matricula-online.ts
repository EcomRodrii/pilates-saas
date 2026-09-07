import type { SupabaseClient } from '@supabase/supabase-js';
import { escaparLike } from '../escapar-like.ts';

// P-1 (auditoría 26ª pasada). La matrícula se cobra la PRIMERA vez que una
// socia contrata un plan en un estudio — mismo criterio ya resuelto en el
// alta/asignación de plan por mostrador (`dbSocioTieneAlgunPlan`,
// lib/supabase-data.ts): nunca en un segundo plan, nunca en renovaciones.
// Esta versión es la misma regla parametrizada por cliente, para poder
// llamarse con el admin (service-role) desde las rutas de checkout online.
//
// Sin `socioId` conocido (invitada comprando por el enlace público, sin
// login) se resuelve por email — mismo patrón que `esSociaNueva`
// (lib/billing/socia-nueva.ts): una invitada cuyo email ya tiene ficha con
// planes anteriores no es "primera vez", aunque el checkout no supiera su
// socioId al crear la sesión de pago.
//
// Fail-safe ante cualquier fallo de lectura: no se cobra ante la duda —
// mismo criterio que el mostrador ("null cuenta como que ya tenía").
export async function primeraVezConPlan(
  admin: SupabaseClient,
  studioId: string,
  socioId: string | null | undefined,
  socioEmail: string | null | undefined,
): Promise<boolean> {
  let id = socioId ?? null;

  if (!id) {
    const email = socioEmail?.trim();
    if (!email) return true; // sin email ni socioId: no hay ficha que pueda tener planes previos.
    if (email.includes('*')) return false; // mismo guard que esSociaNueva: fail-closed ante un comodín de ilike.
    const { data, error } = await admin
      .from('socios').select('id')
      .eq('studio_id', studioId).ilike('email', escaparLike(email))
      .limit(1).maybeSingle();
    if (error) return false;
    if (!data) return true; // no existe ficha con ese email: es su primera vez.
    id = data.id as string;
  }

  const { count, error } = await admin
    .from('suscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId).eq('socio_id', id);
  if (error) return false;
  return (count ?? 0) === 0;
}
