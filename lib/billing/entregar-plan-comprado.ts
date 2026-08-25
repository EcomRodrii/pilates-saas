// ─────────────────────────────────────────────────────────────────────────────
// Entregar lo que se acaba de cobrar.
//
// El botón "Contratar" del enlace público mandaba a Stripe con
// `metadata.planId`… y el webhook NUNCA leía ese campo. Stripe cobraba, el
// dinero entraba en la cuenta del estudio y no se creaba ni suscripción, ni
// bono, ni recibo, ni factura: cobrar sin entregar.
//
// Este módulo hace la entrega, y vive aparte del webhook para poder probarlo
// sin firmar eventos de Stripe.
//
// Idempotencia: Stripe REINTENTA los webhooks. Todos los ids se derivan de la
// sesión de checkout, así que un reintento choca por clave primaria (23505) y
// se ignora en vez de duplicar el bono o la factura.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
// Relativo y con `.ts` explícita: el alias `@/` no lo resuelve el runner de
// `node --test`, y este módulo sí tiene test unitario propio.
import { hoyEnEstudio } from '../utils.ts';

export interface CompraPlan {
  /**
   * Id de origen del cobro: base de los ids, garantiza idempotencia.
   *
   * Casi siempre el id de una sesión de Checkout (`cs_…`, Modo A). Desde la
   * Fase 3 del checkout embebido (Modo B, sin Checkout Session) también puede
   * ser el id de un PaymentIntent directo (`pi_…`) — ver `idsDe()` abajo. El
   * nombre del campo se deja tal cual a propósito (no `idOrigen`): cambiar la
   * firma pública tocaría los dos callers (webhook y conciliador) sin ganar
   * nada, el comentario ya deja claro que ya no es SOLO una sesión.
   */
  sessionId: string;
  studioId: string;
  planId: string;
  /** Socia ya existente, o null si compró antes de registrarse. */
  socioId: string | null;
  /** Email verificado por Stripe. Solo se usa en modo CREAR_FICHA. */
  email: string | null;
  /** Nombre que puso en Stripe, si lo puso. */
  nombre: string | null;
  /**
   * Teléfono del paso de datos del widget (metadata.socioTelefono, ya saneado
   * en checkout-embebido). Opcional a propósito: el Modo A (Checkout Session)
   * y el conciliador no lo tienen. Solo se escribe al crear ficha NUEVA —
   * una ficha existente no se pisa con el dato de una compra posterior,
   * mismo criterio que `origenLead`.
   */
  telefono?: string | null;
  /**
   * Lo que Stripe cobró DE VERDAD, en céntimos (`session.amount_total`).
   *
   * El recibo se registraba con `plan.precio`, releído en el momento del
   * webhook: si el estudio cambia el precio mientras la sesión de checkout está
   * abierta, la socia paga 20 € y queda registrado un recibo COBRADO de 65 €
   * —y sobre ese importe se calculan la factura y los ingresos—. El camino de
   * recibo sí valida el importe contra la BD; este no validaba nada.
   *
   * `null` = no se sabe (no debería ocurrir en un pago completado); ahí se cae a
   * `plan.precio`, que es el comportamiento anterior.
   */
  importeCobradoCentimos: number | null;
  /**
   * `session.payment_intent`: el cargo real en Stripe.
   *
   * Sin esto, un recibo nacido de una compra web no tenía ninguna forma de
   * volver a su cobro, y devolverlo desde el panel era imposible: había que
   * buscarlo a mano en Stripe. La metadata del PI tampoco servía de atajo —
   * el recibo se CREA aquí, después de pagar, así que su id no existía cuando
   * se creó el PaymentIntent y no puede estar en su metadata.
   *
   * Null = no se sabe (una sesión sin cargo asociado). No es motivo para no
   * entregar: el dinero ya está cobrado.
   */
  paymentIntentId: string | null;
  /**
   * P1 auditoría Momence: lead-id crudo del widget público (`?ref=`), leído
   * de `metadata.origenLead`. Solo se escribe al crear una ficha NUEVA — si
   * ya existía alguien con ese email, no se pisa su origen con el de una
   * compra posterior.
   */
  origenLead: string | null;
  /**
   * I-8: ¿es compra de invitada (sin login)?
   *
   * Si es verdad, SIEMPRE crear ficha nueva incluso si el email ya existe en BD.
   * Motivo: una invitada que paga con email ajeno (p.ej. copia-pega de typo)
   * no debe consumir el bono de la titular. Crear ficha nueva garantiza que
   * cada compra de invitada es autónoma — sin riesgo de suplantar bonos ajenos.
   */
  esInvitada: boolean;
}

export type ResultadoEntrega =
  | { ok: true; socioId: string; suscripcionId: string; reciboId: string; fichaCreada: boolean }
  | { ok: false; motivo: 'plan-no-encontrado' | 'sin-socia' | 'error'; detalle?: string };

