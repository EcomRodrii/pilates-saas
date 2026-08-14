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
  { n: 12, titulo: 'Publicar' },
] as const;

/**
 * Índice (0-based) del paso donde debería aterrizar esta persona.
 * `null` de perfil → paso 0 (todavía no ha pasado de "Tu cuenta", caso que
 * en la práctica no debería darse aquí — sin perfil no hay sesión que
 * reanudar — pero se cubre por si acaso). Publicado → el último (vista de
 * revisión/publicar). El resto usa el mismo heurístico grueso que ya
 * tenía el wizard: ciudad → especialidades → el resto, suficiente para
 * "sigue donde lo dejaste" sin reconstruir aquí todo lib/network/
 * completitud.ts (que pesa 8 secciones distintas a las 12 de este wizard).
 */
export function pasoIncompletoDe(perfil: PerfilNetwork | null): number {
  if (!perfil) return 0;
  // 'en_revision' cuenta como completo a estos efectos: el wizard ya se
  // terminó, lo que falta ahora es que el equipo de Tentare lo apruebe, no
  // que la instructora siga rellenando pasos.
  if (perfil.estado === 'published' || perfil.estado === 'en_revision') return PASOS_ONBOARDING.length - 1;
  if (!perfil.ciudad) return 2;
  if (perfil.especialidades.length === 0) return 4;
  return PASOS_ONBOARDING.length - 3;
}
