// Cómo se presenta una candidata del ranking en el panel de sustituciones.
//
// Está aquí y no en el JSX porque es lenguaje, no maquetación — mismo criterio
// que lib/sustituciones/mensajes.ts y lib/avisos-portal.ts.
//
// ⚠️ El motivo de que esto exista: la card enseñaba "Compatibilidad 87 %", y ese
// porcentaje era `LEAST(99, GREATEST(55, score))` sobre una heurística fija
// (0038). No medía nada — dos candidatas con historiales muy distintos salían
// las dos al 99 %, y la propietaria leía eso como "el sistema calcula que
// encajan un 99 %". Un número inventado que se cree quien lo lee es peor que no
// enseñar ninguno.
//
// Ahora hay dos cosas separadas y con nombres distintos:
//  · ENCAJE     — cualitativo, sin cifra. Es el score de siempre (disponible,
//                 conoce la clase, va holgada de horas) pintado como barra.
//  · PROBABILIDAD — cuantitativo y real, del historial de respuestas de esa
//                 instructora (rankear_candidatas, migr 20260810231458). Solo
//                 aparece cuando existe; nunca se rellena con un valor por
//                 defecto.
import { formatearProbabilidad, nivelPrediccion } from '../decision/prediccion.ts';

export interface CandidataRanking {
  compatibilidad?: number;
  prob_aceptacion?: number | null;
  prob_aceptadas?: number;
  prob_ofertas?: number;
}

export interface EncajeCandidata {
  /** Ancho de la barra, 0..100. Indicador relativo — no se rotula con cifra. */
  barra: number;
  /** "82 %" o `null` si no hay historial suficiente para afirmar nada. */
  probabilidad: string | null;
  /** "Suele aceptar" / "Responde a veces" / "Rara vez acepta", o `null`. */
  etiqueta: string | null;
  /** "ha dicho que sí 9 de las últimas 10 veces", o `null`. */
  respaldo: string | null;
}

const ETIQUETA = { ALTA: 'Suele aceptar', MEDIA: 'Responde a veces', BAJA: 'Rara vez acepta' } as const;

export function encajeDe(c: CandidataRanking): EncajeCandidata {
  const barra = Math.max(0, Math.min(100, Math.round(c.compatibilidad ?? 0)));

  // `null` Y `undefined` significan lo mismo aquí (sin historial suficiente, o
  // ranking guardado antes de la migración). Lo que NO puede pasar es tratarlo
  // como 0: un 0 es "casi nunca acepta", y eso sería difamar a una instructora
  // de la que sencillamente no sabemos nada todavía.
  const p = c.prob_aceptacion;
  if (typeof p !== 'number' || !Number.isFinite(p)) {
    return { barra, probabilidad: null, etiqueta: null, respaldo: null };
  }

  const aceptadas = c.prob_aceptadas;
  const ofertas = c.prob_ofertas;
  const respaldo = typeof aceptadas === 'number' && typeof ofertas === 'number' && ofertas > 0
    ? `ha dicho que sí ${aceptadas} de las últimas ${ofertas} veces`
    : null;

  return {
    barra,
    probabilidad: formatearProbabilidad(p),
    etiqueta: ETIQUETA[nivelPrediccion(p)],
    respaldo,
  };
}
