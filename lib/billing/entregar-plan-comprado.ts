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

export interface CompraPlan {
  /** id de la sesión de checkout: base de los ids, garantiza idempotencia. */
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
export function idsDe(sessionId: string) {
  // Sufijo corto y estable: los ids de sesión de Stripe son largos.
  const base = sessionId.replace(/^cs_(test_|live_)?/, '').slice(0, 24);
  return {
    suscripcionId: `sus-web-${base}`,
    reciboId: `rec-web-${base}`,
    socioId: `soc-web-${base}`,
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
  const hoy = ahora.slice(0, 10);

  // ── 1. La socia ────────────────────────────────────────────────────────────
  let socioId = compra.socioId;
  let fichaCreada = false;

  if (!socioId) {
    // Sin email no hay a quién entregarle nada, y crear una ficha anónima sería
    // peor que no crearla: quedaría un bono que nadie puede reclamar.
    if (!compra.email) return { ok: false, motivo: 'sin-socia' };

    // ¿Ya existe alguien con ese email en el estudio? (compró dos veces, o se
    // registró entre medias). Se reutiliza en vez de duplicar.
    const { data: existente } = await admin
      .from('socios')
      .select('id')
      .eq('studio_id', compra.studioId)
      .ilike('email', compra.email)
      .maybeSingle();

    if (existente) {
      socioId = existente.id as string;
    } else {
      const partes = (compra.nombre ?? '').trim().split(/\s+/);
      const { error } = await admin.from('socios').insert({
        id: ids.socioId,
        studio_id: compra.studioId,
        nombre: partes[0] || 'Clienta',
        apellidos: partes.slice(1).join(' ') || '',
        email: compra.email,
        activo: true,
        fecha_alta: ahora,
        campos_extra: {},
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
