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

// ─────────────────────────────────────────────────────────────────────────────
// La metadata en DOS mitades (5-oct-2026). La clave de idempotencia identifica el
// INTENTO (estudio, plan, quién paga, código y clase), así que lo que se manda al
// CREAR el cobro tiene que ser función de eso y nada más: si dos peticiones del
// mismo intento mandan algo distinto, Stripe contesta `idempotency_error` y esa
// persona no puede pagar esa clase en 24 h. Pasaba con cosas normales del
// formulario: corregir el teléfono o el nombre, elegir otro sitio, volver desde
// otra pestaña (otra `widgetSesion`) o con otro `?ref=`.
//
//  · ESTABLE: va en la creación. Lo que identifica el intento y lo que decide el
//    importe (matrícula incluida) y las condiciones aceptadas.
//  · VOLÁTIL: va DESPUÉS, con `paymentIntents.update`, antes de devolver el
//    client_secret (nadie puede pagar el cobro sin esos datos). Dos pestañas del
//    mismo intento comparten así UN cobro: gana lo último que se escribió, y
//    pagar en una hace que la otra ya no pueda pagar. Sin un segundo cobro.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que identifica el intento y decide el cargo: va al CREAR el cobro. */
export function metadataEstableEmbebida(d: DatosCompraEmbebida): Record<string, string> {
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
  if (d.socioId) metadata.socioId = d.socioId;
  if (d.socioEmail) metadata.socioEmail = d.socioEmail;
  if (d.sesionId) metadata.sesionId = d.sesionId;
  if (d.codigoDescuentoId) metadata.codigoDescuentoId = d.codigoDescuentoId;
  if (d.matriculaCentimos > 0) metadata.matriculaCentimos = String(d.matriculaCentimos);
  return metadata;
}

/**
 * Lo más largo que Stripe acepta en un valor de metadata. Lo volátil llega del
 * formulario sin tope (`?ref=`, el nombre, el código postal…): con un valor más
 * largo el `update` fallaba DESPUÉS de crear el cobro, y el cobro se cancelaba con
 * la matrícula gratis ya gastada. Se recorta aquí: el dato sigue, entero o casi.
 */
export const MAX_VALOR_METADATA = 500;

export function recortarMetadata(m: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.slice(0, MAX_VALOR_METADATA)]));
}

/** Lo que el formulario puede cambiar sin ser otro intento: va DESPUÉS, por `update`. */
export function metadataVolatilEmbebida(d: DatosCompraEmbebida): Record<string, string> {
  const metadata: Record<string, string> = {};
  // La plaza de cupo de una etapa: si la etapa empieza entre dos peticiones del
  // mismo intento, la segunda reserva una plaza que el cobro de la primera no
  // llevaba. Ligada por su referencia (`asignarRefPlaza`), no por la creación.
  if (d.plazaEtapaId) metadata.plazaEtapaId = d.plazaEtapaId;
  if (d.origenLead) metadata.origenLead = d.origenLead;
  if (d.socioNombre) metadata.socioNombre = d.socioNombre;
  if (d.socioTelefono) metadata.socioTelefono = d.socioTelefono;
  // La sesión del widget, para anotar la compra en su embudo al entregarla.
  if (d.widgetSesion) metadata.widgetSesion = d.widgetSesion;
  // Solo tiene sentido junto a sesionId (misma clase que reservar_plaza va a
  // confirmar) — sin sesión no hay reserva a la que asignarle un sitio.
  if (d.sesionId && d.spotId) metadata.spotId = d.spotId;
  if (d.genero) metadata.genero = d.genero;
  if (d.comoConociste) metadata.comoConociste = d.comoConociste;
  if (d.codigoPostal) metadata.codigoPostal = d.codigoPostal;
  if (d.fechaNacimiento) metadata.fechaNacimiento = d.fechaNacimiento;
  return recortarMetadata(metadata);
}

/** Toda la metadata con la que se paga: la estable y la volátil. Stripe exige valores no vacíos: lo que no hay, no va. */
export function metadataCompraEmbebida(d: DatosCompraEmbebida): Record<string, string> {
  return { ...metadataEstableEmbebida(d), ...metadataVolatilEmbebida(d) };
}

/**
 * Los parámetros del Customer de una invitada (sin ficha todavía). Solo lo que
 * identifica el intento: el nombre y el teléfono se escriben después
 * (`customers.update`). Con ellos en la creación, corregir el nombre daba
 * `idempotency_error` en el Customer, el cobro salía sin `customer` y ya era
 * distinto del primero.
 */
export function parametrosClienteInvitada(d: { socioEmail: string; studioId: string }) {
  return {
    email: d.socioEmail,
    metadata: { socioEmail: d.socioEmail, studioId: d.studioId },
  };
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
    // Solo la mitad estable: la volátil va por `update` (ver arriba).
    metadata: metadataEstableEmbebida(d),
  };
}
