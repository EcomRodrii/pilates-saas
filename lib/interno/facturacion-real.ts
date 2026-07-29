// ─────────────────────────────────────────────────────────────────────────────
// El dinero del SaaS, leído de STRIPE — no de nuestras propias columnas.
//
// El panel calculaba el MRR sumando el PRECIO DE LISTA de los estudios que
// tienen `stripe_customer_id`. Eso tiene tres problemas, y los tres hacen que el
// número no se pueda usar para decidir nada:
//
//   1. Un customer de Stripe NO es una suscripción. Se crea al abrir el
//      Checkout, aunque no se llegue a pagar. Hoy en producción hay 2 customers
//      y CERO suscripciones: el panel enseñaba dinero que no cobra nadie.
//
//   2. El precio de lista no es lo que se cobra. Un descuento, un cupón, un
//      precio heredado o un cambio de tarifa sin migrar a los antiguos y el
//      número deja de parecerse a la realidad.
//
//   3. Las CADENAS son invisibles. El webhook de una cadena escribe en
//      `cadenas`, no en `studios` (app/api/billing/webhook), y el trigger
//      `propagar_plan_cadena` (migr 0066) propaga plan/estado/periodo pero NO
//      `stripe_customer_id`. Una cadena que paga 149 €/mes queda en `studios`
//      con estado `active` y sin customer → el panel la excluye del MRR y la
//      clasifica como «acceso concedido a mano».
//      ⚠️ Hoy es LATENTE: la única cadena que existe no tiene suscripción. Pero
//      el día que una pague, el panel dirá 0 €.
//
// Aquí la fuente de verdad es Stripe: se listan las suscripciones reales y se
// cruzan con la base. Lo que no cuadra NO se esconde — se cuenta aparte, porque
// una discrepancia entre lo que cobramos y lo que creemos cobrar es justo lo que
// un founder necesita ver.
// ─────────────────────────────────────────────────────────────────────────────
// Solo el tipo: este módulo es puro (recibe las suscripciones ya listadas), así
// que el test unitario corre sin cargar el SDK ni tocar la red.
import type Stripe from 'stripe';

export type EstadoCobro =
  | 'pagando'      // suscripción activa en Stripe
  | 'en_prueba'    // trialing
  | 'impago'       // past_due | unpaid | incomplete
  | 'cancelado'
  | 'manual'       // le dimos acceso a mano: no hay suscripción y no la esperamos
  | 'descuadre';   // decimos que tiene acceso y Stripe no lo respalda

export interface LineaFacturacion {
  /** Estudio o cadena. Una cadena agrupa varias sedes bajo UNA suscripción. */
  tipo: 'estudio' | 'cadena';
  id: string;
  nombre: string;
  /** Sedes que cubre. 1 para un estudio suelto. */
  sedes: number;
  planEnBd: string | null;
  estadoEnBd: string | null;
  estado: EstadoCobro;
  /** Lo que Stripe cobra de verdad al mes, en euros. 0 si no hay suscripción. */
  eurosMes: number;
  /** Cuándo renueva o cuándo se acaba la prueba. */
  renuevaEl: string | null;
  /** Días que quedan de prueba (solo si `en_prueba`). */
  diasDePrueba: number | null;
  stripeCustomerId: string | null;
  /** Por qué esta línea es un descuadre, en cristiano. */
  motivoDescuadre: string | null;
}

export interface FacturacionReal {
  lineas: LineaFacturacion[];
  /** MRR de verdad: suma de lo que Stripe cobra a las suscripciones activas. */
  mrrEuros: number;
  /** Lo que entraría si las pruebas en curso se convierten. No se suma al MRR. */
  mrrEnPruebaEuros: number;
  pagando: number;
  enPrueba: number;
  impagos: number;
  manuales: number;
  descuadres: number;
  /** Pruebas que se acaban en los próximos 7 días — la lista para llamar hoy. */
  pruebasQueAcaban: LineaFacturacion[];
  /** null si Stripe no está configurado: la UI debe DECIRLO, no enseñar 0 €. */
  stripeDisponible: boolean;
}

/** Estados de Stripe que significan que ese dinero entra de verdad. */
const COBRANDO = new Set(['active']);
const EN_PRUEBA = new Set(['trialing']);
const IMPAGO = new Set(['past_due', 'unpaid', 'incomplete']);

/** Importe mensual real de una suscripción, en euros. */
export function eurosAlMes(sub: Stripe.Subscription): number {
  let centimosMes = 0;
  for (const item of sub.items.data) {
    const precio = item.price;
    if (!precio?.unit_amount) continue;
    const cantidad = item.quantity ?? 1;
    const intervalo = precio.recurring?.interval;
    const cuenta = precio.recurring?.interval_count ?? 1;
    // Todo se normaliza a mensual: una anual de 1.200 € son 100 €/mes de MRR.
    const factorAMes =
      intervalo === 'year' ? 1 / (12 * cuenta)
      : intervalo === 'week' ? 52 / (12 * cuenta)
      : intervalo === 'day' ? 365 / (12 * cuenta)
      : 1 / cuenta;
    centimosMes += precio.unit_amount * cantidad * factorAMes;
  }
  return Math.round(centimosMes) / 100;
}

function iso(seg: number | null | undefined): string | null {
  return seg ? new Date(seg * 1000).toISOString() : null;
}

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export interface FilaEstudio {
  id: string; nombre: string; plan: string | null;
  subscription_status: string | null; stripe_customer_id: string | null;
  cadena_id: string | null;
}
export interface FilaCadena {
  id: string; nombre: string; plan: string | null;
  subscription_status: string | null; stripe_customer_id: string | null;
}

