// ─────────────────────────────────────────────────────────────────────────────
// Prueba gratuita del estudio — 7 días, SIN TARJETA.
//
// Antes la prueba la daba Stripe (`trial_period_days` en el Checkout), así que
// para empezar había que pasar por la pasarela y dejar una tarjeta. Al abrir
// Tentare al público eso es la fricción más cara del embudo: se cambia por una
// prueba LOCAL que arranca al crear el estudio y no toca Stripe para nada.
//
// ⚠️ La prueba se materializa como `studios.subscription_status = 'trialing'`
// (+ `current_period_end` = fin de la prueba) A PROPÓSITO, en vez de inventar
// un estado nuevo. `suscripcionActiva()` ya trata 'trialing' como acceso
// válido, y de ahí cuelgan los ~18 sitios que llaman a `tieneFeature()` para
// decidir si un estudio puede usar el Centro de Control, las sustituciones
// autónomas o el multi-sede. Estrenar un estado paralelo obligaría a tocar los
// 18 —y a que cada query seleccionara una columna más— para que la prueba no
// se sintiera como un plan capado.
//
// Lo que SÍ es nuevo es `studios.trial_ends_at`: distingue "en prueba local,
// sin tarjeta" de "en prueba de Stripe, con tarjeta". Sin esa columna no se
// puede saber si un 'trialing' caduca solo o lo mantiene vivo Stripe.
//
// ⚠️ Y por eso la caducidad NO puede depender del reloj de un cron. Con Stripe
// era Stripe quien sacaba al estudio de 'trialing'; aquí no hay nadie detrás,
// así que un 'trialing' local sin vigilancia es acceso gratis para siempre.
// Mismo patrón que ya usan las reglas de reserva (Fase 2a/2c): la REGLA vive
// en la derivación —`estadoTrial()` compara contra el reloj cada vez que se
// pregunta, y `/api/billing/status` la aplica en cada petición— y el barrido de
// pg_cron solo pone la BD al día para el resto de consumidores. Si el cron se
// retrasa o no corre un tic, el gate sigue siendo correcto.
// ─────────────────────────────────────────────────────────────────────────────

/** Días de prueba gratuita al crear el estudio. Sin tarjeta. */
export const TRIAL_DIAS = 7;

const MS_DIA = 86_400_000;

/**
 * Fase de la prueba. No es solo cosmética: cada una tiene su propio tono en la
 * píldora del panel, y el salto de una a otra es lo que justifica cambiar el
 * mensaje sin convertirlo en una alarma permanente.
 *
 *  · PLENA      — acaba de empezar (7 días).
 *  · HOLGADA    — 6–4 días. Queda margen de sobra.
 *  · AVISO      — 3–2 días. Se empieza a mencionar el plan.
 *  · ULTIMO_DIA — 1 día.
 *  · EXPIRADA   — TUVO prueba y se le acabó, y no hay suscripción.
 *  · SIN_PRUEBA — nunca tuvo prueba local. NO es lo mismo que EXPIRADA, y
 *                 confundirlas tiene consecuencias: los estudios anteriores a
 *                 la apertura al público (7 de 12 en producción al hacer este
 *                 cambio) tienen `trial_ends_at` a NULL, y si cayeran en
 *                 EXPIRADA les saldría un aviso rojo de «prueba finalizada»
 *                 por una prueba que nunca existió.
 *  · SUSCRITO   — ya paga: no hay prueba que contar.
 */
export type FaseTrial = 'PLENA' | 'HOLGADA' | 'AVISO' | 'ULTIMO_DIA' | 'EXPIRADA' | 'SIN_PRUEBA' | 'SUSCRITO';

export interface EstadoTrial {
  /** ¿Está viviendo la prueba gratuita ahora mismo? */
  enPrueba: boolean;
  fase: FaseTrial;
  /** Días completos que quedan (0 si expiró). 7 el primer día. */
  diasRestantes: number;
  /** Fin de la prueba en ISO, o null si no hay prueba local. */
  finaliza: string | null;
  /** ¿Debe bloquearse el producto? Prueba agotada y sin suscripción que la releve. */
  agotada: boolean;
}

export interface EntradaTrial {
  /** `studios.trial_ends_at`. null = este estudio no tiene prueba local. */
  trialEndsAt?: string | Date | null;
  /** `studios.subscription_status`. Una suscripción real manda sobre la prueba. */
  subscriptionStatus?: string | null;
  /** `studios.subscription_id`. Su presencia distingue Stripe de prueba local. */
  subscriptionId?: string | null;
}

/**
 * Días completos que quedan hasta `fin`, redondeando hacia arriba: mientras
 * quede un minuto de prueba, quedan "1 día". Redondear hacia abajo diría "te
 * quedan 0 días" durante las últimas 24 horas, que es a la vez falso y el peor
 * momento posible para sonar a error.
 */
export function diasRestantesHasta(fin: Date, ahora: Date = new Date()): number {
  return Math.max(0, Math.ceil((fin.getTime() - ahora.getTime()) / MS_DIA));
}

/** Fecha de fin de una prueba que arranca en `inicio`. */
export function finDeTrial(inicio: Date = new Date()): Date {
  return new Date(inicio.getTime() + TRIAL_DIAS * MS_DIA);
}

