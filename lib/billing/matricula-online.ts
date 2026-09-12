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

/**
 * Cuánto hay que COBRAR de matrícula por este plan: 0 si la promoción la
 * cubre, su importe si no.
 *
 * ⚠️ No decide nada aquí: lo decide `reservar_matricula` en la base, bajo un
 * `for update` de la fila del plan. Y no es un capricho — hay CUATRO sitios que
 * cobran matrícula (los dos checkouts online y las dos vías de mostrador), así
 * que repartir el cupo entre ellos sería repartir la misma carrera cuatro
 * veces: dos socias comprando a la vez con un cupo libre se lo llevarían las
 * dos. Mismo patrón que `canjear_recompensa`.
 *
 * ⚠️ Llamar SOLO cuando ya se sabe que es la primera vez de esa socia
 * (`primeraVezConPlan`). Si no, una veterana —que no paga matrícula igualmente—
 * gastaría una plaza al contratar su segundo plan.
 *
 * Ante un fallo de la RPC se devuelve la matrícula completa: cobrar de más es
 * un problema que la propietaria puede devolver; regalar plazas que no existen,
 * no.
 */
export async function reservarMatricula(
  admin: SupabaseClient,
  planId: string,
  studioId: string,
  matriculaCatalogo: number,
): Promise<number> {
  const { data, error } = await admin.rpc('reservar_matricula', {
    p_plan_id: planId, p_studio_id: studioId,
  });
  if (error) return matriculaCatalogo;
  return Number(data ?? matriculaCatalogo);
}

/**
 * Devuelve la plaza si el cobro no llegó a crearse. Best-effort.
 *
 * ⚠️ **Solo service_role.** `authenticated` no tiene EXECUTE sobre
 * `liberar_cupo_matricula` (migr 20260912002351): devolver una plaza es una
 * compensación de servidor, y la función REGALA matrículas. Desde el navegador
 * daría «permission denied for function», así que si alguna pantalla llega a
 * necesitarlo, hace falta una ruta que lo haga con el admin — no volver a abrir
 * el grant. Lo sujeta `liberar-cupo-solo-servidor.test.ts`.
 */
export async function liberarCupoMatricula(
  admin: SupabaseClient,
  planId: string,
  studioId: string,
): Promise<void> {
  await admin.rpc('liberar_cupo_matricula', { p_plan_id: planId, p_studio_id: studioId })
    .then(() => undefined, () => undefined);
}
