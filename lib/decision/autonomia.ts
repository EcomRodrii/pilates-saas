// ─────────────────────────────────────────────────────────────────────────────
// Piloto automático del Decision OS — lógica pura (ver autonomia.test.ts).
//
// Decide qué recomendaciones pueden EJECUTARSE SOLAS (sin aprobación del dueño).
// El pipeline ya calcula `nivelAutonomia` (0-3) por recomendación, topado por su
// confianza; aquí se combina con la config del estudio para seleccionar las que
// se auto-aprueban. La ejecución en sí reutiliza F3 (DECISION_APPROVED).
//
// SEGURIDAD: off por defecto; solo ALTA confianza + autonomía ≥2; NUNCA cobros a
// tarjeta (COBRAR_RECIBOS queda fuera de la allowlist pase lo que pase); tope
// diario por estudio. Sin I/O — determinista y testeable.
// ─────────────────────────────────────────────────────────────────────────────

import type { Recomendacion, AccionDecision } from './tipos.ts';

type TipoAccion = AccionDecision['tipo'];

export interface AutonomiaConfig {
  activa: boolean;
  tiposPermitidos: TipoAccion[];
  maxDiario: number;
}

// Tipos de acción que PUEDEN ejecutarse de forma autónoma. Deliberadamente NO
// incluye COBRAR_RECIBOS (cargo a tarjeta = acción financiera, siempre manual)
// ni MARCAR_GESTIONADO (sin efecto externo).
export const TIPOS_AUTONOMIA_PERMITIDOS: TipoAccion[] = ['ENVIAR_EMAIL', 'CONTACTO_MANUAL'];

export const MAX_DIARIO_TOPE = 50;

// Off por defecto; si el dueño lo enciende, arranca solo con emails.
export const AUTONOMIA_CONFIG_DEFAULT: AutonomiaConfig = {
  activa: false,
  tiposPermitidos: ['ENVIAR_EMAIL'],
  maxDiario: 5,
};

// Normaliza una config entrante (guardia de servidor): descarta cualquier tipo
// fuera de la allowlist —nunca deja pasar COBRAR_RECIBOS aunque el body lo pida—,
// dedup, acota el tope diario y coacciona `activa` a booleano estricto.
export function sanitizarConfig(input: Partial<AutonomiaConfig> | null | undefined): AutonomiaConfig {
  const tiposIn = Array.isArray(input?.tiposPermitidos) ? input!.tiposPermitidos : AUTONOMIA_CONFIG_DEFAULT.tiposPermitidos;
  const permitidos = tiposIn.filter((t): t is TipoAccion => TIPOS_AUTONOMIA_PERMITIDOS.includes(t as TipoAccion));
  const maxIn = typeof input?.maxDiario === 'number' && Number.isFinite(input.maxDiario)
    ? Math.round(input.maxDiario) : AUTONOMIA_CONFIG_DEFAULT.maxDiario;
  return {
    activa: input?.activa === true,
    tiposPermitidos: [...new Set(permitidos)],
    maxDiario: Math.max(0, Math.min(MAX_DIARIO_TOPE, maxIn)),
  };
}

// ¿Una recomendación PENDIENTE puede ejecutarse sola?
export function elegibleParaAutonomia(r: Recomendacion, config: AutonomiaConfig): boolean {
  if (!config.activa) return false;
  if (r.estado !== 'PENDIENTE') return false;
  if (r.confianza.nivel !== 'ALTA') return false;
  if (r.nivelAutonomia < 2) return false;
  // Doble guardia: el tipo debe estar en la allowlist global Y en la del estudio.
  if (!TIPOS_AUTONOMIA_PERMITIDOS.includes(r.accion.tipo)) return false;
  if (!config.tiposPermitidos.includes(r.accion.tipo)) return false;
  return true;
}

// Selecciona las recomendaciones que se ejecutan solas, respetando el cupo diario
// ya consumido. Prioriza por score descendente (las de más impacto primero).
export function seleccionarAutonomas(
  recomendaciones: Recomendacion[],
  config: AutonomiaConfig,
  yaHechasHoy: number,
): Recomendacion[] {
  if (!config.activa) return [];
  const cupo = Math.max(0, config.maxDiario - Math.max(0, yaHechasHoy));
  if (cupo === 0) return [];
  return recomendaciones
    .filter(r => elegibleParaAutonomia(r, config))
    .sort((a, b) => b.score - a.score)
    .slice(0, cupo);
}
