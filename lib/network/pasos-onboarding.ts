// Lista de pasos del wizard de onboarding (app/network/crear-perfil) y la
// lógica de "en qué paso está esta persona" — PURA, sin imports de React,
// para que tanto el propio wizard como app/network/reanudar (Fase 4, "Hola
// de nuevo") y app/api/auth/destino-post-login lean del MISMO sitio. Antes
// de este fichero, el wizard tenía su propio heurístico inline; extraerlo
// evita que reanudar calcule un paso distinto al que el wizard elegiría al
// abrirse solo — "nunca dos fuentes de verdad de qué cuenta como completo",
// mismo principio que ya sigue lib/network/completitud.ts.
import type { PerfilNetwork } from './tipos.ts';

export const PASOS_ONBOARDING = [
  { n: 1, titulo: 'Tu cuenta' },
  { n: 2, titulo: 'Verifica tu identidad' },
  { n: 3, titulo: 'Dónde estás' },
  { n: 4, titulo: 'Tu experiencia' },
  { n: 5, titulo: 'Especialidades' },
  { n: 6, titulo: 'Formación' },
  { n: 7, titulo: 'Cómo quieres trabajar' },
  { n: 8, titulo: 'Disponibilidad' },
  { n: 9, titulo: 'Tarifa' },
  { n: 10, titulo: 'Tu perfil' },
  { n: 11, titulo: 'Revisar' },
  { n: 12, titulo: 'Enviar a revisión' },
] as const;

/**
 * Índice (0-based) del paso donde debería aterrizar esta persona.
 * `null` de perfil → paso 0 (todavía no ha pasado de "Tu cuenta", caso que
 * en la práctica no debería darse aquí — sin perfil no hay sesión que
 * reanudar — pero se cubre por si acaso). Publicado → el último (vista de
 * revisión/publicar).
 *
 * ⚠️ Antes esto saltaba de "Especialidades" directo a "cerca del final"
 * (índice `length - 3`) en cuanto había ciudad + alguna especialidad —
 * dejando Formación, Cómo quieres trabajar, Disponibilidad y Tarifa SIN
 * TOCAR pero con el check ✓ verde del rail pintado igual (ese check solo
 * comprueba `i < paso`, no si el paso tiene datos reales — ver
 * `app/network/crear-perfil/page.tsx`). Una instructora que cerraba la
 * pestaña a medio wizard podía acabar enviando a revisión un perfil sin
 * disponibilidad ni tarifa, convencida de que estaban rellenas. Ahora
 * recorre los campos EN ORDEN y aterriza en el primero que de verdad esté
 * vacío — mismo principio que ya sigue lib/network/completitud.ts ("nunca
 * dos fuentes de verdad de qué cuenta como completo"), aplicado paso a
 * paso en vez de en un solo porcentaje agregado.
 *
 * Formación (índice 5) se salta a propósito: es opcional en el propio
 * wizard ("Lo haré más tarde"), así que no bloquea la reanudación aunque
 * esté vacía.
 */
export function pasoIncompletoDe(perfil: PerfilNetwork | null): number {
  if (!perfil) return 0;
  // 'en_revision' cuenta como completo a estos efectos: el wizard ya se
  // terminó, lo que falta ahora es que el equipo de Tentare lo apruebe, no
  // que la instructora siga rellenando pasos.
  if (perfil.estado === 'published' || perfil.estado === 'en_revision') return PASOS_ONBOARDING.length - 1;
  if (!perfil.ciudad) return 2;
  if (perfil.especialidades.length === 0) return 4;
  if (perfil.tipoTrabajo.length === 0) return 6;
  if (perfil.disponibilidadHorarios.length === 0) return 7;
  if (!perfil.tarifaRango) return 8;
  return 9;
}
