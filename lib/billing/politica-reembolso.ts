// ─────────────────────────────────────────────────────────────────────────────
// ¿Se puede devolver este recibo?
//
// Tentare sabía reaccionar a un reembolso hecho en Stripe (el webhook de
// `charge.refunded` marca el recibo DEVUELTO y ofrece revertir la entrega),
// pero no sabía HACERLO. Este módulo es la regla que decide si se puede, y vive
// aparte del endpoint por dos motivos:
//
//  1. Es la única parte de un reembolso que se puede probar sin mover dinero.
//     Los e2e de este repo mockean la red con `page.route`, así que ninguna
//     prueba ve nunca un cobro ni un 4xx de Stripe — punto ciego documentado.
//     Si la regla viviera dentro del handler, no la comprobaría nadie.
//  2. La misma función la usan el servidor (que decide) y la pantalla (que
//     enseña u oculta el botón). Escrita dos veces, el día que cambie una la
//     otra miente: el botón invita a devolver algo que el servidor rechaza.
//
// ⚠️ Que esta función diga `permitido: true` NO autoriza a nadie: el rol se
// comprueba aparte, con `puedeMoverDinero()`, en el servidor. Esto responde
// "¿este recibo es reembolsable?", no "¿tú puedes?".
// ─────────────────────────────────────────────────────────────────────────────

export interface PoliticaReembolso {
  /** Apagada por defecto: un botón que mueve dinero real no aparece solo. */
  activos: boolean;
  /** Días desde el cobro. 0 = sin límite. */
  plazoDias: number;
  /** No devolver un bono con sesiones ya gastadas. */
  soloSinUsar: boolean;
}

export interface ReciboParaReembolso {
  estado: string;
  importe: number;
  /** ISO. Null en un recibo que nunca llegó a cobrarse. */
  fechaCobro: string | null;
  /**
   * Sesiones que tenía el bono JUSTO después de entregarlo
   * (`recibos.entrega_sesiones_despues`). Null = no es un bono de sesiones
   * (un mensual, una cita) o es un recibo anterior al snapshot de entrega.
   */
  sesionesAlEntregar: number | null;
  /** Las que le quedan HOY a la suscripción de ese recibo. Null = no aplica. */
  sesionesRestantesHoy: number | null;
}

export type MotivoNoReembolsable =
  | 'DESACTIVADA'
  | 'NO_COBRADO'
  | 'YA_DEVUELTO'
  | 'SIN_FECHA_COBRO'
  | 'FUERA_DE_PLAZO'
  | 'BONO_YA_USADO'
  | 'SIN_IMPORTE';

export interface Veredicto {
  permitido: boolean;
  motivo?: MotivoNoReembolsable;
  /** Para enseñar tal cual: explica por qué no, no un código. */
  mensaje?: string;
}

const PERMITIDO: Veredicto = { permitido: true };

function no(motivo: MotivoNoReembolsable, mensaje: string): Veredicto {
  return { permitido: false, motivo, mensaje };
}

/**
 * Sesiones consumidas desde que se entregó el bono.
 *
 * Se mide contra `entrega_sesiones_despues` (lo que tenía justo al entregarlo),
 * NO contra las sesiones del plan de catálogo: el plan puede haber cambiado de
 * tamaño después, y una socia con varios bonos acumula sesiones de todos. El
 * snapshot de la entrega es el único número que se refiere a ESTE recibo.
 *
 * Null cuando falta cualquiera de los dos datos: ahí no se puede afirmar que
 * esté usado, y la regla `soloSinUsar` no debe bloquear por una suposición.
 */
export function sesionesConsumidas(r: ReciboParaReembolso): number | null {
  if (r.sesionesAlEntregar == null || r.sesionesRestantesHoy == null) return null;
  const gastadas = r.sesionesAlEntregar - r.sesionesRestantesHoy;
  // Negativo = le añadieron sesiones después (otro bono, un ajuste a mano).
  // Eso no es "consumo", es ruido: se trata como 0.
  return gastadas > 0 ? gastadas : 0;
}

/** Días completos entre el cobro y `ahora`. */
export function diasDesdeCobro(fechaCobroISO: string, ahora: Date): number {
  const cobro = new Date(fechaCobroISO).getTime();
  const MS_DIA = 24 * 60 * 60 * 1000;
  return Math.floor((ahora.getTime() - cobro) / MS_DIA);
}

export function evaluarReembolso(
  politica: PoliticaReembolso,
  recibo: ReciboParaReembolso,
  ahora: Date,
): Veredicto {
  if (!politica.activos) {
    return no('DESACTIVADA',
      'Las devoluciones desde Tentare están desactivadas. Puedes activarlas en Configuración → Estudio → Cobros, o devolver desde Stripe.');
  }

  // DEVUELTO antes que el resto: es el caso que más se intenta dos veces (dos
  // personas en mostrador, o un clic repetido), y merece decir qué pasó en vez
  // del genérico "no está cobrado".
  if (recibo.estado === 'DEVUELTO') {
    return no('YA_DEVUELTO', 'Este recibo ya está devuelto.');
  }
  if (recibo.estado !== 'COBRADO') {
    return no('NO_COBRADO',
      'Solo se puede devolver un recibo que esté cobrado. Si está pendiente, lo que quieres es anularlo, no devolverlo.');
  }
  if (recibo.importe <= 0) {
    return no('SIN_IMPORTE', 'Este recibo no tiene importe que devolver.');
  }

  if (!recibo.fechaCobro) {
    // Un COBRADO sin fecha es un dato incoherente, no un caso de negocio: no se
    // puede medir el plazo, así que no se decide por él.
    return no('SIN_FECHA_COBRO',
      'Este recibo consta cobrado pero sin fecha de cobro, así que no se puede comprobar el plazo. Devuélvelo desde Stripe.');
  }

  if (politica.plazoDias > 0) {
    const dias = diasDesdeCobro(recibo.fechaCobro, ahora);
    if (dias > politica.plazoDias) {
      return no('FUERA_DE_PLAZO',
        `Se cobró hace ${dias} días y el plazo de devolución del estudio es de ${politica.plazoDias}.`);
    }
  }

  if (politica.soloSinUsar) {
    const gastadas = sesionesConsumidas(recibo);
    if (gastadas != null && gastadas > 0) {
      return no('BONO_YA_USADO',
        `Ya ha usado ${gastadas} ${gastadas === 1 ? 'sesión' : 'sesiones'} de este bono. El estudio solo devuelve bonos sin empezar.`);
    }
  }

  return PERMITIDO;
}