/** 23505 = unique_violation: ya existía (reintento de Stripe). No es un fallo. */
const YA_EXISTIA = '23505';

// Exportada para que el conciliador (lib/inngest/conciliar-cobros.ts) sepa qué
// recibo BUSCAR sin volver a inventarse la regla: si el id se calculara en dos
// sitios, el día que cambie aquí el conciliador dejaría de ver lo ya entregado
// y lo entregaría otra vez.
//
// Acepta `cs_` (Checkout Session, Modo A — el conciliador SOLO genera este
// prefijo, lista sesiones de Stripe) y `pi_` (PaymentIntent, checkout
// embebido Modo B — Fase 3). El sufijo se recorta DESPUÉS de quitar el
// prefijo `cs_`/`pi_`, así que dos ids reales de Stripe con el mismo resto
// aleatorio (24 caracteres tras el prefijo, espacio de colisión astronómico
// — riesgo #2 de docs/checkout-embebido-diseno.md §9, verificado en vivo con
// execute_sql+ROLLBACK usando ids sintéticos de cada prefijo: producen
// `rec-web-…` distintos sin chocar por PK) chocarían igual que ya podían
// chocar dos sesiones `cs_` entre sí — no es un riesgo nuevo que introduzca
// `pi_`, es el mismo que ya asumía el diseño original.
export function idsDe(sessionId: string) {
  // Sufijo corto y estable: los ids de sesión/PaymentIntent de Stripe son largos.
  const base = sessionId.replace(/^(cs|pi)_(test_|live_)?/, '').slice(0, 24);
  return {
    suscripcionId: `sus-web-${base}`,
    reciboId: `rec-web-${base}`,
    socioId: `soc-web-${base}`,
    // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
    // §4.2): idempotencia de la RESERVA nacida de este pago, mismo patrón —
    // un reintento del webhook deriva el MISMO id, así que reservar_plaza
    // choca por PK en vez de duplicar la plaza.
    reservaId: `res-web-${base}`,
  };
}

/**
 * Crea (si hace falta) la ficha, la suscripción y el recibo ya cobrado de una
 * compra hecha desde el enlace público.
 *
 * `modo` decide qué pasa cuando no hay socia: EXIGIR_REGISTRO no debería llegar
 * aquí (el checkout lo frena antes de cobrar), pero si llega —porque el estudio
 * cambió el ajuste con un pago a medias— se crea la ficha igualmente: el dinero
 * YA está cobrado y dejarlo sin entregar sería peor.
 */
