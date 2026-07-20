// ─────────────────────────────────────────────────────────────────────────────
// Riesgo de plantón (no-show) — score graduado, PURO y testeable.
//
// Sustituye al umbral booleano (`noShow30d` + regla R4: "≥3 plantones y ratio
// ≥40%"), que trata igual a quien falló 3 de 4 veces la semana pasada y a quien
// falló 3 de 40 hace dos meses.
//
// Tres decisiones de modelado, explícitas:
//
//  1. DENOMINADOR: solo cuentan las reservas que llegaron a resolverse en
//     asistir o no asistir (ASISTIDA + NO_ASISTIO). Una CANCELADA a tiempo NO es
//     un plantón — es buen comportamiento — y meterla en el denominador diluía
//     el ratio (lo hace `noShow30d`, que sí la cuenta).
//  2. FECHA: se usa la fecha de la CLASE, no la de creación de la reserva. Lo
//     que importa es cuándo falló, no cuándo reservó.
//  3. RECENCIA: cada reserva pesa por antigüedad con decaimiento exponencial
//     (vida media configurable). Un plantón de ayer pesa mucho más que uno de
//     hace tres meses.
//
// Y con pocos datos NO se dispara: el ratio se suaviza hacia una tasa base
// (prior bayesiano), así que 1 de 1 no es "100% de riesgo".
// ─────────────────────────────────────────────────────────────────────────────

const MS_DIA = 86400000;

/** Ventana de historial considerada. */
export const VENTANA_DIAS = 90;
/** Vida media del decaimiento: a los 45 días una reserva pesa la mitad. */
export const VIDA_MEDIA_DIAS = 45;
/** Tasa base de plantón asumida cuando no hay datos suficientes. */
export const PRIOR_RATIO = 0.08;
/**
 * Peso del prior, en "reservas equivalentes". Calibrado a 2: con 4 el prior
 * ahogaba la señal real (quien fallaba 1 de cada 3 clases recientes salía BAJO,
 * y 3 plantones de 3 se quedaban en MEDIO). Con 2 sigue evitando que una muestra
 * mínima dispare el score —con 3 reservas el prior aún pesa un 40%— pero deja
 * aflorar los patrones reales.
 */
export const PRIOR_PESO = 2;
/** Por debajo de estas reservas resueltas no se emite nivel (SIN_DATOS). */
export const MINIMO_RESUELTAS = 3;
export const UMBRAL_ALTO = 50;
export const UMBRAL_MEDIO = 25;

export type NivelRiesgoNoShow = 'ALTO' | 'MEDIO' | 'BAJO' | 'SIN_DATOS';

/** Una reserva ya resuelta, con la fecha de la CLASE. */
export interface ReservaHistorica {
  estado: string;
  /** ISO de inicio de la sesión. */
  fecha: string;
}

export interface RiesgoNoShow {
  score: number;            // 0-100
  nivel: NivelRiesgoNoShow;
  noShows: number;          // plantones en la ventana
  resueltas: number;        // ASISTIDA + NO_ASISTIO en la ventana
  ratioCrudo: number;       // sin suavizar ni ponderar (para explicarlo)
}

const SIN_DATOS: RiesgoNoShow = { score: 0, nivel: 'SIN_DATOS', noShows: 0, resueltas: 0, ratioCrudo: 0 };

function peso(fechaISO: string, now: Date): number {
  const dias = (now.getTime() - new Date(fechaISO).getTime()) / MS_DIA;
  if (!Number.isFinite(dias) || dias < 0) return 0; // futuras o inválidas no cuentan
  return Math.pow(0.5, dias / VIDA_MEDIA_DIAS);
}

function nivelDe(score: number): NivelRiesgoNoShow {
  if (score >= UMBRAL_ALTO) return 'ALTO';
  if (score >= UMBRAL_MEDIO) return 'MEDIO';
  return 'BAJO';
}

/**
 * Riesgo de que esta socia no aparezca a su próxima clase, 0-100.
 * Determinista: mismas reservas + mismo `now` → mismo score.
 */
export function riesgoNoShow(historial: ReservaHistorica[], now: Date): RiesgoNoShow {
  const desde = now.getTime() - VENTANA_DIAS * MS_DIA;
  const resueltasArr = historial.filter(r => {
    if (r.estado !== 'ASISTIDA' && r.estado !== 'NO_ASISTIO') return false;
    const t = new Date(r.fecha).getTime();
    return Number.isFinite(t) && t >= desde && t <= now.getTime();
  });

  if (resueltasArr.length < MINIMO_RESUELTAS) return SIN_DATOS;

  let pesoTotal = 0;
  let pesoNoShows = 0;
  for (const r of resueltasArr) {
    const w = peso(r.fecha, now);
    pesoTotal += w;
    if (r.estado === 'NO_ASISTIO') pesoNoShows += w;
  }

  // Suavizado bayesiano hacia la tasa base: con poco peso efectivo, el score
  // tiende al prior en vez de dispararse.
  const ratioSuavizado = (pesoNoShows + PRIOR_PESO * PRIOR_RATIO) / (pesoTotal + PRIOR_PESO);
  const score = Math.max(0, Math.min(100, Math.round(ratioSuavizado * 100)));

  const noShows = resueltasArr.filter(r => r.estado === 'NO_ASISTIO').length;
  return {
    score,
    nivel: nivelDe(score),
    noShows,
    resueltas: resueltasArr.length,
    ratioCrudo: noShows / resueltasArr.length,
  };
}

/** Frase corta para explicarle el score a una persona. */
export function explicarRiesgo(r: RiesgoNoShow): string {
  if (r.nivel === 'SIN_DATOS') return 'Sin historial suficiente';
  const pct = Math.round(r.ratioCrudo * 100);
  return `${r.noShows} de ${r.resueltas} clases sin avisar (${pct}%)`;
}
