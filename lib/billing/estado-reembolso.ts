// ─────────────────────────────────────────────────────────────────────────────
// Qué se le enseña a la propietaria sobre una devolución.
//
// Al pulsar "Devolver" no pasaba nada visible: la fila seguía diciendo
// "Cobrado" hasta que llegaba el webhook. No se sabía si estaba en curso, si se
// había quedado colgado, ni —una vez devuelto— si la socia ya tenía el dinero.
//
// Aquí se decide, y son cuatro situaciones distintas que antes eran una sola:
//
//   EN_CAMINO  → se pidió hace nada. Normal, tarda segundos.
//   ATASCADA   → se pidió hace rato y Stripe no ha confirmado. Hay que mirarlo.
//   DEVUELTA   → confirmado. Pero el dinero AÚN NO está en el banco de la socia.
//   (null)     → esta fila no tiene nada que contar sobre devoluciones.
//
// Lo de DEVUELTA importa más de lo que parece: "Devuelto" a secas hace pensar
// que la socia ya lo tiene, y luego escribe preguntando dónde está su dinero.
// Un reembolso de tarjeta tarda entre 5 y 10 días hábiles en aparecer en su
// extracto, y eso no lo controla ni Tentare ni el estudio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A partir de aquí, una devolución que Stripe no ha confirmado deja de ser
 * "normal, espera" y pasa a "míralo".
 *
 * El webhook suele llegar en menos de un segundo (medido en producción:
 * evento a las 01:09:35.743, entrega a las 01:09:35.793). 5 minutos es
 * holgadísimo a propósito: esto no debe gritar por un pico de latencia, solo
 * cuando algo va de verdad mal.
 */
export const MINUTOS_HASTA_SOSPECHAR = 5;

export type FaseReembolso = 'EN_CAMINO' | 'ATASCADA' | 'DEVUELTA';

export interface EstadoReembolso {
  fase: FaseReembolso;
  /** Para la etiqueta de la fila. */
  etiqueta: string;
  /** La frase que explica qué está pasando. Se enseña tal cual. */
  detalle: string;
}

export interface ReciboConDevolucion {
  estado: string;
  /** Cuándo se le pidió a Stripe. Null = nunca se pidió desde Tentare. */
  reembolsoSolicitadoEn?: string | null;
  /** Cuándo lo confirmó Stripe (lo escribe el webhook). */
  fechaDevolucion?: string | null;
}

export function estadoReembolso(
  r: ReciboConDevolucion,
  ahora: Date,
): EstadoReembolso | null {
  if (r.estado === 'DEVUELTO') {
    return {
      fase: 'DEVUELTA',
      etiqueta: 'Devuelto',
      // Se dice SIEMPRE, también en las devoluciones hechas desde Stripe (sin
      // `reembolsoSolicitadoEn`): la pregunta de la socia es la misma.
      detalle: 'El dinero tarda entre 5 y 10 días hábiles en aparecer en el banco de la clienta. Eso lo marca su banco, no el estudio.',
    };
  }

  // Pedida pero sin confirmar. Es el hueco que no se veía.
  if (!r.reembolsoSolicitadoEn) return null;

  const minutos = Math.floor(
    (ahora.getTime() - new Date(r.reembolsoSolicitadoEn).getTime()) / 60000,
  );

  if (minutos >= MINUTOS_HASTA_SOSPECHAR) {
    return {
      fase: 'ATASCADA',
      etiqueta: 'Sin confirmar',
      detalle: `La devolución se envió hace ${textoEspera(minutos)} y Stripe todavía no la ha confirmado. `
        + 'El dinero puede haber salido igualmente: compruébalo en Stripe antes de volver a intentarlo.',
    };
  }

  return {
    fase: 'EN_CAMINO',
    etiqueta: 'Devolviendo…',
    detalle: 'Enviada a Stripe. En unos segundos debería quedar marcada como devuelta.',
  };
}

/** "7 minutos", "3 horas", "2 días" — sin librería de fechas, que aquí no hay. */
export function textoEspera(minutos: number): string {
  if (minutos < 60) return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? 'día' : 'días'}`;
}