function aFecha(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  // Una fecha inválida no es "ahora" ni "nunca": es un dato roto. Tratarla como
  // ausencia de prueba es lo único que no regala acceso ni lo quita por error.
  return Number.isNaN(d.getTime()) ? null : d;
}

function faseDe(dias: number): FaseTrial {
  if (dias <= 0) return 'EXPIRADA';
  if (dias === 1) return 'ULTIMO_DIA';
  if (dias <= 3) return 'AVISO';
  if (dias <= 6) return 'HOLGADA';
  return 'PLENA';
}

/**
 * Estado de la prueba de un estudio, derivado en el momento de preguntarlo.
 *
 * Una suscripción de pago viva (`active`/`past_due`, o cualquier 'trialing' que
 * venga con `subscription_id` de Stripe) gana siempre: ahí la prueba ya no
 * pinta nada aunque la columna siga puesta.
 */
export function estadoTrial(entrada: EntradaTrial, ahora: Date = new Date()): EstadoTrial {
  const fin = aFecha(entrada.trialEndsAt);
  const status = entrada.subscriptionStatus ?? null;

  // Convertida a plan de pago. `subscriptionId` es lo que separa "Stripe lleva
  // esta suscripción" de "es nuestra prueba local", porque el estado local
  // también se llama 'trialing'.
  const suscritoEnStripe =
    !!entrada.subscriptionId && (status === 'active' || status === 'past_due' || status === 'trialing');
  if (suscritoEnStripe || status === 'active' || status === 'past_due') {
    return { enPrueba: false, fase: 'SUSCRITO', diasRestantes: 0, finaliza: null, agotada: false };
  }

  // ⚠️ 'trialing' NUESTRO (sin `subscriptionId`) y SIN fecha de fin: un estado
  // incoherente que daba acceso completo para siempre.
  //
  // El razonamiento era circular. `accesoProducto` da por bueno 'trialing' y
  // delega en esta función la distinción entre la prueba de Stripe y la
  // nuestra; esta función, al no ver fecha, contestaba SIN_PRUEBA —«que decida
  // la suscripción»— y la suscripción era justo ese 'trialing'. Nadie cerraba:
  // `cerrar_pruebas_vencidas()` filtraba por `trial_ends_at is not null`, así
  // que tampoco lo veía. Visto en producción el 2026-09-05: un estudio con 35
  // días de plan CADENA sin pagar y sin nada que fuera a terminarlo nunca.
  //
  // Se trata como prueba agotada, que es lo único seguro: si de verdad tiene
  // derecho a acceso, alguien tiene que decirlo poniéndole una suscripción o
  // una fecha — no la AUSENCIA de un dato. La combinación ya no debería
  // existir (la repara la migr 20260905213839, que además endurece el
  // barrido); esto es la red por si vuelve.
  if (!fin && status === 'trialing') {
    return { enPrueba: false, fase: 'EXPIRADA', diasRestantes: 0, finaliza: null, agotada: true };
  }

  // Estudio SIN prueba local: los de antes de abrir al público. No es una
  // prueba agotada — es que nunca la hubo. Quien decide su acceso sigue siendo
  // la suscripción, como toda la vida.
  if (!fin) {
    return { enPrueba: false, fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null, agotada: false };
  }

  const dias = diasRestantesHasta(fin, ahora);
  const vigente = dias > 0;
  return {
    enPrueba: vigente,
    fase: faseDe(dias),
    diasRestantes: dias,
    finaliza: fin.toISOString(),
    agotada: !vigente,
  };
}

/** ¿Sigue viva la prueba local de este estudio? */
export function trialVigente(entrada: EntradaTrial, ahora: Date = new Date()): boolean {
  return estadoTrial(entrada, ahora).enPrueba;
}

/**
 * Copy de la píldora del panel. Vive aquí y no en el componente porque es la
 * misma frase que usan la píldora, su detalle y la pantalla de suscripción, y
 * porque así se puede probar sin montar React.
 */
export function mensajeTrial(estado: EstadoTrial): { titulo: string; detalle: string } {
  const d = estado.diasRestantes;
  const plural = d === 1 ? 'día' : 'días';
  switch (estado.fase) {
    case 'PLENA':
    case 'HOLGADA':
      return {
        titulo: `Prueba gratuita · ${d} ${plural}`,
        detalle: 'Tienes todo el plan abierto. No hemos pedido tarjeta y no se te cobrará nada.',
      };
    case 'AVISO':
      return {
        titulo: `Prueba gratuita · ${d} ${plural}`,
        detalle: 'Cuando quieras puedes elegir tu plan. Tu estudio y tus datos siguen donde están.',
      };
    case 'ULTIMO_DIA':
      return {
        titulo: 'Prueba gratuita · último día',
        detalle: 'Mañana termina la prueba. Elige tu plan para seguir sin interrupción.',
      };
    case 'EXPIRADA':
      return {
        titulo: 'Prueba finalizada',
        detalle: 'Tus datos están intactos. Elige un plan para volver a entrar en tu estudio.',
      };
    case 'SIN_PRUEBA':
      return { titulo: 'Sin prueba activa', detalle: 'Este estudio no tiene una prueba gratuita en curso.' };
    case 'SUSCRITO':
      return { titulo: 'Plan activo', detalle: 'Tu suscripción está al día.' };
  }
}
