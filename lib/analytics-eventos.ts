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
  | { nombre: 'pago_completado'; props: { importe_centimos: number; via: 'checkout' | 'off_session' | 'terminal' | 'sepa' | 'bizum' } }
  // El estado de la suscripción del estudio al SaaS cambió (alta/renovación/impago/baja).
  | { nombre: 'suscripcion_cambiada'; props: { plan: string | null; estado: string } }
  // Un pack de consultas del asistente pagado y acreditado (100/300/1000).
  | { nombre: 'ia_pack_comprado'; props: { unidades: number } }
  // Una reserva quedó CONFIRMADA (nunca lista de espera/pendiente). Señal de
  // conversión del embudo de reserva — sin socioId ni sesionId: eso ya
  // identificaría a una socia/clase concreta, y el distinct_id es el tenant.
  | { nombre: 'reserva_completada'; props: { con_spot_elegido: boolean } }
  // Review Boost — feedback interno al terminar el trial + invitación a
  // reseñar (Capterra/GetApp) + recompensa DESACOPLADA del clic externo (ver
  // tentare-os.md, cumplimiento Capterra/GetApp/Software Advice).
  | { nombre: 'review_boost_eligible'; props: Record<string, never> }
  | { nombre: 'review_boost_shown'; props: Record<string, never> }
  | { nombre: 'review_boost_feedback_submitted'; props: { rating: number } }
  | { nombre: 'review_boost_positive_feedback'; props: { rating: number } }
  | { nombre: 'review_boost_negative_feedback'; props: { rating: number } }
  | { nombre: 'review_boost_platform_clicked'; props: { plataforma: 'capterra' | 'getapp' } }
  | { nombre: 'review_boost_reward_offered'; props: Record<string, never> }
  | { nombre: 'review_boost_reward_claimed'; props: Record<string, never> }
  | { nombre: 'review_boost_converted_to_paid'; props: Record<string, never> }
  // ── Embudo de activación ───────────────────────────────────────────────────
  //
  // Antes NO había ni un solo evento del onboarding: los 12 de arriba son de
  // pagos y de Review Boost, así que la pregunta «¿dónde abandonan?» solo se
  // podía contestar contando filas en la base de datos a mano. Estos tres
  // cierran el embudo con `reserva_completada`, que ya existía y es el final:
  //
  //   asistente terminado → horario creado → primera reserva
  //
  // No se añade un evento por cada paso del asistente a propósito: el progreso
  // ya se recupera de `borrador-wizard` y lo que importa medir es dónde se cae
  // del EMBUDO, no cuántas veces tocó un botón.
  | {
      nombre: 'onboarding_completado';
      // Qué le quedó montado. Sin esto no se puede distinguir a quien contestó
      // todo de quien pasó de pantalla en pantalla sin elegir nada.
      props: { salas: number; tipos_clase: number; planes: number; instructora: boolean; horario: boolean; origen?: 'asistente' | 'calendario' };
    }
  // El paso donde se pierde más de la mitad de los estudios (4 de 10 lo
  // superan). `origen` distingue el horario propuesto por Tentare del que la
  // propietaria importa de un Excel: son dos caminos con conversiones muy
  // distintas y mezclarlos oculta cuál funciona.
  | { nombre: 'horario_creado'; props: { origen: 'onboarding' | 'importacion' | 'imagen'; sesiones: number } }
  // Vio la propuesta y dijo que no. Es la señal de que el horario propuesto no
  // le encajaba — y sin ella, «no lo creó» y «ni lo vio» se confunden.
  | { nombre: 'horario_propuesto_descartado'; props: Record<string, never> }
  // ── Hitos de activación que ocurren en el SERVIDOR ─────────────────────────
  // Los que se ven en el panel los emite el navegador (lib/analytics-navegador.ts,
  // mismo nombre). Estos cubren lo que el panel no llega a ver: el asistente
  // crea los tipos de clase en el servidor sin recargar el contexto.
  //
  // El primer tipo de clase del estudio. Solo cuando antes no había ninguno.
  | { nombre: 'primer_tipo_clase'; props: { origen: 'asistente' | 'panel' } }
  // La cuenta de cobro (Stripe Connect) quedó conectada.
  | { nombre: 'stripe_conectado'; props: Record<string, never> };

type PropsDe<N extends EventoAnalitica['nombre']> = Extract<EventoAnalitica, { nombre: N }>['props'];

/**
 * Las props que puede llevar cada evento, en ejecución. El tipo ya cierra la
 * puerta, pero un `as` la abre: `construirEvento` tira todo lo que no esté
 * aquí. tsc exige una entrada por evento, así que uno nuevo no compila hasta
 * decir qué lleva.
 */
export const PROPS_PERMITIDAS = {
  pago_completado: ['importe_centimos', 'via'],
  suscripcion_cambiada: ['plan', 'estado'],
  ia_pack_comprado: ['unidades'],
  reserva_completada: ['con_spot_elegido'],
  review_boost_eligible: [],
  review_boost_shown: [],
  review_boost_feedback_submitted: ['rating'],
  review_boost_positive_feedback: ['rating'],
  review_boost_negative_feedback: ['rating'],
  review_boost_platform_clicked: ['plataforma'],
  review_boost_reward_offered: [],
  review_boost_reward_claimed: [],
  review_boost_converted_to_paid: [],
  onboarding_completado: ['salas', 'tipos_clase', 'planes', 'instructora', 'horario', 'origen'],
  horario_creado: ['origen', 'sesiones'],
  horario_propuesto_descartado: [],
  primer_tipo_clase: ['origen'],
  stripe_conectado: [],
} as const satisfies { readonly [N in EventoAnalitica['nombre']]: readonly (keyof PropsDe<N>)[] };

// Y que no FALTE ninguna: una prop nueva en el tipo que no se añade aquí se tiraría
// en silencio en `construirEvento`. Si esto no compila, añádela arriba.
// (Un evento sin props es `Record<string, never>`, cuyo `keyof` es `string`: no tiene nada que olvidar.)
type PropsOlvidadas = {
  [N in EventoAnalitica['nombre']]: string extends keyof PropsDe<N>
    ? never
    : Exclude<keyof PropsDe<N>, (typeof PROPS_PERMITIDAS)[N][number]>
}[EventoAnalitica['nombre']];
export const _sinPropsOlvidadas: [PropsOlvidadas] extends [never] ? true : PropsOlvidadas = true;

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
  const permitidas: readonly string[] = PROPS_PERMITIDAS[evento.nombre];
  const props = Object.fromEntries(
    Object.entries(evento.props as Record<string, unknown>).filter(([clave]) => permitidas.includes(clave)),
  );
  return {
    event: evento.nombre,
    distinct_id: studioId, // tenant, nunca una persona natural
    // `studio_id` también como propiedad: los eventos del navegador (identificados
    // por persona) llevan la misma, y es lo que permite cruzar los dos en PostHog
    // sin depender de Group Analytics.
    properties: { ...props, studio_id: studioId, $lib: 'tentare-server' },
    ...(timestampISO ? { timestamp: timestampISO } : {}),
  };
}
