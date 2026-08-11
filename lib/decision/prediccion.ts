// ─────────────────────────────────────────────────────────────────────────────
// Predicción — "¿qué probabilidad hay de que esto pase?"
//
// NO es lo mismo que Confianza (confianza.ts), y mezclarlas sería el error caro.
// Confianza mide cuánto se fía el MOTOR de su propio diagnóstico ("tengo datos
// suficientes para afirmar esto"). Predicción mide la probabilidad de que UN
// HECHO FUTURO ocurra ("María acepta 9 de cada 10 sustituciones que le
// ofrecemos"). Una recomendación puede tener confianza ALTA sobre una
// probabilidad BAJA: "estoy segurísimo de que esta clase no se va a llenar".
//
// Regla no negociable, heredada de ConfianzaMedicion (MEDIDO | NO_MEDIBLE) y de
// calibrarUmbral (mínimo de muestras antes de calibrar): con muestra
// insuficiente esto devuelve `null`, NUNCA un número. Un porcentaje inventado
// que la propietaria se cree es peor que no enseñar ninguno — el llamador se
// queda con la heurística que ya tuviera.
//
// Sin I/O, determinista y testeable (ver prediccion.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface Prediccion {
  /** 0..1 */
  probabilidad: number;
  /**
   * Por qué sale ese número, en lenguaje humano y con las cifras que lo
   * sostienen — p.ej. "ha aceptado 10 de sus últimas 11 peticiones". Obligatorio
   * a propósito: en este producto la propietaria nunca ve una cifra sin su
   * respaldo (mismo criterio que los `motivos` de rankear_candidatas y las
   * `formula` de Impacto).
   */
  base: string;
  /** Observaciones reales sobre las que se calculó. Nunca menor que MUESTRA_MINIMA. */
  nMuestras: number;
}

/**
 * Por debajo de esto no se publica probabilidad. Mismo número que usa
 * `calibrarUmbral` para no calibrar con ruido: 4 aciertos de 4 intentos son un
 * 100 % que no significa nada.
 */
export const MUESTRA_MINIMA = 5;

/**
 * Peso del prior en cuentas pequeñas (pseudo-observaciones). Con 5 muestras el
 * prior del grupo todavía pesa la mitad; a partir de ~20 la evidencia propia
 * manda. Es lo que evita que "5 de 5" se convierta en un 100 % que luego falla.
 */
export const FUERZA_PRIOR = 5;

const acotar01 = (n: number) => Math.max(0, Math.min(1, n));

export interface EntradaPrediccion {
  /** Veces que el hecho ocurrió (aceptó, se llenó, cobró…). */
  exitos: number;
  /** Veces que se observó (aceptó + rechazó + no contestó…). */
  total: number;
  /**
   * Tasa base del grupo con la que se suaviza (la media del estudio, del pool
   * de instructoras, del tipo de clase…). Es lo que hace que una instructora
   * nueva no arranque en 0 % ni en 100 %.
   */
  prior: number;
  /** Frase con las cifras que sostienen el número (ver Prediccion.base). */
  base: string;
}

/**
 * Estimación suavizada hacia el prior del grupo (Beta-Binomial con
 * pseudo-cuentas): `(exitos + k·prior) / (total + k)`.
 *
 * Devuelve `null` —y esto es la mitad del valor de esta función— cuando la
 * muestra no llega a MUESTRA_MINIMA, cuando el prior no es un número usable o
 * cuando las cifras son incoherentes. Quien llame debe tratar `null` como "no
 * tengo ni idea, sigue con lo que hacías", no como probabilidad cero.
 */
export function estimarProbabilidad(e: EntradaPrediccion): Prediccion | null {
  const total = Math.floor(e.total);
  const exitos = Math.floor(e.exitos);
  if (!Number.isFinite(total) || !Number.isFinite(exitos)) return null;
  if (total < MUESTRA_MINIMA) return null;
  if (exitos < 0 || exitos > total) return null;
  if (!Number.isFinite(e.prior)) return null;

  const prior = acotar01(e.prior);
  const probabilidad = (exitos + FUERZA_PRIOR * prior) / (total + FUERZA_PRIOR);

  return { probabilidad: acotar01(probabilidad), base: e.base, nMuestras: total };
}

/**
 * Tasa base de un grupo (la media que sirve de prior). `null` si el grupo no
 * tiene ninguna observación — sin base no hay prior que aplicar, y forzar un
 * 0.5 arbitrario metería una opinión donde no hay dato.
 */
export function tasaBase(exitos: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(exitos) || exitos < 0) return null;
  return acotar01(exitos / total);
}

export type NivelPrediccion = 'ALTA' | 'MEDIA' | 'BAJA';

/**
 * Etiqueta cualitativa para cuando la pantalla habla en vez de enseñar la
 * cifra ("probabilidad de llenado: baja"). Los cortes son de producto, no
 * estadísticos: por debajo de 1/3 es "cuenta con que no", por encima de 2/3 es
 * "cuenta con que sí", y en medio es justo lo que hay que mirar.
 */
export function nivelPrediccion(probabilidad: number): NivelPrediccion {
  if (probabilidad >= 0.67) return 'ALTA';
  if (probabilidad <= 0.33) return 'BAJA';
  return 'MEDIA';
}

/**
 * Porcentaje entero listo para pintar. Se redondea al entero y NUNCA se
 * muestra suelto: quien lo pinte enseña también `Prediccion.base`.
 */
export function formatearProbabilidad(probabilidad: number): string {
  return `${Math.round(acotar01(probabilidad) * 100)} %`;
}
