import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { hoyEnEstudio } from '@/lib/utils';
import { calcularFechaFinBono } from '@/lib/bono-logic';
import { sellarFacturaDeRecibo } from '@/lib/billing/sellar-factura-server';
import { emiteFacturaAutomatica } from '@/lib/factura-automatica';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que pasa DESPUÉS de que una venta quede cobrada.
//
// Una venta del mostrador no es solo una fila en `ventas_pos`: es un bono que
// la clienta tiene que poder usar esta misma tarde, un recibo en su ficha, una
// factura con su número, y unos créditos en su monedero. Esto es lo que
// convierte el TPV en parte del producto en vez de en una caja registradora
// aparte.
//
// ─── Idempotencia: obligatoria, no deseable ───────────────────────────────
// Esta función la llaman DOS caminos que no se conocen entre sí: el TPV
// releyendo el pago, y el webhook de Stripe. Los dos pueden llegar, en
// cualquier orden, y el segundo no puede duplicar nada.
//
// Se consigue con ids DERIVADOS del id de venta (no aleatorios) y tolerando el
// 23505: `rec-pos-<venta>`, `fac-pos-<venta>`, `sus-pos-<linea>`. Es el mismo
// patrón que `entregarPlanComprado` usa con el `sessionId` de Stripe. Los
// créditos los protege el UNIQUE de `reward_actions`.
//
// ─── Orden deliberado ─────────────────────────────────────────────────────
// Bono → recibo → factura → créditos. La factura va después del recibo y solo
// si el recibo existe de verdad: sellar un documento fiscal (irreversible, va
// a la AEAT) sin cobro real detrás fue un bug de este mismo flujo, corregido
// en su día y aquí conservado como orden.
//
// Ningún paso posterior puede tumbar a uno anterior: si la factura falla, el
// bono ya entregado NO se retira. El dinero está cobrado y la clienta tiene que
// poder usar lo que compró; una factura se puede reintentar, un bono que se le
// quita en la cara no.
// ─────────────────────────────────────────────────────────────────────────────

const YA_EXISTIA = '23505';
/** `sellarFacturaDeRecibo` rechaza ids fuera de este alfabeto. */
const ID_SEGURO = /[^A-Za-z0-9_-]/g;

export interface ResultadoEntregaVenta {
  suscripcionesCreadas: number;
  reciboId: string | null;
  facturaSellada: boolean;
  creditos: number;
  /** Lo que no salió. La venta sigue cobrada; esto es para avisar, no para abortar. */
  avisos: string[];
}

/**
 * Materializa todo lo que cuelga de una venta ya PAGADA.
 * Segura de llamar varias veces: la segunda no duplica nada.
 */