export async function entregarPlanComprado(
  admin: SupabaseClient,
  compra: CompraPlan,
): Promise<ResultadoEntrega> {
  const { data: plan, error: errPlan } = await admin
    .from('planes_tarifa')
    .select('id, nombre, precio, tipo, sesiones, validez_dias, studio_id')
    .eq('id', compra.planId)
    .eq('studio_id', compra.studioId)
    .maybeSingle();
  if (errPlan) return { ok: false, motivo: 'error', detalle: errPlan.message };
  if (!plan) return { ok: false, motivo: 'plan-no-encontrado' };

  const ids = idsDe(compra.sessionId);
  const ahora = new Date().toISOString();
  const importeReal = compra.importeCobradoCentimos != null
    ? compra.importeCobradoCentimos / 100
    : Number(plan.precio);
  // El día del ESTUDIO, no el de UTC: un pago de la 01:33 de la madrugada en
  // España son las 23:33 UTC del día anterior, y el recibo salía fechado un día
  // antes de cuando lo vivió la clienta. Ver `hoyEnEstudio`.
  const hoy = hoyEnEstudio(new Date(ahora));

  // ── 1. La socia ────────────────────────────────────────────────────────────
  let socioId = compra.socioId;
  let fichaCreada = false;

  if (!socioId) {
    // Sin email no hay a quién entregarle nada, y crear una ficha anónima sería
    // peor que no crearla: quedaría un bono que nadie puede reclamar.
    if (!compra.email) return { ok: false, motivo: 'sin-socia' };

    // I-8: si es invitada, SIEMPRE crear ficha nueva — no reutilizar aunque
    // el email ya exista. Motivo: quien paga sin login (invitada) puede meter
    // un email por error / copia-pega. Si reutilizamos, el bono va a la ficha
    // existente y la invitada no recibe lo que pagó. Crear ficha nueva garantiza
    // que cada compra de invitada es autónoma — sin riesgo de suplantar bonos.
    const debeCrearFichaNueva = compra.esInvitada;

    if (!debeCrearFichaNueva) {
      // ¿Ya existe alguien con ese email en el estudio? (compró dos veces
      // autenticada, o se registró entre medias). Se reutiliza en vez de duplicar.
      const { data: existente } = await admin
        .from('socios')
        .select('id')
        .eq('studio_id', compra.studioId)
        .ilike('email', compra.email)
        .maybeSingle();

      if (existente) {
        socioId = existente.id as string;
      }
    }

    if (!socioId) {
      // No existe, o es invitada (debe crear nueva): INSERT nueva ficha
      const partes = (compra.nombre ?? '').trim().split(/\s+/);
      const { error } = await admin.from('socios').insert({
        id: ids.socioId,
        studio_id: compra.studioId,
        nombre: partes[0] || 'Clienta',
        apellidos: partes.slice(1).join(' ') || '',
        email: compra.email,
        telefono: compra.telefono ?? null,
        activo: true,
        fecha_alta: ahora,
        campos_extra: {},
        origen_lead: compra.origenLead ?? null,
        // Sin contrato aceptado a propósito: no lo ha firmado. El portal se lo
        // pedirá la primera vez que entre (reservar/[slug] mira !aceptacionContrato).
      });
      if (error && error.code !== YA_EXISTIA) {
        return { ok: false, motivo: 'error', detalle: error.message };
      }
      socioId = ids.socioId;
      fichaCreada = !error;
    }
  }

  // ── 2. La suscripción (el bono en sí) ──────────────────────────────────────
  const validez = plan.validez_dias as number | null;
  const fechaFin = validez && validez > 0
    ? new Date(Date.now() + validez * 86400000).toISOString().slice(0, 10)
    : null;

  const { error: errSus } = await admin.from('suscripciones').insert({
    id: ids.suscripcionId,
    studio_id: compra.studioId,
    socio_id: socioId,
    plan_id: plan.id,
    estado: 'ACTIVA',
    fecha_inicio: hoy,
    fecha_fin: fechaFin,
    sesiones_restantes: plan.sesiones ?? null,
    stripe_subscription_id: null,
  });
  if (errSus && errSus.code !== YA_EXISTIA) {
    return { ok: false, motivo: 'error', detalle: errSus.message };
  }

  // ── 3. El recibo, ya cobrado ───────────────────────────────────────────────
  // Se marca COBRADO porque Stripe ya ha cobrado: es el registro contable de un
  // dinero que está en la cuenta del estudio.
  const { error: errRec } = await admin.from('recibos').insert({
    id: ids.reciboId,
    studio_id: compra.studioId,
    socio_id: socioId,
    suscripcion_id: ids.suscripcionId,
    concepto: `Alta web — ${plan.nombre}`,
    // Lo cobrado manda sobre el precio de catálogo: entre que se abre el
    // checkout y llega el webhook, el estudio puede haber cambiado el precio.
    importe: importeReal,
    estado: 'COBRADO',
    fecha_vencimiento: hoy,
    fecha_cobro: ahora,
    fecha_devolucion: null,
    intentos_reintento: 0,
    metodo_cobro: 'TARJETA',
    stripe_payment_intent_id: compra.paymentIntentId,
  });
  if (errRec && errRec.code !== YA_EXISTIA) {
    return { ok: false, motivo: 'error', detalle: errRec.message };
  }

  // Snapshot de la entrega, en un UPDATE aparte y best-effort A PROPÓSITO.
  //
  // Aquí es el caso limpio: la suscripción NO existía antes de esta compra, así
  // que "antes" es la nada y revertir es exacto (`sesiones_restantes: 0`,
  // `estado: CANCELADA`).
  //
  // ⚠️ Va FUERA del insert de arriba, y no dentro, para que el orden de
  // despliegue no pueda romper una entrega: si el código sale antes que la
  // migración que crea estas columnas, un insert que las incluyera fallaría
  // ENTERO → el webhook devolvería 500, Stripe reintentaría, y el bono no se
  // entregaría nunca con el dinero ya cobrado. Así, lo peor que pasa es quedarse
  // sin snapshot (que se lee como "no lo sé" y simplemente no ofrece revertir).
  const { error: errEntrega } = await admin.from('recibos').update({
    entrega_tipo: 'ALTA_WEB',
    entrega_aplicada: true,
    entrega_aplicada_en: ahora,
    entrega_sesiones_antes: null,
    entrega_sesiones_despues: plan.sesiones ?? null,
    entrega_fecha_fin_antes: null,
    entrega_fecha_fin_despues: fechaFin,
    entrega_estado_antes: null,
  }).eq('id', ids.reciboId).eq('studio_id', compra.studioId);
  if (errEntrega) {
    console.error('[entregarPlanComprado] sin snapshot de entrega:', errEntrega.message);
  }

  return { ok: true, socioId, suscripcionId: ids.suscripcionId, reciboId: ids.reciboId, fichaCreada };
}
