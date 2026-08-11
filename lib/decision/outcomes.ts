// Reglas de medición diferida (DECISION-OS-ARQUITECTURA.md §6 F4,
// DECISION-OS-NUCLEO.md §11). Puro: recibe señales ya resueltas por el
// caller (Fase B consulta el snapshot en T+ventanaDias) y decide el
// resultado — nunca llama a Date.now() ni toca red o DB.
import type { EventoOutcome, ResultadoOutcome, SenalObservada, TipoRecomendacion, Impacto, ConfianzaMedicion } from './tipos.ts';

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
    // LLENAR_PLAZAS solo se puede medir cuando la clase YA se ha dado. A4 nunca
    // apunta a más de 14 días vista (A4_DIAS_MAX), así que 16 deja siempre un
    // par de días de margen por detrás de la clase, incluso si la propietaria
    // aprueba la recomendación el mismo día en que se generó.
    case 'LLENAR_PLAZAS':
      return 16;
    default:
      return 14; // contacto / reactivación / congelación / marketing
  }
}

export interface SenalMedicion {
  reservaAsistidaPosterior: boolean;
  suscripcionCancelada: boolean;
  suscripcionRenovada: boolean;
  // ── Señales de SESIÓN (LLENAR_PLAZAS) ────────────────────────────────────
  // Todo lo demás en esta interfaz es de SOCIA. A4 es la primera recomendación
  // del motor cuyo desenlace no depende de una persona sino de una clase, y la
  // primera cuyo pronóstico se puede contrastar con lo que acabó pasando.
  // `null` = la sesión ya no existe, no tiene aforo, o todavía no se ha dado.
  plazasLibresFinales: number | null;
  /** Plazas que se vendieron DESPUÉS de que la propietaria gestionara el aviso. */
  plazasVendidasTrasLaAccion: number;
  recibosCobrados: number;
  recibosTotal: number;
  // € realmente cobrados en los recibos que la propia recomendación señaló
  // (RECUPERAR_PAGOS/COBRAR_PENDIENTE). 0 es un cero real (se comprobó y no
  // entró nada), no "sin dato" — por eso siempre se marca MEDIDO para estos
  // dos tipos, aunque el importe sea 0.
  importeCobradoEur: number;
  // Precio del plan de la suscripción renovada, cuando `suscripcionRenovada`
  // es true y se pudo resolver el plan. null si no aplica o no se encontró.
  precioMensualPlanEur: number | null;
}

export interface ResultadoMedicion {
  outcome: ResultadoOutcome;
  senalObservada: SenalObservada | null;
  // Pilar 3 de "Tentare 2030" (medir resultado, no solo actividad, migr
  // 20260806213813): cifra real cuando hay una señal financiera limpia que
  // atribuirle; null si no la hay (ver `confianzaMedicion`).
  impactoReal: Impacto | null;
  confianzaMedicion: ConfianzaMedicion;
}

/**
 * Resultado cuantificado real, cuando existe una señal financiera limpia sin
 * inventar precisión:
 * - RECUPERAR_PAGOS/COBRAR_PENDIENTE: el € efectivamente cobrado siempre es un
 *   hecho verificable (incluido 0€ si no se cobró nada) → siempre MEDIDO.
 * - El resto de tipos: solo cuando la señal observada es RENOVO (suscripción
 *   renovada) y se resolvió el precio del plan — es dinero que la socia ya
 *   está pagando, no una proyección. NEUTRO (volvió a clase, no renovó) y
 *   NEGATIVO (canceló/no respondió) quedan NO_MEDIBLE a propósito: poner un €
 *   ahí sería un contrafactual especulativo ("lo que se habría ganado"), justo
 *   lo que el Pilar 3 pide evitar.
 */
function calcularImpactoReal(
  tipo: TipoRecomendacion,
  senal: SenalMedicion,
  senalObservada: SenalObservada | null,
): { impactoReal: Impacto | null; confianzaMedicion: ConfianzaMedicion } {
  if (tipo === 'RECUPERAR_PAGOS' || tipo === 'COBRAR_PENDIENTE') {
    return {
      impactoReal: {
        valor: senal.importeCobradoEur, unidad: 'EUR',
        formula: 'Suma de los recibos cobrados que la recomendación señaló',
      },
      confianzaMedicion: 'MEDIDO',
    };
  }
  if (senalObservada === 'RENOVO' && senal.precioMensualPlanEur !== null) {
    return {
      impactoReal: {
        valor: senal.precioMensualPlanEur, unidad: 'EUR_MES',
        formula: 'Precio del plan de la suscripción renovada',
      },
      confianzaMedicion: 'MEDIDO',
    };
  }
  return { impactoReal: null, confianzaMedicion: 'NO_MEDIBLE' };
}

/**
 * Traduce la señal observada en T+ventanaDias a un resultado. Cancelar
 * siempre pesa como negativo, incluso si hubo alguna reserva puntual antes —
 * el desenlace de negocio es lo que cuenta, no un falso positivo a mitad de camino.
 */
export function medirOutcome(tipo: TipoRecomendacion, senal: SenalMedicion): ResultadoMedicion {
  const { outcome, senalObservada } = medirOutcomeCualitativo(tipo, senal);
  return { outcome, senalObservada, ...calcularImpactoReal(tipo, senal, senalObservada) };
}

function medirOutcomeCualitativo(
  tipo: TipoRecomendacion, senal: SenalMedicion,
): { outcome: ResultadoOutcome; senalObservada: SenalObservada | null } {
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

    // Renovación de bono: renovó (nueva suscripción) → POSITIVO; si no, NEGATIVO.
    case 'PROPONER_RENOVACION_BONO':
      if (senal.suscripcionRenovada) return { outcome: 'POSITIVO', senalObservada: 'RENOVO' };
      if (senal.reservaAsistidaPosterior) return { outcome: 'NEUTRO', senalObservada: 'RESERVO' };
      return { outcome: 'NEGATIVO', senalObservada: 'SIN_RESPUESTA' };

    // LLENAR_PLAZAS: el desenlace es la clase, no una socia. Se llenó del todo
    // → POSITIVO; entró gente pero sobraron plazas → NEUTRO; no entró nadie →
    // NEGATIVO. Si la sesión ya no existe (se canceló, se borró) no hay nada
    // que juzgar y se queda NEUTRO sin señal.
    //
    // ⚠️ Esto mide QUE PASÓ, no que la recomendación fuera la causa: si la
    // clase se llenó sola no hay forma de distinguirlo desde aquí, y el
    // impacto en € se deja NO_MEDIBLE a propósito (calcularImpactoReal) en vez
    // de multiplicar plazas por un precio medio, que sería una proyección.
    case 'LLENAR_PLAZAS':
      if (senal.plazasLibresFinales === null) return { outcome: 'NEUTRO', senalObservada: null };
      if (senal.plazasLibresFinales === 0) return { outcome: 'POSITIVO', senalObservada: 'RESERVO' };
      if (senal.plazasVendidasTrasLaAccion > 0) return { outcome: 'NEUTRO', senalObservada: 'RESERVO' };
      return { outcome: 'NEGATIVO', senalObservada: 'SIN_RESPUESTA' };

    default:
      return { outcome: 'NEUTRO', senalObservada: null };
  }
}
