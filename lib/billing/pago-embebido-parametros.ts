import type Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────────────────
// Los parámetros con los que `/api/public/checkout-embebido` crea el
// PaymentIntent de una compra. Fuera de la ruta y puros A PROPÓSITO.
//
// ⚠️ Stripe solo devuelve el MISMO PaymentIntent a dos peticiones con la misma
// Idempotency-Key si los parámetros son IDÉNTICOS; si cambia cualquiera, contesta
// `idempotency_error`. Con clase concreta la clave no lleva tiempo
// (`claveCheckoutEmbebido`), así que cualquier dato que dependa del reloj rompe
// el segundo intento del mismo pago. Pasó (hasta el 5-oct-2026): el sello de las
// condiciones metía `terminosAceptadosEn = new Date()` en la metadata, y reabrir
// la hoja de pago de la misma clase daba un 500 durante 24 h (y soltaba la plaza
// de cupo que seguía reteniendo el primer cobro). El momento de aceptarlas ya no
// viaja: es `pi.created`, y lo pone el webhook (`selloDelCobro`).
//
// Aquí no entra ninguna fuente de tiempo ni de azar: lo fija un test que construye
// los parámetros dos veces con el reloj adelantado y exige que salgan iguales.
// Sin alias `@/`, para que `node --test` lo cargue.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosCompraEmbebida {
  studioId: string;
  planId: string;
  /** El concepto del cobro (`description`). */
  planNombre: string;
  /** Huella de las condiciones vigentes (`sellarCondicionesVigentes`); `null` = sin sello. */
  terminosHash: string | null;
  /** Esta compra se llevó una plaza de matrícula gratis (el webhook la devuelve si nadie paga). */
  cupoMatriculaReservado: boolean;
  plazaEtapaId: string | null;
  /** Ya derivado del JWT en la ruta, nunca del body. */
  socioId: string | null;
  socioEmail: string | null;
  socioNombre: string | null;
  /** Ya saneado en la ruta. */
  socioTelefono: string | null;
  origenLead: string | null;
  sesionId: string | null;
  /** Ya validada en la ruta (`sesionWidgetValida`). */
  widgetSesion: string | null;
  spotId: string | null;
  codigoDescuentoId: string | null;
  matriculaCentimos: number;
  genero: string | null;
  comoConociste: string | null;
  codigoPostal: string | null;
  fechaNacimiento: string | null;
  /** Total del cargo, matrícula incluida. */
  amountCentimos: number;
  usoFuturo: 'off_session' | undefined;
  customerId: string | null;
  /** Take-rate de la plataforma (`applicationFeeAmount`). */
  fee: number | undefined;
}

/** La metadata del cobro. Stripe exige valores string no vacíos: lo que no hay, no va. */
export function metadataCompraEmbebida(d: DatosCompraEmbebida): Record<string, string> {
  const metadata: Record<string, string> = {
    studioId: d.studioId,
    planId: d.planId,
    origen: 'plan_web_embebido',
  };
  // Qué condiciones estaban vigentes. CUÁNDO se aceptaron no va aquí: ver la cabecera.
  if (d.terminosHash) metadata.terminosHash = d.terminosHash;
  // P-1 (auditoría 58ª): si nadie llega a confirmar este PaymentIntent (o
  // Stripe lo rechaza), el webhook necesita saber que se llevó una plaza
  // gratis de matrícula para devolverla (lib/billing/cupo-matricula-abandonado.ts).
  if (d.cupoMatriculaReservado) metadata.cupoMatriculaReservado = '1';
  if (d.plazaEtapaId) metadata.plazaEtapaId = d.plazaEtapaId;
  if (d.socioId) metadata.socioId = d.socioId;
  if (d.origenLead) metadata.origenLead = d.origenLead;
  if (d.socioEmail) metadata.socioEmail = d.socioEmail;
  if (d.socioNombre) metadata.socioNombre = d.socioNombre;
  if (d.socioTelefono) metadata.socioTelefono = d.socioTelefono;
  if (d.sesionId) metadata.sesionId = d.sesionId;
  // La sesión del widget, para anotar la compra en su embudo al entregarla.
  if (d.widgetSesion) metadata.widgetSesion = d.widgetSesion;
  // Solo tiene sentido junto a sesionId (misma clase que reservar_plaza va a
  // confirmar) — sin sesión no hay reserva a la que asignarle un sitio.
  if (d.sesionId && d.spotId) metadata.spotId = d.spotId;
  if (d.codigoDescuentoId) metadata.codigoDescuentoId = d.codigoDescuentoId;
  if (d.matriculaCentimos > 0) metadata.matriculaCentimos = String(d.matriculaCentimos);
  if (d.genero) metadata.genero = d.genero;
  if (d.comoConociste) metadata.comoConociste = d.comoConociste;
  if (d.codigoPostal) metadata.codigoPostal = d.codigoPostal;
  if (d.fechaNacimiento) metadata.fechaNacimiento = d.fechaNacimiento;
  return metadata;
}

export function parametrosPaymentIntentEmbebido(d: DatosCompraEmbebida): Stripe.PaymentIntentCreateParams {
  return {
    amount: d.amountCentimos,
    currency: 'eur',
    // `allow_redirects: 'never'` en vez de una lista fija con solo 'card':
    // así Stripe sigue excluyendo automáticamente todo lo que exige salir
    // del widget (Bizum incluido — acción externa en la app del banco, se
    // ofrece aparte con redirect avisado, §4 del diseño), pero SÍ deja
    // pasar los métodos "de tarjeta" que no navegan a ningún sitio: Link,
    // Apple Pay, Google Pay. Con `payment_method_types: ['card']` a secas
    // (como estaba antes) esos tres desaparecían del Payment Element sin
    // que hiciera falta — no son un redirect, son la misma tarjeta con
    // menos fricción.
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    // Condicional por tipo de plan (P0): solo MENSUAL autoriza cargos
    // futuros. Con 'off_session' incondicional, una clase suelta de 1 €
    // pintaba el consentimiento de cargos futuros de Stripe sin necesitarlo.
    // Ver lib/billing/uso-futuro-tarjeta.ts (y el `-v2` de la clave de
    // idempotencia, versionada por este mismo cambio).
    ...(d.usoFuturo ? { setup_future_usage: d.usoFuturo } : {}),
    ...(d.customerId ? { customer: d.customerId } : {}),
    receipt_email: d.socioEmail ?? undefined,
    description: d.planNombre,
    ...(d.fee !== undefined ? { application_fee_amount: d.fee } : {}),
    metadata: metadataCompraEmbebida(d),
  };
}
