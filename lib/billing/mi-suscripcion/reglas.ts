// «Mi suscripción» (Fase 3 de Billing & Revenue): qué se le deja hacer a la propietaria y cómo se
// aplica cada cambio. PURO (lo prueba `node --test`); la lectura de Stripe y las escrituras viven
// en las rutas de `app/api/billing/`.
//
// Reglas de cuándo se aplica cada cambio (decisión de producto, 17-nov-2026):
//   · Subir de plan (Founding → Estudio) y pasar de mensual a anual: AL MOMENTO, con la parte
//     proporcional. Antes de aplicar se enseña lo que va a pagar y cuándo (vista previa de Stripe).
//   · Cancelar: al FINAL del periodo ya pagado. No se quita ningún derecho antes de tiempo.
//   · Reactivar: quita la baja programada, sin cobro.
//   · Bajar de plan y pasar de anual a mensual: al final del periodo y SIN cobro, por el portal de
//     Stripe (que lo programa). Aquí no se aplican a mano: un cambio programado con dinero de por
//     medio no se improvisa sin poder probarlo contra Stripe.
import type { Addon, Plan } from '../entitlements.ts';

export type Intervalo = 'mensual' | 'anual';

export interface EntradaAcciones {
  /** Estado de la suscripción en STRIPE (no el de nuestra fila, que puede ir por detrás). */
  estado: string | null;
  plan: Plan | null;
  intervalo: Intervalo | null;
  /** Hay baja programada (`cancel_at_period_end` o `cancel_at`). */
  bajaProgramada: boolean;
  /** La suscripción es de una cadena: se gestiona desde la sede principal. */
  esCadena: boolean;
  /** Tiene complementos: para pasar a anual hacen falta también sus precios anuales. */
  tieneComplementos: boolean;
  /** Los precios anuales de los planes (y de los complementos si los tiene) están configurados. */
  anualDisponible: boolean;
}

export type MotivoSinAccion = 'cadena' | 'impago' | 'baja-programada' | 'sin-suscripcion' | 'anual-no-disponible';

export interface Acciones {
  actualizarTarjeta: boolean;
  cambiarAAnual: boolean;
  pasarAEstudio: boolean;
  cancelar: boolean;
  reactivar: boolean;
  /** Por qué no se pueden los cambios con dinero, para decírselo (null = se pueden). */
  motivoSinCambios: MotivoSinAccion | null;
}

export const MENSAJE_SIN_CAMBIOS: Record<MotivoSinAccion, string> = {
  cadena: 'Tu sede va con el plan Cadena: el plan se cambia desde la sede principal.',
  impago: 'Tu último cobro no ha salido. Actualiza la tarjeta y, cuando esté al día, podrás cambiar de plan.',
  'baja-programada': 'Tienes la baja programada. Reactiva tu suscripción para poder cambiar de plan.',
  'sin-suscripcion': 'Primero elige tu plan.',
  'anual-no-disponible': 'El pago anual no está disponible ahora mismo.',
};

const VIVA = new Set(['active', 'trialing', 'past_due']);

export function accionesDisponibles(e: EntradaAcciones): Acciones {
  const viva = !!e.estado && VIVA.has(e.estado);
  const sinSuscripcion = !viva;
  const impago = e.estado === 'past_due';
  // Una cadena solo cambia la tarjeta (el cliente de Stripe es el de la cadena).
  const motivo: MotivoSinAccion | null = sinSuscripcion ? 'sin-suscripcion'
    : e.esCadena ? 'cadena'
    : impago ? 'impago'
    : e.bajaProgramada ? 'baja-programada'
    : null;
  const sePuedeCambiar = motivo === null;
  const aAnual = sePuedeCambiar && e.intervalo === 'mensual';
  return {
    actualizarTarjeta: viva,
    cambiarAAnual: aAnual && e.anualDisponible,
    pasarAEstudio: sePuedeCambiar && e.plan === 'BASE',
    cancelar: viva && !e.esCadena && !e.bajaProgramada,
    reactivar: viva && !e.esCadena && e.bajaProgramada,
    motivoSinCambios: aAnual && !e.anualDisponible && motivo === null ? 'anual-no-disponible' : motivo,
  };
}

