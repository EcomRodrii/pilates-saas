import 'server-only';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { leerFacturacion } from '@/lib/interno/facturacion-servidor';
import { estadosGratisPorEstudio } from '@/lib/interno/hoy';
import { esPlanGratis, LIMITE_RESERVAS_MES } from '@/lib/billing/plan-gratis';
import { ADDONS, precioMensual, type Addon, type Plan } from '@/lib/billing/entitlements';
import { diasDesde } from '@/lib/billing/impagos/reglas';
import { hoyEnEstudio } from '@/lib/utils';
import {
  construirAlertas, DIAS_RENOVACION_CERCA, tarjetaCaducaAntes,
  type Alerta, type EntradaExito, type ImpagoFila, type RenovacionCerca,
} from './reglas';

// Lee todo lo que alimenta las alertas de Customer Success y se lo pasa a las reglas puras. Solo LEE:
// ni escribe, ni manda nada a ningún estudio. Cada fuente que no se pueda leer se dice en `avisos`
// y esa familia de alertas se omite: «no he podido mirar» no es lo mismo que «no hay nada».

const CAP_STRIPE = 20; // llamadas extra a Stripe por pasada (clientes y tarjetas), en serie

interface FilaEstudio {
  id: string; nombre: string | null; slug: string | null; plan: string | null; subscription_status: string | null;
  subscription_id: string | null; stripe_customer_id: string | null; cadena_id: string | null; owner_auth_user_id: string | null;
  es_demo: boolean | null; suspendido_en: string | null; regimen_addons: boolean | null; addons: string[] | null;
}

export interface ResultadoExito {
  alertas: Alerta[];
  /** Fuentes que no se pudieron leer, y supuestos que conviene saber. */
  avisos: string[];
}

