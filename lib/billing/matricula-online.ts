import * as Sentry from '@sentry/nextjs';
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
 * Devuelve la plaza si el cobro no llegó a crearse.
 *
 * ⚠️ **Solo service_role.** `authenticated` no tiene EXECUTE sobre
 * `liberar_cupo_matricula` (migr 20260912002351): devolver una plaza es una
 * compensación de servidor, y la función REGALA matrículas. Desde el navegador
 * daría «permission denied for function», así que si alguna pantalla llega a
 * necesitarlo, hace falta una ruta que lo haga con el admin — no volver a abrir
 * el grant. Lo sujeta `liberar-cupo-solo-servidor.test.ts`.
 *
 * ⚠️ No lanza, pero tampoco calla. Se llama desde caminos que YA están
 * contestando un error a la clienta: lanzar cambiaría esa respuesta. Antes se
 * tragaba todo —incluido el `{ error }` que supabase-js devuelve sin rechazar
 * la promesa—, y una plaza que no volvía no dejaba rastro. Ahora reintenta y,
 * si no lo consigue, avisa con lo necesario para devolverla a mano.
 */
export async function liberarCupoMatricula(
  admin: SupabaseClient,
  planId: string,
  studioId: string,
  opciones: { intentos?: number; esperaMs?: number; avisar?: (e: unknown) => void } = {},
): Promise<boolean> {
  const intentos = opciones.intentos ?? 3;
  let ultimo: unknown = null;
  for (let i = 0; i < intentos; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, (opciones.esperaMs ?? 200) * i));
    try {
      const { error } = await admin.rpc('liberar_cupo_matricula', { p_plan_id: planId, p_studio_id: studioId });
      if (!error) return true;
      ultimo = error;
    } catch (e) {
      ultimo = e;
    }
  }
  (opciones.avisar ?? avisarPlazaNoDevuelta)({ ultimo, planId, studioId });
  return false;
}

function avisarPlazaNoDevuelta(d: unknown): void {
  const { ultimo, planId, studioId } = d as { ultimo: unknown; planId: string; studioId: string };
  const detalle = ultimo instanceof Error ? ultimo.message : (ultimo as { message?: string } | null)?.message ?? String(ultimo);
  console.error('[matricula-online] no se pudo devolver la plaza de matrícula gratis', planId, detalle);
  Sentry.captureMessage('[matricula] una plaza de matrícula gratis no se pudo devolver', {
    level: 'error', tags: { area: 'cobros', tipo: 'cupo-matricula' },
    extra: {
      planId, studioId, detalle,
      // Ninguna pantalla enseña ni edita el contador: la corrección es de Tentare.
      queHacer: 'El cobro no llegó a crearse y la plaza sigue gastada. Restar 1 a planes_tarifa.matricula_gratis_usados de ese plan (id + studio_id); la pantalla de planes no lo edita.',
    },
  });
}

/**
 * P-1 (auditoría 58ª pasada). El `catch` síncrono del checkout ya devolvía la
 * plaza si el cobro ni siquiera llegaba a crearse — pero no si se creaba y
 * luego nadie pagaba (la Checkout Session caduca, o Stripe rechaza el cobro),
 * que es el caso más común con Bizum: la clienta abre el enlace, no completa
 * el pago, y la plaza de "gratis para las 4 primeras" se quedaba gastada para
 * siempre sin que nadie la hubiera usado.
 *
 * La plaza puede intentar devolverse varias veces para la MISMA compra: el
 * webhook (`checkout.session.expired`, `payment_intent.canceled`), sus
 * reintentos y el conciliador horario. Devolverla en cada uno regalaría
 * plazas, así que va una sola vez por CLAVE (la Checkout Session en el Modo
 * A, el PaymentIntent en el embebido): la primera gana, las demás no hacen
 * nada. Mismo patrón compare-and-set que `codigos_descuento_consumos`.
 */
export async function liberarCupoMatriculaUnaVez(
  admin: SupabaseClient,
  clave: string,
  planId: string,
  studioId: string,
): Promise<boolean> {
  // ⚠️ Anotar y devolver van en UNA transacción, dentro de la RPC. Antes eran
  // dos llamadas (INSERT de dedup + `liberar_cupo_matricula`, que se tragaba
  // el error): si la segunda fallaba, la fila de «ya devuelta» quedaba escrita
  // y la plaza no volvía nunca — ni el reintento del webhook ni el conciliador
  // podían, porque el INSERT ya chocaba.
  //
  // Aquí un error SE LANZA: no ha quedado nada anotado, así que el webhook
  // contesta 5xx (Stripe reintenta) y el conciliador lo vuelve a probar.
  const { data, error } = await admin.rpc('liberar_cupo_matricula_una_vez', {
    p_clave: clave, p_plan_id: planId, p_studio_id: studioId,
  });
  if (error) throw new Error(`liberar_cupo_matricula_una_vez: ${error.message}`);
  return data === true;
}

/**
 * ¿Esta respuesta de Stripe es la REPETICIÓN de una creación anterior con la
 * misma clave de idempotencia? (Probado en Stripe test: la primera no trae la
 * cabecera; la repetida trae `idempotent-replayed: true` y el mismo objeto.)
 *
 * Los dos checkouts reservan la plaza de matrícula gratis ANTES de crear el
 * cobro con una clave de idempotencia por intento. Dos peticiones del mismo
 * intento (doble clic, dos pestañas, reintento de red) reservaban dos plazas y
 * Stripe devolvía UN solo cobro: la segunda plaza no la usaba nadie y no
 * volvía nunca. Si la respuesta es repetida, quien la recibe no ha creado nada
 * y tiene que devolver lo que reservó.
 */
export function esRespuestaRepetida(respuesta: unknown): boolean {
  const cabeceras = (respuesta as { lastResponse?: { headers?: Record<string, unknown> } } | null)
    ?.lastResponse?.headers;
  return cabeceras?.['idempotent-replayed'] === 'true';
}
