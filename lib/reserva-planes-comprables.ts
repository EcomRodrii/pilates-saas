// Qué puede comprar, sin cuenta previa, quien llega a la página pública de
// reservas y quiere una clase concreta.
//
// Vive aquí y no dentro de `app/reservar/[slug]/page.tsx` porque es una regla
// de negocio con dinero detrás —qué se le ofrece a una desconocida y en qué
// orden— y merece tests propios: la versión anterior solo devolvía planes
// PUNTUAL, y en un estudio que vende bonos de 10 y cuotas (la mayoría de los
// de Pilates) eso significaba no poder vender NADA por el enlace público.
//
// MENSUAL queda fuera a propósito: es un compromiso recurrente, y crear una
// suscripción que se renovará sola a nombre de alguien que todavía no ha
// verificado su email ni tiene contraseña es otra conversación. Se sigue
// vendiendo en la tienda del portal, donde quien compra ya está identificada.

import type { PlanTarifa } from './types.ts';

/** ¿Cubre este plan las clases de este tipo? Sin tipos marcados, cubre todas
 *  (mismo criterio que `hidratarTiposDePlanes`/`tieneEntitlementActivo`). */
export function planCubreTipo(plan: PlanTarifa, tipoClaseId: string | null | undefined): boolean {
  if (!plan.tiposClaseIds || plan.tiposClaseIds.length === 0) return true;
  return !!tipoClaseId && plan.tiposClaseIds.includes(tipoClaseId);
}

/**
 * Lo comprable para reservar ESTA clase, de más barato a más caro y con la
 * clase suelta siempre delante: lo primero que se ve es la forma más barata de
 * entrar por la puerta, no la más cara.
 */
export function planesComprablesParaReservar(
  tipoClaseId: string | null | undefined,
  planes: PlanTarifa[],
): PlanTarifa[] {
  return planes
    .filter(p => p.activo && p.precio > 0 && (p.tipo === 'PUNTUAL' || p.tipo === 'BONO') && planCubreTipo(p, tipoClaseId))
    .sort((a, b) => (a.tipo === b.tipo ? a.precio - b.precio : a.tipo === 'PUNTUAL' ? -1 : 1));
}
