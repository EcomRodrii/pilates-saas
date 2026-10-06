// Denuncias de la app: quién las revisa, qué se puede decidir y qué se le dice
// a cada parte. Las reglas puras; la cerradura está en la base de datos
// (`resolver_denuncia`, migr 20261005150100), que vuelve a comprobar a quién le
// toca y que quien revisa no es quien escribió lo denunciado.
//
// Decisión del fundador (5-oct-2026): las denuncias las atiende el ESTUDIO en su
// panel, y Tentare en /interno las que van contra el propio estudio (su hilo con
// la alumna, o algo escrito por una propietaria) y las que llevan
// `HORAS_REVISION_ESTUDIO` sin revisar.
//
// Puro, sin `@/`: se prueba con `node --test`.

import { HORAS_REVISION_ESTUDIO } from './reglas.ts';

export type AmbitoDenuncia = 'CHAT_INSTRUCTORA' | 'CHAT_ESTUDIO' | 'TABLON';
export type MotivoDenuncia = 'DENUNCIA' | 'BLOQUEO';
export type DestinoDenuncia = 'ESTUDIO' | 'TENTARE';
export type AccionDenuncia = 'MANTENER' | 'OCULTAR' | 'CERRAR_CONVERSACION';
export type ResultadoDenuncia = 'MANTENIDA' | 'CONTENIDO_OCULTO' | 'CONVERSACION_CERRADA';
export type RolEquipo = 'PROPIETARIO' | 'MANAGER' | 'RECEPCION' | 'INSTRUCTOR';

/** Lo que le dice la app a quien denuncia (decisión del fundador). */
export const TEXTO_GRACIAS_DENUNCIA = 'Gracias. Lo revisaremos.';

/** Lo que ve en la app quien ha bloqueado a alguien. */
export const TEXTO_BLOQUEO_HECHO = 'Hecho. Ya no podréis escribiros en esta conversación.';

/**
 * A quién va una denuncia nueva. A Tentare cuando el estudio es parte: su
 * propio hilo con la alumna (CHAT_ESTUDIO: quien contesta ES el estudio) o algo
 * escrito por una propietaria (la dueña o una copropietaria), que no puede
 * revisarse a sí misma.
 */
export function destinoDeDenuncia(p: { ambito: AmbitoDenuncia; autorEsPropietaria: boolean }): DestinoDenuncia {
  return p.ambito === 'CHAT_ESTUDIO' || p.autorEsPropietaria ? 'TENTARE' : 'ESTUDIO';
}

/**
 * Quién del estudio revisa cada ámbito. Un hilo instructora–alumna solo lo lee
 * la propietaria (RLS, 20260914154415), así que solo ella decide sobre él; el
 * tablón lo modera quien ya lo modera (`puedeModerarComunidad`). El hilo con el
 * estudio no lo decide nadie del estudio: va a Tentare.
 */
export function puedeRevisarDenuncia(rol: RolEquipo, ambito: AmbitoDenuncia): boolean {
  if (ambito === 'CHAT_INSTRUCTORA') return rol === 'PROPIETARIO';
  if (ambito === 'TABLON') return rol === 'PROPIETARIO' || rol === 'MANAGER' || rol === 'RECEPCION';
  return false;
}

/** Los ámbitos que ve en su bandeja cada rol (vacío = ninguno). */
export function ambitosQueRevisa(rol: RolEquipo): AmbitoDenuncia[] {
  return (['CHAT_INSTRUCTORA', 'TABLON'] as const).filter((a) => puedeRevisarDenuncia(rol, a));
}

/**
 * Qué puede decidir quien revisa. Cerrar solo vale para un hilo
 * instructora–alumna y solo lo hace la propietaria; retirar, si hay un mensaje
 * o un comentario concreto (un bloqueo sin contenido no tiene nada que retirar).
 */
