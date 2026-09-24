// Sin imports ni `@/` (ver push-estado.ts).
//
// Qué fallos de escritura NO son un error de la app y por tanto no van a
// Sentry: la usuaria ya recibe su propio mensaje y no hay nada que arreglar.
// (El toast se pinta igual; esto solo decide si además salta una alarma.)

/**
 * Postgres `23P01` (`exclusion_violation`): las restricciones `EXCLUDE` del
 * repo son todas de SOLAPE de horario (`sesiones_instructor_sin_solape`, la de
 * sala y la de sustituciones): una instructora o una sala con dos clases a la
 * vez. Es una regla de negocio que dice que no, con su mensaje traducido en
 * `mensajeDeFalloAlGuardar` («ya tiene una clase a esa hora»). Llegó a Sentry 9
 * veces de 2 usuarias en una semana (JAVASCRIPT-NEXTJS-2W).
 *
 * ⚠️ Si algún día se añade una restricción `EXCLUDE` que NO sea un conflicto
 * de negocio (un invariante que solo puede romper un bug), este código ya no
 * vale tal cual: habrá que mirar el nombre de la restricción.
 */
const CODIGO_EXCLUSION = '23P01';

/**
 * 409 es, por convención en TODAS las API routes de este repo (equipo,
 * decisiones, sustituciones, terminal, penalizaciones...), "conflicto de
 * negocio ya resuelto con su propio mensaje al usuario" — el propio código de
 * app/api/equipo/route.ts lo dice literal: "Se responde 409 con qué hacer, y
 * no se registra nada". No es un bug de la app: es la respuesta esperada a un
 * intento de dar de alta un email duplicado, aprobar dos veces la misma
 * recomendación, etc. — ruido no accionable en Sentry (auditoría M-5).
 */
export function esConflictoDeNegocioEsperado(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { status?: unknown; code?: unknown };
  return e.status === 409 || e.code === CODIGO_EXCLUSION;
}
