// Qué scopes puede conceder cada rol y cada plan, y cuáles valen de verdad en
// una petición.
//
// Regla: una credencial nunca ve más que la persona que la concedió. Antes,
// `/api/oauth/authorize` solo comprobaba que quien autorizaba fuera PROPIETARIO
// o MANAGER (`puedeGestionarAppsOAuth`) y aceptaba cualquier scope del
// catálogo: un MANAGER —que no ve las finanzas del estudio— podía darle a una
// app externa `pagos:leer`. Mientras ese scope no tenía endpoint no pasaba
// nada; desde que la API expone cobros y facturas, sí.
//
// Se comprueba dos veces: al conceder (no se emite nada que el rol no pueda
// ver) y en CADA petición, con el rol que la persona tiene HOY. Quien deja el
// estudio o baja de rol se lleva el acceso de las apps que autorizó.

import type { Rol } from '../types';
import type { Plan } from '../billing/entitlements.ts';
import { puedeGestionarAppsOAuth, puedeVerDatosPrivadosSocia, puedeVerFinanzas } from '../permisos-reglas.ts';
import { SCOPES_DATOS_PRIVADOS, SCOPES_FINANCIEROS, SCOPES_VALIDOS, type ScopeOAuth } from './catalogo-scopes.ts';

/** Los scopes que `rol` puede conceder (a una app OAuth o a una clave de API). */
export function scopesQuePuedeConceder(rol: Rol | null | undefined): ScopeOAuth[] {
  if (!rol || !puedeGestionarAppsOAuth(rol)) return [];
  return SCOPES_VALIDOS.filter((s) => {
    if (SCOPES_FINANCIEROS.includes(s) && !puedeVerFinanzas(rol)) return false;
    if (SCOPES_DATOS_PRIVADOS.includes(s) && !puedeVerDatosPrivadosSocia(rol)) return false;
    return true;
  });
}

/**
 * Los scopes que da cada plan.
 *
 * ⚠️ Hoy todos los planes dan todos los scopes: no hay ninguna decisión
 * comercial tomada sobre qué plan incluye qué parte de la API, y no se inventa
 * (decisión del fundador, 1-oct-2026). Este es el ÚNICO sitio donde se pondrá
 * cuando la haya: `autenticarApiPublica` ya cruza los scopes de cada petición
 * con el plan del estudio.
 *
 * Que la API no esté abierta a todo el mundo no se decide aquí, sino estudio a
 * estudio: las claves de API solo se pueden crear en un estudio con la API
 * activada (`api_acceso_estudios`, la activa Tentare desde /interno).
 */
export function scopesDelPlan(_plan: Plan): readonly ScopeOAuth[] {
  return SCOPES_VALIDOS;
}

/**
 * Los scopes que valen en ESTA petición: lo que tiene la credencial, recortado
 * a lo que hoy puede ver quien la concedió y a lo que da el plan del estudio.
 */
export function scopesEfectivos(p: {
  credencial: readonly string[];
  rolDeQuienConcedio: Rol | null | undefined;
  plan: Plan;
}): ScopeOAuth[] {
  const rol = new Set<string>(scopesQuePuedeConceder(p.rolDeQuienConcedio));
  const plan = new Set<string>(scopesDelPlan(p.plan));
  return SCOPES_VALIDOS.filter((s) => p.credencial.includes(s) && rol.has(s) && plan.has(s));
}