/**
 * Cruza lo que dice Stripe con lo que dice nuestra base.
 *
 * `subs` son las suscripciones de la CUENTA DE PLATAFORMA (lo que los estudios
 * nos pagan a nosotros) — nunca las de Connect, que son los cobros de las
 * socias a su estudio y no son ingreso nuestro.
 */
export function cruzarFacturacion(
  estudios: FilaEstudio[],
  cadenas: FilaCadena[],
  subs: Stripe.Subscription[],
  stripeDisponible: boolean,
): FacturacionReal {
  const subPorCustomer = new Map<string, Stripe.Subscription>();
  for (const s of subs) {
    const cust = typeof s.customer === 'string' ? s.customer : s.customer?.id;
    if (!cust) continue;
    // Con varias suscripciones para el mismo customer gana la que más "viva"
    // esté: una cancelada vieja no debe tapar la activa de hoy.
    const previa = subPorCustomer.get(cust);
    const puntua = (x: Stripe.Subscription) =>
      COBRANDO.has(x.status) ? 3 : EN_PRUEBA.has(x.status) ? 2 : IMPAGO.has(x.status) ? 1 : 0;
    if (!previa || puntua(s) > puntua(previa)) subPorCustomer.set(cust, s);
  }

  const sedesPorCadena = new Map<string, number>();
  for (const e of estudios) {
    if (e.cadena_id) sedesPorCadena.set(e.cadena_id, (sedesPorCadena.get(e.cadena_id) ?? 0) + 1);
  }

  const linea = (
    tipo: 'estudio' | 'cadena',
    id: string, nombre: string, sedes: number,
    plan: string | null, estadoBd: string | null, customer: string | null,
  ): LineaFacturacion => {
    const sub = customer ? subPorCustomer.get(customer) ?? null : null;
    const creeQueTieneAcceso = estadoBd === 'active' || estadoBd === 'trialing' || estadoBd === 'past_due';

    let estado: EstadoCobro;
    let motivo: string | null = null;

    if (sub && COBRANDO.has(sub.status)) estado = 'pagando';
    else if (sub && EN_PRUEBA.has(sub.status)) estado = 'en_prueba';
    else if (sub && IMPAGO.has(sub.status)) estado = 'impago';
    else if (sub) estado = 'cancelado';
    else if (!creeQueTieneAcceso) estado = 'manual';
    else {
      // Le estamos dando el producto y Stripe no lo respalda. Puede ser
      // legítimo (cortesía, piloto) o un cobro que se perdió. El panel no
      // adivina cuál: lo marca para que lo mires.
      estado = 'descuadre';
      motivo = customer
        ? 'Tiene cliente en Stripe pero ninguna suscripción viva'
        : 'Tiene acceso en la base y no hay nada en Stripe';
    }
    if (sub && !COBRANDO.has(sub.status) && !EN_PRUEBA.has(sub.status) && creeQueTieneAcceso) {
      motivo = `Stripe dice «${sub.status}» y aquí sigue con acceso`;
    }

    const renueva = iso(
      (sub as unknown as { current_period_end?: number } | null)?.current_period_end
      ?? (estado === 'en_prueba' ? sub?.trial_end ?? null : null),
    );

    return {
      tipo, id, nombre, sedes,
      planEnBd: plan, estadoEnBd: estadoBd, estado,
      eurosMes: sub && (COBRANDO.has(sub.status) || EN_PRUEBA.has(sub.status)) ? eurosAlMes(sub) : 0,
      renuevaEl: renueva,
      diasDePrueba: estado === 'en_prueba' ? diasHasta(iso(sub?.trial_end) ?? renueva) : null,
      stripeCustomerId: customer,
      motivoDescuadre: motivo,
    };
  };

  const lineas: LineaFacturacion[] = [
    // Una cadena es UNA línea, no una por sede: su suscripción cubre todas.
    // Contarlas por sede multiplicaba el MRR por el número de centros.
    ...cadenas.map(c =>
      linea('cadena', c.id, c.nombre, sedesPorCadena.get(c.id) ?? 0,
            c.plan, c.subscription_status, c.stripe_customer_id)),
    ...estudios
      .filter(e => !e.cadena_id)
      .map(e => linea('estudio', e.id, e.nombre, 1, e.plan, e.subscription_status, e.stripe_customer_id)),
  ];

  const cuenta = (x: EstadoCobro) => lineas.filter(l => l.estado === x).length;
  const suma = (x: EstadoCobro) =>
    Math.round(lineas.filter(l => l.estado === x).reduce((t, l) => t + l.eurosMes, 0) * 100) / 100;

  return {
    lineas,
    mrrEuros: suma('pagando'),
    mrrEnPruebaEuros: suma('en_prueba'),
    pagando: cuenta('pagando'),
    enPrueba: cuenta('en_prueba'),
    impagos: cuenta('impago'),
    manuales: cuenta('manual'),
    descuadres: cuenta('descuadre'),
    pruebasQueAcaban: lineas
      .filter(l => l.estado === 'en_prueba' && l.diasDePrueba !== null && l.diasDePrueba <= 7)
      .sort((a, b) => (a.diasDePrueba ?? 99) - (b.diasDePrueba ?? 99)),
    stripeDisponible,
  };
}
