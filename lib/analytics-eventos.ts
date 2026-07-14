// ─────────────────────────────────────────────────────────────────────────────
// R4 · Taxonomía de analítica de producto — LÓGICA PURA (sin next/server, sin
// red; testeable con `node --test`). El envío real vive en lib/analytics.ts.
//
// PRIVACIDAD (GDPR — la app maneja datos de salud): el `distinct_id` es SIEMPRE
// el `studioId` (un TENANT, no una persona natural). Las `properties` solo
// llevan datos de NEGOCIO agregados: importes, vía de cobro, plan, estado. NUNCA
// nombre, email, teléfono, NIF ni ningún dato de una socia. El tipado del union
// `EventoAnalitica` es la primera barrera: no hay forma de pasar PII sin cambiar
// el tipo. Ver también la nota de residencia/consentimiento en lib/analytics.ts.
//
// Esta capa es el SUSTRATO del "flywheel" de datos (visión Fases 5-6): eventos
// consistentes y estables en el tiempo. Cambiar nombres de evento rompe el
// histórico — trátalos como un contrato.
// ─────────────────────────────────────────────────────────────────────────────

export type EventoAnalitica =
  // Un cobro a una socia se completó. La señal de GMV del negocio.
  | { nombre: 'pago_completado'; props: { importe_centimos: number; via: 'checkout' | 'off_session' | 'terminal' } }
  // El estado de la suscripción del estudio al SaaS cambió (alta/renovación/impago/baja).
  | { nombre: 'suscripcion_cambiada'; props: { plan: string | null; estado: string } };

/** ¿Está configurada la analítica? (POSTHOG_KEY presente). */
export function analyticsHabilitado(): boolean {
  return Boolean(process.env.POSTHOG_KEY);
}

/**
 * Construye el cuerpo del evento para la API de captura de PostHog (sin api_key,
 * que lo añade el emisor). Puro y testeable: aquí se fija el contrato PII-safe.
 */
export function construirEvento(
  studioId: string,
  evento: EventoAnalitica,
  timestampISO?: string,
): { event: string; distinct_id: string; properties: Record<string, unknown>; timestamp?: string } {
  return {
    event: evento.nombre,
    distinct_id: studioId, // tenant, nunca una persona natural
    properties: { ...evento.props, $lib: 'tentare-server' },
    ...(timestampISO ? { timestamp: timestampISO } : {}),
  };
}