export async function entregarVentaPOS(
  admin: SupabaseClient,
  params: { studioId: string; ventaId: string },
): Promise<ResultadoEntregaVenta> {
  const { studioId, ventaId } = params;
  const avisos: string[] = [];
  const idBase = ventaId.replace(ID_SEGURO, '');

  const { data: venta } = await admin
    .from('ventas_pos')
    .select('id, socio_id, total, numero, estado, recibo_id, metodo_pago')
    .eq('id', ventaId).eq('studio_id', studioId)
    .maybeSingle();

  if (!venta) return { suscripcionesCreadas: 0, reciboId: null, facturaSellada: false, creditos: 0, avisos: ['Venta no encontrada'] };
  if (venta.estado !== 'PAGADA') {
    // Defensa en profundidad: quien llama ya lo comprueba, pero entregar un
    // bono de una venta sin cobrar sería regalarlo.
    return { suscripcionesCreadas: 0, reciboId: null, facturaSellada: false, creditos: 0, avisos: ['La venta no está cobrada'] };
  }

  const { data: lineas } = await admin
    .from('ventas_pos_lineas')
    .select('id, tipo, referencia_id, nombre, total, suscripcion_id')
    .eq('venta_id', ventaId).eq('studio_id', studioId)
    .order('orden');

  const hoy = hoyEnEstudio();
  const ahora = new Date().toISOString();

  // ── 1. Bonos y planes: la MISMA suscripción que el resto de Tentare ──────
  //
  // Aquí está la diferencia con el TPV anterior, que vendía un "PACK" del
  // catálogo POS y no creaba nada: la clienta pagaba un bono que no existía en
  // su ficha. Ahora una línea de PLAN escribe en `suscripciones`, con el mismo
  // shape que `entregarPlanComprado` (la compra web) y `assignPlan` (el panel),
  // así que el bono es indistinguible de uno vendido por cualquier otra vía y
  // lo consume `consumir_sesion_bono` sin saber de dónde salió.
  let suscripcionesCreadas = 0;
  for (const linea of lineas ?? []) {
    if (linea.tipo !== 'PLAN' || !linea.referencia_id || linea.suscripcion_id) continue;
    if (!venta.socio_id) {
      avisos.push(`«${linea.nombre}» no se pudo entregar: la venta no tiene clienta.`);
      continue;
    }

    const { data: plan } = await admin
      .from('planes_tarifa')
      .select('id, nombre, sesiones, validez_dias, tipo')
      .eq('id', linea.referencia_id).eq('studio_id', studioId)
      .maybeSingle();
    if (!plan) { avisos.push(`«${linea.nombre}» ya no existe en el catálogo.`); continue; }

    const suscripcionId = `sus-pos-${linea.id.replace(ID_SEGURO, '')}`;
    const { error: errSus } = await admin.from('suscripciones').insert({
      id: suscripcionId,
      studio_id: studioId,
      socio_id: venta.socio_id,
      plan_id: plan.id,
      estado: 'ACTIVA',
      fecha_inicio: hoy,
      // La caducidad la calcula la MISMA función que el resto del producto
      // (`calcularFechaFinBono`, con el día del estudio y no UTC), no una
      // fórmula propia del POS que se desviaría a la primera.
      fecha_fin: calcularFechaFinBono(hoy, plan.validez_dias ?? null),
      sesiones_restantes: plan.sesiones ?? null,
      stripe_subscription_id: null,
    });
    if (errSus && errSus.code !== YA_EXISTIA) {
      avisos.push(`«${plan.nombre}» no se pudo entregar.`);
      Sentry.captureMessage('[pos] venta cobrada pero el bono no se entregó', {
        level: 'error', tags: { area: 'cobros' },
        extra: { ventaId, lineaId: linea.id, planId: plan.id, error: errSus.message },
      });
      continue;
    }

    await admin.from('ventas_pos_lineas')
      .update({ suscripcion_id: suscripcionId })
      .eq('id', linea.id).eq('studio_id', studioId);
    if (!errSus) suscripcionesCreadas++;
  }

  // ── 2. Recibo COBRADO ────────────────────────────────────────────────────
  // Marcado COBRADO, no PENDIENTE: el dinero ya está. Es el criterio de
  // `entregarPlanComprado` (compra ya pagada), no el de `assignPlan` (el panel
  // asigna y cobra después).
  let reciboId: string | null = venta.recibo_id ?? null;
  const total = Number(venta.total ?? 0);

  if (total > 0 && !reciboId) {
    reciboId = `rec-pos-${idBase}`;
    const concepto = (lineas ?? []).map((l) => l.nombre).join(', ').slice(0, 200) || 'Venta en el estudio';
    const { error: errRec } = await admin.from('recibos').insert({
      id: reciboId,
      studio_id: studioId,
      socio_id: venta.socio_id ?? null,
      // Sin `suscripcion_id` aunque la venta haya creado una: un ticket puede
      // llevar varias líneas y este recibo es de la venta ENTERA, no de una de
      // ellas. Colgarlo de la primera falsearía el desglose de /informes.
      suscripcion_id: null,
      concepto,
      importe: total,
      estado: 'COBRADO',
      fecha_vencimiento: hoy,
      fecha_cobro: hoy,
      fecha_devolucion: null,
      intentos_reintento: 0,
      // `metodo_cobro` no admite DATAFONO (su CHECK es de la migr 0100, anterior
      // al POS): un cobro por datáfono es una tarjeta, y así se registra.
      metodo_cobro: venta.metodo_pago === 'DATAFONO' ? 'TARJETA' : venta.metodo_pago,
    });
    if (errRec && errRec.code !== YA_EXISTIA) {
      avisos.push('La venta quedó registrada pero no se pudo crear su recibo.');
      Sentry.captureMessage('[pos] venta cobrada sin recibo', {
        level: 'error', tags: { area: 'cobros' },
        extra: { ventaId, error: errRec.message },
      });
      reciboId = null;
    } else {
      await admin.from('ventas_pos').update({ recibo_id: reciboId })
        .eq('id', ventaId).eq('studio_id', studioId);
    }
  }

  // ── 3. Factura ───────────────────────────────────────────────────────────
  // Cuelga del RECIBO, igual que todas las demás. NO se escribe
  // `facturas.venta_pos_id`: esa columna es un enlace de esquema reservado
  // para el día que se decida el diseño fiscal propio del POS (IVA por línea,
  // NIF del receptor), decisión aplazada a propósito en la migración
  // 20260902001721. Sellar por el camino de siempre mantiene una sola cadena
  // Veri*Factu por estudio, que es lo que la AEAT espera.
  let facturaSellada = false;
  // ⚠️ El efectivo no emite factura sola (`lib/factura-automatica.ts`). Se mira
  // el método de la VENTA, que es lo que de verdad se cobró; el `metodo_cobro`
  // del recibo ya traduce DATAFONO→TARJETA unas líneas más arriba y aquí eso
  // daría igual, pero leer el original evita depender de esa traducción.
  //
  // Nada más cambia: la venta se registra, el dinero entra en caja y la clienta
  // se lleva su bono exactamente igual. Lo único que no ocurre es la emisión
  // automática — la manual desde /cobros sigue disponible si la pide.
  if (reciboId && emiteFacturaAutomatica(venta.metodo_pago)) {
    const r = await sellarFacturaDeRecibo(admin, {
      studioId, reciboId, facturaId: `fac-pos-${idBase}`,
    });
    facturaSellada = r.ok;
    if (!r.ok) {
      // No se aborta: el dinero está cobrado y la clienta ya tiene su bono.
      // Se marca para que el conciliador lo reintente, igual que hacen
      // `confirmar-cobro` y `entregarPlanComprado`.
      await admin.from('recibos').update({ factura_pendiente_sellar: true })
        .eq('id', reciboId).eq('studio_id', studioId);
      avisos.push('La factura se emitirá en unos minutos.');
    }
  }

  // ── 4. Créditos de gamificación ──────────────────────────────────────────
  // Idempotente por `reward_actions UNIQUE (studio_id, trigger, ref_id)` con
  // ref_id = id de venta. Si el estudio no tiene regla COMPRA activa, devuelve
  // 0 sin error: la gamificación nunca puede tumbar un cobro.
  let creditos = 0;
  if (venta.socio_id && total > 0) {
    const { data, error } = await admin.rpc('otorgar_creditos_compra', {
      p_studio_id: studioId,
      p_socio_id: venta.socio_id,
      p_venta_id: ventaId,
      p_importe: total,
    });
    if (error) {
      // Se traga a propósito: un fallo de créditos no puede hacer que el
      // mostrador crea que la venta no salió.
      Sentry.captureMessage('[pos] no se pudieron otorgar los créditos de una compra', {
        level: 'warning', tags: { area: 'cobros' },
        extra: { ventaId, error: error.message },
      });
    } else {
      const fila = Array.isArray(data) ? data[0] : data;
      creditos = Number(fila?.r_creditos ?? 0);
    }
  }

  void ahora;
  return { suscripcionesCreadas, reciboId, facturaSellada, creditos, avisos };
}

/**
 * Deshace lo que se pueda de una venta devuelta: los créditos que dio.
 *
 * El bono y el stock los revierte la RPC `devolver_venta_pos` (sabe qué líneas
 * y qué cantidades); el recibo y la factura NO se tocan — un documento fiscal
 * no se borra, se rectifica, y esa rectificativa la decide una persona desde
 * /facturas con criterio de gestoría (`/api/facturas/rectificar`).
 */
export async function revertirCreditosVentaPOS(
  admin: SupabaseClient,
  params: { studioId: string; ventaId: string; socioId: string | null },
): Promise<number> {
  if (!params.socioId) return 0;
  const { data, error } = await admin.rpc('retirar_creditos_compra', {
    p_studio_id: params.studioId,
    p_socio_id: params.socioId,
    p_venta_id: params.ventaId,
  });
  if (error) {
    Sentry.captureMessage('[pos] no se pudieron retirar los créditos de una devolución', {
      level: 'warning', tags: { area: 'cobros' },
      extra: { ventaId: params.ventaId, error: error.message },
    });
    return 0;
  }
  return Number(data ?? 0);
}