export type EstadoVisible = 'al_dia' | 'prueba' | 'impago' | 'baja_programada' | 'cancelada' | 'sin_suscripcion';

export function estadoVisible(estado: string | null, bajaProgramada: boolean): EstadoVisible {
  if (!estado) return 'sin_suscripcion';
  if (estado === 'canceled' || estado === 'incomplete_expired') return 'cancelada';
  if (estado === 'past_due' || estado === 'unpaid' || estado === 'incomplete') return 'impago';
  if (bajaProgramada) return 'baja_programada';
  if (estado === 'trialing') return 'prueba';
  return estado === 'active' ? 'al_dia' : 'sin_suscripcion';
}

export const TEXTO_ESTADO: Record<EstadoVisible, string> = {
  al_dia: 'Al día',
  prueba: 'En prueba',
  impago: 'Cobro pendiente',
  baja_programada: 'Baja programada',
  cancelada: 'Cancelada',
  sin_suscripcion: 'Sin suscripción',
};

// ── Pasar de mensual a anual ────────────────────────────────────────────────

export interface LineaParaPeriodo { id: string; priceId: string | null | undefined }
export type ItemPeriodo = { id: string; price: string };

/**
 * Las líneas de la suscripción tal como quedan al pasar a anual, en UNA sola actualización: cada
 * línea (el plan y cada complemento) pasa al precio ANUAL de lo mismo. `null` si alguna línea no
 * es ni un plan ni un complemento conocidos (añadida a mano) o si falta un precio anual: mejor no
 * tocar nada que dejar una suscripción con líneas de periodos distintos, que Stripe no admite.
 */
export function itemsParaPasarAAnual(
  lineas: readonly LineaParaPeriodo[],
  mapa: {
    plan: (priceId: string | null | undefined) => Plan | null;
    addon: (priceId: string | null | undefined) => Addon | null;
    precioAnualPlan: (plan: Plan) => string | null;
    precioAnualAddon: (addon: Addon) => string | null;
  },
): ItemPeriodo[] | null {
  const items: ItemPeriodo[] = [];
  let planes = 0;
  for (const l of lineas) {
    const plan = mapa.plan(l.priceId);
    const addon = mapa.addon(l.priceId);
    if (plan) {
      planes++;
      const p = mapa.precioAnualPlan(plan);
      if (!p) return null;
      items.push({ id: l.id, price: p });
    } else if (addon) {
      const p = mapa.precioAnualAddon(addon);
      if (!p) return null;
      items.push({ id: l.id, price: p });
    } else {
      return null;
    }
  }
  return planes === 1 ? items : null;
}

// ── Vista previa («qué voy a pagar y cuándo») ───────────────────────────────

export interface FacturaPrevia {
  amount_due: number;
  total: number;
  /** `period_end` de la factura previa: el final del periodo que se cobra. */
  period_end: number | null;
  lines: { data: Array<{ description: string | null; amount: number }> };
}

export interface VistaPrevia {
  /** `ahora`: se cobra en el acto (cambio de periodo). `proxima_factura`: se suma a la próxima factura. */
  cuando: 'ahora' | 'proxima_factura';
  /** Fecha del cobro (ISO). `null` si se cobra ahora. */
  fecha: string | null;
  /** Lo que se paga en ese cobro, en céntimos (puede ser 0 si el crédito lo cubre). */
  importeCents: number;
  lineas: Array<{ descripcion: string; importeCents: number }>;
}

/**
 * Lo que dice Stripe que se facturará, en el formato de la pantalla. `cuando` lo decide quien
 * llama (un cambio de periodo cobra en el acto; subir de plan se suma a la próxima factura).
 */
export function resumenDeVistaPrevia(
  f: FacturaPrevia,
  cuando: VistaPrevia['cuando'],
  proximaFacturaEn: string | null,
): VistaPrevia {
  return {
    cuando,
    fecha: cuando === 'ahora' ? null : proximaFacturaEn,
    importeCents: Math.max(f.amount_due, 0),
    lineas: f.lines.data
      .filter((l) => l.amount !== 0)
      .map((l) => ({ descripcion: (l.description ?? 'Suscripción').slice(0, 140), importeCents: l.amount })),
  };
}