export async function leerExito(db: SupabaseClient, ahora = new Date()): Promise<ResultadoExito | null> {
  const avisos: string[] = [];
  const hoy = hoyEnEstudio(ahora);
  const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString();

  const { data: estudiosRaw, error } = await db.from('studios')
    .select('id, nombre, slug, plan, subscription_status, subscription_id, stripe_customer_id, cadena_id, owner_auth_user_id, es_demo, suspendido_en, regimen_addons, addons');
  if (error) return null;
  const estudios = ((estudiosRaw ?? []) as FilaEstudio[]).filter((e) => !e.es_demo);
  const nombreDe = (e: Pick<FilaEstudio, 'nombre' | 'slug' | 'id'>) => e.nombre ?? e.slug ?? e.id;
  const porId = new Map(estudios.map((e) => [e.id, e]));

  const [marcas, incidentes, facturas, usos, visitas, ia] = await Promise.all([
    db.from('estudio_marcas_uso').select('studio_id, panel_dia'),
    db.from('billing_incidentes_pago').select('stripe_invoice_id, studio_id, cadena_id, estado, importe_cents, motivo_texto, intentos, abierto_en, avisos').in('estado', ['ABIERTO', 'ESCALADO']),
    db.from('billing_facturas').select('stripe_invoice_id, motivo'),
    db.from('uso_plan_gratis').select('studio_id, alumnas_activas, reservas_30_dias, excedido_desde, medido_en'),
    db.from('billing_visitas_planes').select('studio_id, dia').gte('dia', hoyEnEstudio(new Date(ahora.getTime() - 14 * 86_400_000))),
    db.from('ia_consumos').select('studio_id, unidades_sin_saldo').gt('unidades_sin_saldo', 0).gte('creado_en', hace(30)),
  ]);
  for (const [fuente, r] of [['uso del panel', marcas], ['pagos fallidos', incidentes], ['facturas', facturas], ['plan gratis', usos], ['visitas a planes', visitas], ['asistente', ia]] as const) {
    if (r.error) avisos.push(`No se pudo leer: ${fuente}. Sus alertas no se muestran.`);
  }

  // Cuándo se usó por última vez el panel de cada estudio. Sin marca = sin dato (nunca «lleva 99 días»).
  const diasSinEntrarDe = new Map<string, number>();
  for (const m of (marcas.data ?? []) as Array<{ studio_id: string; panel_dia: string | null }>) {
    if (m.panel_dia) diasSinEntrarDe.set(m.studio_id, diasDesde(`${m.panel_dia}T12:00:00Z`, new Date(`${hoy}T12:00:00Z`)));
  }

  // Stripe en vivo: quién paga, quién ha programado la baja, cuándo renueva.
  const vivo = await leerFacturacion(db);
  if (!vivo || vivo.avisoStripe) avisos.push(`Stripe no ha contestado${vivo?.avisoStripe ? ` (${vivo.avisoStripe})` : ''}: no se calculan bajas programadas, renovaciones ni contrataciones sin terminar.`);
  const lineas = vivo && !vivo.avisoStripe ? vivo.resultado.lineas : [];
  const subs = vivo && !vivo.avisoStripe ? vivo.subs : [];
  const clave = process.env.STRIPE_SECRET_KEY;
  const stripe = clave && !clave.startsWith('sk_test_XXXX') && subs.length >= 0 && vivo && !vivo.avisoStripe
    ? new Stripe(clave, { apiVersion: '2026-06-24.dahlia' }) : null;
  const subDe = new Map(subs.map((s) => [typeof s.customer === 'string' ? s.customer : s.customer.id, s]));
  const lineaDe = new Map(lineas.filter((l) => l.stripeCustomerId).map((l) => [l.stripeCustomerId as string, l]));
  const idDeLinea = (l: { tipo: string; id: string }) => (l.tipo === 'estudio' ? l.id : null);

  // ── Bajas programadas ──
  const bajas = subs
    .filter((s) => (s.status === 'active' || s.status === 'trialing') && (s.cancel_at_period_end || s.cancel_at))
    .flatMap((s) => {
      const l = lineaDe.get(typeof s.customer === 'string' ? s.customer : s.customer.id);
      if (!l) return [];
      const finUnix = s.cancel_at ?? (s as unknown as { current_period_end?: number }).current_period_end
        ?? (s.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
      if (!finUnix) return [];
      return [{ estudioId: idDeLinea(l), nombre: l.nombre, plan: l.planEnBd, eurosMes: l.eurosMes, hasta: new Date(finUnix * 1000).toISOString() }];
    });
  const conBaja = new Set(bajas.map((b) => b.nombre));

  // ── Renovaciones cercanas con motivo (la tarjeta se mira solo en las pocas que renuevan esta semana) ──
  const limiteRenov = ahora.getTime() + DIAS_RENOVACION_CERCA * 86_400_000;
  const renovaciones: RenovacionCerca[] = [];
  let llamadas = 0;
  for (const l of lineas.filter((x) => x.estado === 'pagando' && x.renuevaEl && Date.parse(x.renuevaEl) <= limiteRenov && Date.parse(x.renuevaEl) >= ahora.getTime() && !conBaja.has(x.nombre))) {
    let caducaAntes = false;
    const s = l.stripeCustomerId ? subDe.get(l.stripeCustomerId) : undefined;
    if (stripe && s && llamadas < CAP_STRIPE) {
      llamadas++;
      try {
        const completa = await stripe.subscriptions.retrieve(s.id, { expand: ['default_payment_method'] });
        const pm = typeof completa.default_payment_method === 'object' ? completa.default_payment_method : null;
        if (pm?.card) caducaAntes = tarjetaCaducaAntes(pm.card.exp_month, pm.card.exp_year, l.renuevaEl as string);
      } catch { avisos.push(`No se pudo leer la tarjeta de ${l.nombre}.`); }
    }
    renovaciones.push({
      estudioId: idDeLinea(l), nombre: l.nombre, plan: l.planEnBd, eurosMes: l.eurosMes, fecha: l.renuevaEl as string,
      diasSinEntrar: l.tipo === 'estudio' ? diasSinEntrarDe.get(l.id) ?? null : null, tarjetaCaducaAntes: caducaAntes,
    });
  }

  // ── Contrataciones sin terminar: un cliente de Stripe (se crea al abrir el pago) y ninguna suscripción ──
  const visitasPorEstudio = new Map<string, Set<string>>();
  for (const v of (visitas.data ?? []) as Array<{ studio_id: string; dia: string }>) {
    visitasPorEstudio.set(v.studio_id, (visitasPorEstudio.get(v.studio_id) ?? new Set()).add(v.dia));
  }
  const contrataciones: EntradaExito['contrataciones'][number][] = [];
  if (stripe) {
    for (const e of estudios.filter((x) => x.stripe_customer_id && !x.subscription_id && !x.cadena_id && !x.suspendido_en && !subDe.has(x.stripe_customer_id as string))) {
      if (llamadas >= CAP_STRIPE) { avisos.push('Hay más contrataciones por revisar de las que caben en una pasada.'); break; }
      llamadas++;
      try {
        const c = await stripe.customers.retrieve(e.stripe_customer_id as string);
        if (!('deleted' in c && c.deleted)) {
          contrataciones.push({ estudioId: e.id, nombre: nombreDe(e), clienteCreadoEn: new Date(c.created * 1000).toISOString(), visitasDias14d: visitasPorEstudio.get(e.id)?.size ?? 0 });
        }
      } catch { avisos.push(`No se pudo leer el cliente de Stripe de ${nombreDe(e)}.`); }
    }
  }

  // ── Impagos: un incidente por factura; si la factura nació de una alta, es un primer pago ──
  const motivoFactura = new Map(((facturas.data ?? []) as Array<{ stripe_invoice_id: string; motivo: string | null }>).map((f) => [f.stripe_invoice_id, f.motivo]));
  const impagos: ImpagoFila[] = ((incidentes.data ?? []) as Array<{
    stripe_invoice_id: string; studio_id: string | null; cadena_id: string | null; estado: string; importe_cents: number;
    motivo_texto: string | null; intentos: number; abierto_en: string; avisos: Array<{ dia: number; tipo?: string }> | null;
  }>).map((i) => {
    const e = i.studio_id ? porId.get(i.studio_id) : undefined;
    return {
      estudioId: i.studio_id, nombre: e ? nombreDe(e) : i.cadena_id ? `Cadena ${i.cadena_id}` : 'Cliente sin identificar', plan: e?.plan ?? null,
      importeCents: i.importe_cents, diasAbierto: diasDesde(i.abierto_en, ahora), intentos: i.intentos, motivo: i.motivo_texto,
      avisosDias: (i.avisos ?? []).filter((a) => a.tipo !== 'saltado').map((a) => a.dia), esPrimerPago: motivoFactura.get(i.stripe_invoice_id) === 'subscription_create', estado: i.estado,
    };
  });

  // ── Clientes de pago sin uso (solo con marca de uso: sin ella no hay dato) ──
  const sinUso = lineas.filter((l) => l.tipo === 'estudio' && l.estado === 'pagando').flatMap((l) => {
    const d = diasSinEntrarDe.get(l.id);
    return d === undefined ? [] : [{ estudioId: l.id, nombre: l.nombre, plan: l.planEnBd, eurosMes: l.eurosMes, diasSinEntrar: d }];
  });

  // ── Plan gratis: quién ha pasado el límite ──
  const gratis = estudios.filter((e) => esPlanGratis(e.subscription_status));
  const usoPorId = new Map(((usos.data ?? []) as Array<{ studio_id: string; alumnas_activas: number | null; reservas_30_dias: number | null; excedido_desde: string | null; medido_en: string | null }>).map((u) => [u.studio_id, u]));
  const estados = estadosGratisPorEstudio(gratis.map((e) => {
    const u = usoPorId.get(e.id);
    return { studioId: e.id, ownerId: e.owner_auth_user_id, alumnasActivas: u?.alumnas_activas ?? null, reservas30Dias: u?.reservas_30_dias ?? null, excedidoDesde: u?.excedido_desde ?? null, medidoEn: u?.medido_en ?? null };
  }), hoy);
  const limites = gratis.flatMap((e) => {
    const est = estados.get(e.id);
    if (!est || (est.fase !== 'MARGEN' && est.fase !== 'CERRADO')) return [];
    return [{ estudioId: e.id, nombre: nombreDe(e), fase: est.fase, diasRestantes: est.diasRestantes, reservas30d: est.uso?.reservas30Dias ?? null, limiteReservas: LIMITE_RESERVAS_MES }];
  });

  // ── Varias sedes sueltas de una misma propietaria ──
  const porDuena = new Map<string, FilaEstudio[]>();
  for (const e of estudios.filter((x) => !x.cadena_id && x.owner_auth_user_id && !x.suspendido_en)) {
    porDuena.set(e.owner_auth_user_id as string, [...(porDuena.get(e.owner_auth_user_id as string) ?? []), e]);
  }
  const sedes = [...porDuena.entries()].filter(([, v]) => v.length >= 2).map(([duenaId, v]) => ({ duenaId, estudios: v.map((e) => ({ id: e.id, nombre: nombreDe(e) })) }));

  // ── Asistente: veces que se quedó sin saldo ──
  const sinSaldo = new Map<string, number>();
  for (const r of (ia.data ?? []) as Array<{ studio_id: string }>) sinSaldo.set(r.studio_id, (sinSaldo.get(r.studio_id) ?? 0) + 1);
  const asistente = [...sinSaldo.entries()].flatMap(([id, veces30d]) => {
    const e = porId.get(id);
    return e ? [{ estudioId: id, nombre: nombreDe(e), veces30d, plan: e.plan }] : [];
  });

  // ── Complementos de Founding de pago ──
  const complementos = estudios.filter((e) => e.regimen_addons && e.subscription_status === 'active' && e.plan === 'BASE' && (e.addons?.length ?? 0) >= 2).map((e) => ({
    estudioId: e.id, nombre: nombreDe(e),
    addons: (e.addons ?? []).map((a) => (a in ADDONS ? ADDONS[a as Addon].nombre : a)),
    costeMensualEuros: precioMensual('BASE' as Plan, e.addons ?? []),
  }));

  const visitasSinContratar = [...visitasPorEstudio.entries()].flatMap(([id, dias]) => {
    const e = porId.get(id);
    return e && !e.subscription_id && !e.cadena_id ? [{ estudioId: id, nombre: nombreDe(e), diasConVisita14d: dias.size }] : [];
  });

  if (diasSinEntrarDe.size === 0) avisos.push('Sin marcas de uso del panel: no se calculan las alertas de falta de uso.');
  return {
    alertas: construirAlertas({ contrataciones, impagos, bajas, renovaciones, visitas: visitasSinContratar, sinUso, limites, sedes, asistente, complementos }, ahora),
    avisos,
  };
}
