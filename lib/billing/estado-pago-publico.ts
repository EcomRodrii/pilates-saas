// P1-3 (estados/confirmación real de reserva): lógica PURA del endpoint
// público `/api/public/estado-pago` y de su polling en el paso 'done' de
// /reservar/[slug]. Sin imports de servidor a propósito — la comparte el
// cliente (derivar el PaymentIntent del clientSecret, cadencia del polling)
// y la route (resolver el estado a partir de las filas que dejó el webhook).
//
// Contexto: en «pagar y reservar sin login» (Modo A) la RESERVA la crea el
// WEBHOOK después de confirmar el PaymentIntent (reservarPlazaTrasPagoPublico,
// best-effort). La pantalla 'done' antes solo podía decir «estamos
// confirmando» para siempre; con esto pregunta al servidor hasta tener la
// respuesta real.

export type EstadoPagoPublico =
  | 'en_proceso'
  | 'confirmada'
  | 'lista_espera'
  | 'pendiente_aprobacion'
  | 'fallida';

export interface RespuestaEstadoPago {
  estado: EstadoPagoPublico;
  clase?: { nombre: string; inicio: string };
}

// El cliente guarda el clientSecret (`pi_xxx_secret_yyy`); el id del
// PaymentIntent es la parte anterior a `_secret_`. Los ids de test llevan
// `pi_3Abc..._secret_...` — alfanumérico tras el prefijo, sin más guiones
// bajos antes del separador.
export function piDeClientSecret(clientSecret: string | null | undefined): string | null {
  if (!clientSecret) return null;
  const m = /^(pi_[A-Za-z0-9]+)_secret_/.exec(clientSecret);
  return m?.[1] ?? null;
}

// Guardia de identidad del endpoint: el email que teclea quien pregunta debe
// coincidir con el de la ficha que el webhook creó/reutilizó. Comparación
// insensible a mayúsculas y espacios (mismo criterio que el `ilike` con el
// que entregarPlanComprado busca la ficha). Dos vacíos NUNCA coinciden — un
// recibo cuya ficha quedara sin email no puede consultarse con `email=`.
export function emailsCoinciden(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  return na.length > 0 && na === nb;
}

// Traduce lo que hay en BD al estado público. `estadoReserva` es
// `reservas.estado` si la fila `res-web-…` existe; `avisoSinPlaza` es si el
// webhook dejó la notificación RESERVA_PAGADA_SIN_PLAZA al mostrador (la
// única traza consultable de «cobré pero no pude reservar» — best-effort,
// ver la route). Cualquier estado de reserva no contemplado (p. ej. una
// CANCELADA inmediata, que aquí no debería darse) responde 'en_proceso':
// mejor que el copy de «tardando» cubra un caso rarísimo que inventar una
// confirmación o un fallo que no consta.
export function resolverEstadoPago(
  estadoReserva: string | null | undefined,
  avisoSinPlaza: boolean,
): EstadoPagoPublico {
  if (estadoReserva === 'CONFIRMADA') return 'confirmada';
  if (estadoReserva === 'LISTA_ESPERA') return 'lista_espera';
  if (estadoReserva === 'PENDIENTE_APROBACION') return 'pendiente_aprobacion';
  if (!estadoReserva && avisoSinPlaza) return 'fallida';
  return 'en_proceso';
}

// Cadencia del polling del paso 'done': ~35s en total, más espaciado cuanto
// más tarda (el webhook de Stripe suele llegar en 1-5s; más allá de medio
// minuto ya no es «un momento» y se pasa al copy de «tardando»).
export const RETARDOS_POLL_MS = [1000, 2000, 3000, 5000, 8000, 8000, 8000];
