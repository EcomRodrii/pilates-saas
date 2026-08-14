// Fase 2 de la propuesta "Growth Widget" (auditoría del widget de reservas):
// eventos anónimos del funnel del widget público. Sin esto no existía ninguna
// forma de saber si un cambio del widget convierte mejor o peor — confirmado
// por auditoría que no había NADA (ni GA/PostHog/Sentry-para-eventos/tabla
// propia) antes de este módulo.
export const TIPOS_EVENTO_WIDGET = [
  'widget_loaded', 'widget_viewed', 'class_list_viewed', 'class_selected',
  'class_detail_viewed', 'recommendation_started', 'recommendation_completed',
  'booking_started', 'checkout_started', 'booking_completed',
  'lead_started', 'lead_completed', 'booking_abandoned',
] as const;

export type TipoEventoWidget = typeof TIPOS_EVENTO_WIDGET[number];

export function esTipoEventoValido(tipo: string): tipo is TipoEventoWidget {
  return (TIPOS_EVENTO_WIDGET as readonly string[]).includes(tipo);
}

const CLAVE_SESSION_ID = 'tentare_widget_session';

/**
 * Un id por pestaña/visita — sessionStorage, se pierde al cerrarla. Nunca se
 * cruza con `socios`: es anónimo por diseño, no un identificador de persona.
 */
export function sessionIdWidget(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.sessionStorage.getItem(CLAVE_SESSION_ID);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(CLAVE_SESSION_ID, id);
    }
    return id;
  } catch {
    // Safari en modo privado (o cookies/storage bloqueados) puede lanzar al
    // tocar sessionStorage — un id nuevo cada vez no rompe nada, solo hace
    // que esa visitante cuente como varias "sesiones" en el funnel.
    return crypto.randomUUID();
  }
}

/**
 * Dispara un evento del funnel. Fire-and-forget a propósito: la analítica
 * NUNCA debe bloquear ni poder tumbar el flujo real de reserva/pago.
 * `keepalive` deja que la petición termine aunque la visitante navegue justo
 * después de disparar el evento (p. ej. al ir a Stripe Checkout).
 */
export function trackEventoWidget(
  studioId: string | null | undefined,
  tipo: TipoEventoWidget,
  extra?: { sesionClaseId?: string | null; origen?: string | null },
): void {
  if (typeof window === 'undefined' || !studioId) return;
  try {
    void fetch('/api/public/evento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        studioId,
        tipo,
        sessionId: sessionIdWidget(),
        sesionClaseId: extra?.sesionClaseId ?? null,
        origen: extra?.origen ?? null,
      }),
    }).catch(() => {});
  } catch {
    // Nunca debe romper el render de la página que lo dispara.
  }
}
