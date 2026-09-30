// La salud de un cliente de pago, en una línea: ¿lo usa, entra la dueña, le
// falla algo? Puro (sin `@/`) para probarlo con node --test.
//
// Nace de una pregunta real del fundador (30-sep): «un estudio ha pagado y no sé
// cuál es, qué hace ni en qué está bloqueado». Contestarla exigía cruzar a mano
// la base y Sentry. Cada aviso es algo sobre lo que se puede ACTUAR (llamarla,
// mirarle un cobro), no una métrica de adorno.

export type NivelSalud = 'bien' | 'atencion' | 'riesgo';

export interface SenalesEstudio {
  /** `studios.subscription_status` tal cual. */
  estadoSuscripcion: string | null;
  /** Último inicio de sesión de la dueña (auth). `null` = nunca o sin dueña. */
  ultimoAccesoDuena: string | null;
  // ⚠️ `null` = la consulta falló, NO cero. Leerlo como 0 inventaría una
  // alarma («ninguna reserva») sobre un estudio que va bien.
  /** Reservas creadas en los últimos 7 días. */
  reservas7d: number | null;
  /** Clases no canceladas en los próximos 7 días. */
  clasesProximas7d: number | null;
  /** Cobros a sus alumnas que acabaron FALLIDO en los últimos 30 días. */
  cobrosFallidos30d: number | null;
}

export interface Salud {
  nivel: NivelSalud;
  avisos: string[];
  /** Días desde el último acceso de la dueña; `null` si no hay dato. */
  diasSinEntrar: number | null;
}

/** Lo que viaja a la pantalla: el veredicto, lo que lo sostiene y dónde mirar sus errores. */
export interface SaludEstudio extends Salud {
  senales: SenalesEstudio;
  /** Sus errores en Sentry (etiqueta `studio_id`), o `null` sin org configurada. */
  sentryUrl: string | null;
}

const IMPAGO = new Set(['past_due', 'unpaid', 'incomplete']);

export function evaluarSalud(s: SenalesEstudio, ahora: Date = new Date()): Salud {
  const avisos: string[] = [];
  let riesgo = false;

  if (s.estadoSuscripcion && IMPAGO.has(s.estadoSuscripcion)) {
    avisos.push('Su pago a Tentare ha fallado');
    riesgo = true;
  }

  const diasSinEntrar = s.ultimoAccesoDuena
    ? Math.floor((ahora.getTime() - new Date(s.ultimoAccesoDuena).getTime()) / 86_400_000)
    : null;
  if (diasSinEntrar === null) {
    avisos.push('La dueña no ha entrado nunca');
    riesgo = true;
  } else if (diasSinEntrar >= 7) {
    avisos.push(`La dueña no entra desde hace ${diasSinEntrar} días`);
    if (diasSinEntrar >= 14) riesgo = true;
  }

  if (s.clasesProximas7d === 0) avisos.push('Sin clases en los próximos 7 días');
  if (s.reservas7d === 0) avisos.push('Ninguna reserva en los últimos 7 días');
  if (s.cobrosFallidos30d !== null && s.cobrosFallidos30d > 0) {
    avisos.push(`${s.cobrosFallidos30d} ${s.cobrosFallidos30d === 1 ? 'cobro fallido' : 'cobros fallidos'} a sus alumnas (30 días)`);
  }

  if (s.reservas7d === null || s.clasesProximas7d === null || s.cobrosFallidos30d === null) {
    avisos.push('No se han podido leer todos los datos: revisa la ficha');
  }

  return { nivel: riesgo ? 'riesgo' : avisos.length ? 'atencion' : 'bien', avisos, diasSinEntrar };
}

/** Un estudio es «de pago» si tiene una suscripción de Stripe: ni la prueba local ni el acceso dado a mano cuentan. */
export function esDePago(subscriptionId: string | null | undefined): boolean {
  return Boolean(subscriptionId);
}

/** Enlace a sus errores en Sentry (etiqueta `studio_id`). `null` sin organización configurada. */
export function urlErroresSentry(org: string | undefined, studioId: string): string | null {
  if (!org) return null;
  return `https://${org}.sentry.io/issues/?query=${encodeURIComponent(`studio_id:${studioId}`)}&statsPeriod=14d`;
}
