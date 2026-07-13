// Reglas de medición diferida (DECISION-OS-ARQUITECTURA.md §6 F4,
// DECISION-OS-NUCLEO.md §11). Puro: recibe señales ya resueltas por el
// caller (Fase B consulta el snapshot en T+ventanaDias) y decide el
// resultado — nunca llama a Date.now() ni toca red o DB.
import type { EventoOutcome, ResultadoOutcome, SenalObservada, TipoRecomendacion } from './tipos.ts';

/** Resultado inmediato al cambiar de estado — solo EJECUTADA queda pendiente de medir. */
export function outcomeInmediato(evento: EventoOutcome): ResultadoOutcome {
  return evento === 'EJECUTADA' ? 'PENDIENTE' : 'NEUTRO';
}

/** Ventana de medición por tipo (Arquitectura §6 F4). */
export function ventanaDiasDe(tipo: TipoRecomendacion): number {
  switch (tipo) {
    case 'RECUPERAR_PAGOS':
    case 'COBRAR_PENDIENTE':
      return 3;
    case 'ABRIR_SESION':
    case 'REVISAR_PRECIO':
    case 'MOVER_HORARIO':
    case 'FUSIONAR_SESIONES':
      return 21;
    default:
      return 14; // contacto / reactivación / congelación / marketing
  }
}

export interface SenalMedicion {
  reservaAsistidaPosterior: boolean;
  suscripcionCancelada: boolean;
  suscripcionRenovada: boolean;
  recibosCobrados: number;
  recibosTotal: number;
}

export interface ResultadoMedicion {
  outcome: ResultadoOutcome;
  senalObservada: SenalObservada | null;
}

/**
 * Traduce la señal observada en T+ventanaDias a un resultado. Cancelar
 * siempre pesa como negativo, incluso si hubo alguna reserva puntual antes —
 * el desenlace de negocio es lo que cuenta, no un falso positivo a mitad de camino.
 */
export function medirOutcome(tipo: TipoRecomendacion, senal: SenalMedicion): ResultadoMedicion {
  switch (tipo) {
    case 'RECUPERAR_SOCIA':
      if (senal.suscripcionCancelada) return { outcome: 'NEGATIVO', senalObservada: 'CANCELO' };
      if (senal.reservaAsistidaPosterior) return { outcome: 'POSITIVO', senalObservada: 'RESERVO' };
      return { outcome: 'NEUTRO', senalObservada: 'SIN_RESPUESTA' };

    case 'ENVIAR_REACTIVACION':
    case 'CONGELAR_MEMBRESIA':
      if (senal.suscripcionCancelada) return { outcome: 'NEGATIVO', senalObservada: 'CANCELO' };
      if (senal.suscripcionRenovada) return { outcome: 'POSITIVO', senalObservada: 'RENOVO' };
      if (senal.reservaAsistidaPosterior) return { outcome: 'POSITIVO', senalObservada: 'RESERVO' };
      return { outcome: 'NEUTRO', senalObservada: 'SIN_RESPUESTA' };

    case 'RECUPERAR_PAGOS':
    case 'COBRAR_PENDIENTE':
      if (senal.recibosTotal > 0 && senal.recibosCobrados === senal.recibosTotal) {
        return { outcome: 'POSITIVO', senalObservada: 'PAGO' };
      }
      if (senal.recibosCobrados > 0) return { outcome: 'NEUTRO', senalObservada: 'PAGO' };
      return { outcome: 'NEGATIVO', senalObservada: 'SIN_RESPUESTA' };

    // Captación: convirtió (suscripción activa) → POSITIVO; solo vino a clase →
    // NEUTRO (interés pero sin cerrar); nada → NEGATIVO. Antes caía a `default` y
    // el outcome de toda captación quedaba perpetuamente NEUTRO (bucle roto).
    case 'CONTACTAR_LEAD':
    case 'CONVERTIR_PRUEBA':
      if (senal.suscripcionRenovada) return { outcome: 'POSITIVO', senalObservada: 'RENOVO' };
      if (senal.reservaAsistidaPosterior) return { outcome: 'NEUTRO', senalObservada: 'RESERVO' };
      return { outcome: 'NEGATIVO', senalObservada: 'SIN_RESPUESTA' };

    default:
      return { outcome: 'NEUTRO', senalObservada: null };
  }
}