export function accionesPosibles(
  rol: RolEquipo | 'TENTARE',
  d: { ambito: AmbitoDenuncia; tieneContenido: boolean },
): AccionDenuncia[] {
  const out: AccionDenuncia[] = ['MANTENER'];
  if (d.tieneContenido) out.push('OCULTAR');
  if (d.ambito === 'CHAT_INSTRUCTORA' && (rol === 'PROPIETARIO' || rol === 'TENTARE')) out.push('CERRAR_CONVERSACION');
  return out;
}

/** Horas que le quedan al estudio antes de que la pueda resolver Tentare (0 = ya puede). */
export function horasHastaTentare(creadaEn: string, ahora: Date = new Date()): number {
  const t = Date.parse(creadaEn);
  if (Number.isNaN(t)) return 0;
  const restante = t + HORAS_REVISION_ESTUDIO * 3600_000 - ahora.getTime();
  return restante <= 0 ? 0 : Math.ceil(restante / 3600_000);
}

/** ¿Le toca ya a Tentare esta denuncia? La misma regla que `resolver_denuncia`. */
export function leTocaATentare(d: { destino: DestinoDenuncia; creadaEn: string }, ahora: Date = new Date()): boolean {
  return d.destino === 'TENTARE' || horasHastaTentare(d.creadaEn, ahora) === 0;
}

/** Filtro PostgREST: denuncias que NO van contra esta cuenta (un `neq` a secas dejaría fuera las de autor nulo). */
export function noContraQuienMira(userId: string): string {
  return `autor_auth_user_id.is.null,autor_auth_user_id.neq.${userId}`;
}

/** Desde cuándo una denuncia del estudio pasa a Tentare: lo creado antes de esto ya es suyo. */
export function corteTurnoTentare(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - HORAS_REVISION_ESTUDIO * 3600_000).toISOString();
}

/** Por qué la ve Tentare en /interno: va contra el estudio, o el estudio no la revisó a tiempo. */
export function porQueLaRevisaTentare(d: { destino: DestinoDenuncia }): 'CONTRA_EL_ESTUDIO' | 'SIN_REVISAR_POR_EL_ESTUDIO' {
  return d.destino === 'TENTARE' ? 'CONTRA_EL_ESTUDIO' : 'SIN_REVISAR_POR_EL_ESTUDIO';
}

/** La decisión, contada a quien denunció («Hemos revisado tu denuncia: …»). */
export function textoParaDenunciante(resultado: ResultadoDenuncia, ambito: AmbitoDenuncia): string {
  const que = ambito === 'TABLON' ? 'el comentario' : 'el mensaje';
  if (resultado === 'CONTENIDO_OCULTO') return `hemos retirado ${que}.`;
  if (resultado === 'CONVERSACION_CERRADA') return 'hemos cerrado la conversación.';
  return `${que} no incumple las normas de la comunidad, así que se queda.`;
}

/** Errores de `resolver_denuncia` → respuesta HTTP. `null` = otro error (500). */
export function errorDeResolver(err: unknown): { status: number; error: string } | null {
  const e = (err ?? {}) as { message?: unknown };
  const m = typeof e.message === 'string' ? e.message : '';
  if (m.includes('DENUNCIA_NO_EXISTE')) return { status: 404, error: 'Esta denuncia ya no está pendiente para ti.' };
  if (m.includes('DENUNCIA_YA_RESUELTA')) return { status: 409, error: 'Otra persona ya ha decidido sobre esta denuncia.' };
  if (m.includes('ACCION_INVALIDA')) return { status: 400, error: 'Esa decisión no vale para esta denuncia.' };
  return null;
}

/** Cómo se nombra el ámbito en el panel y en /interno. */
export function etiquetaAmbito(ambito: AmbitoDenuncia): string {
  if (ambito === 'CHAT_INSTRUCTORA') return 'Chat con su instructora';
  if (ambito === 'CHAT_ESTUDIO') return 'Chat con el estudio';
  return 'Tablón';
}
