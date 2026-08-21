// ─────────────────────────────────────────────────────────────────────────────
// «Pagué, me quedé en lista de espera y nunca se liberó sitio».
//
// Reglas PURAS de qué hacer cuando esa espera ya no puede resolverse (la clase
// pasó). El barrido que las aplica vive en `barrerEsperasSinPlaza`
// (lib/db/supabase-data-admin.ts), junto a `barrerNoShows`, con el que comparte
// cron, cadencia y forma: reservas que se quedaron en un estado transitorio en
// una clase ya terminada.
//
// Contexto de por qué esto existe: en «pagar y reservar sin login» el pago
// ENTREGA el bono antes de intentar reservar (entregarPlanComprado), y una
// reserva en LISTA_ESPERA no consume bono. Así que el dinero nunca se pierde —
// queda un crédito vivo. Lo que faltaba no era el dinero, era CONTARLO: la
// pantalla de pago le prometió «te avisaremos si se libera un sitio», y si no
// se libera nunca ese aviso no llega jamás.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que hay que saber de la compra para decidir. */
export interface CompraDeLaEspera {
  /** `planes_tarifa.tipo` del plan comprado. */
  tipoPlan: string | null;
  /** `suscripciones.sesiones_restantes`. `null` en planes sin bolsa (MENSUAL). */
  sesionesRestantes: number | null;
  /** `suscripciones.estado`: solo una ACTIVA deja un crédito de verdad. */
  estadoSuscripcion: string | null;
}

export interface CierreDeEspera {
  /** Email a la socia. `false` = no hay nada honesto que contarle. */
  avisarSocia: boolean;
  /** Aviso al mostrador (hay dinero cobrado que no dio clase). */
  avisarEstudio: boolean;
  /** Sesiones que le quedan sin gastar, para el copy. */
  sesionesRestantes: number;
}

/**
 * Qué se le dice a quien pagó y no llegó a entrar.
 *
 * El tipo de plan lo cambia todo, y es la parte que NO es obvia:
 *
 * · **MENSUAL** (o cualquier plan sin bolsa de sesiones): compró acceso al mes,
 *   no a esa clase. No ha perdido nada y nadie tiene que hacer nada — avisarla
 *   sería alarmarla sin motivo. Se cierra la reserva y se calla.
 * · **Bono de N sesiones (N > 1)**: el crédito es exactamente lo que quería
 *   comprar. Aviso informativo, sin drama, y ningún trabajo para el estudio.
 * · **Clase suelta (queda 1 sesión)**: aquí el «crédito» no es un crédito, es
 *   una devolución que nadie ha hecho. Pagó por ESA clase, no tiene cuenta en
 *   el portal y le queda un saldo que nadie va a reclamar. Este caso, y solo
 *   este, engancha el aviso al mostrador para que alguien decida (ofrecerle
 *   otra clase, o devolverle el dinero desde su ficha).
 *
 * Una suscripción que ya no está ACTIVA, o sin sesiones que gastar, tampoco
 * genera nada: no queda crédito del que hablar.
 */
export function decidirCierreDeEspera(compra: CompraDeLaEspera): CierreDeEspera {
  const nada: CierreDeEspera = { avisarSocia: false, avisarEstudio: false, sesionesRestantes: 0 };

  if (compra.estadoSuscripcion !== 'ACTIVA') return nada;
  // Sin bolsa de sesiones no hay crédito que se quede sin usar: el plan es
  // temporal (MENSUAL) y sigue valiendo para el resto de clases del periodo.
  if (compra.sesionesRestantes == null) return nada;
  if (compra.sesionesRestantes <= 0) return nada;

  return {
    avisarSocia: true,
    avisarEstudio: compra.sesionesRestantes === 1,
    sesionesRestantes: compra.sesionesRestantes,
  };
}

/** Prefijo de los ids que nacen de un pago del widget (ver `idsDe`). */
export const PREFIJO_RESERVA_WEB = 'res-web-';

/**
 * `res-web-<base>` → `sus-web-<base>`. Los cuatro ids de una compra comparten
 * base (`idsDe` en lib/billing/entregar-plan-comprado.ts), así que la reserva
 * lleva dentro cómo encontrar el bono que se pagó por ella. Devuelve `null` si
 * la reserva no viene de ese camino — nadie más debe recibir este correo.
 */
export function suscripcionDeReservaWeb(reservaId: string): string | null {
  if (!reservaId.startsWith(PREFIJO_RESERVA_WEB)) return null;
  const base = reservaId.slice(PREFIJO_RESERVA_WEB.length);
  return base ? `sus-web-${base}` : null;
}
