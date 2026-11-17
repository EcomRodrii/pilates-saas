// «Revenue & Subscriptions» (Fase 4 de Billing & Revenue): las cifras del SaaS, calculadas desde el
// libro de billing. PURO (lo prueba `node --test`): recibe filas ya leídas y devuelve números.
//
// Cada cifra dice qué mide, porque son cosas DISTINTAS y mezclarlas es como un MRR acaba
// pareciendo un ingreso:
//   · MRR / ARR        lo que se COBRARÍA cada mes con las suscripciones vivas (un anual cuenta /12).
//                      No es dinero recibido. Lo da Stripe en vivo (lib/interno/facturacion-real.ts).
//   · FACTURADO        lo facturado con fecha de factura en el periodo (un anual cuenta UNA vez, entero,
//                      el día que se factura: base de caja, no de devengo).
//   · COBRADO          lo que entró de verdad, por fecha de PAGO, menos devoluciones. Bruto (con IVA) y
//                      neto de IVA. NO es neto de comisiones de Stripe: el libro no las guarda.
//   · Movimientos MRR  nuevo, ampliación, reducción y baja, con el precio de LISTA de cada cambio
//                      (no incluye descuentos): son el «puente» entre dos MRR, no ingresos.
import { hoyEnEstudio, masDias } from '../../utils.ts';

export interface EventoLibroFila {
  stripe_event_id: string;
  tipo: string;
  studio_id: string | null;
  cadena_id: string | null;
  subscription_id: string | null;
  plan_despues: string | null;
  mrr_lista_antes_cents: number | null;
  mrr_lista_despues_cents: number | null;
  detalle: Record<string, unknown> | null;
  ocurrido_en: string;
}

export interface FacturaLibroFila {
  stripe_invoice_id: string;
  subscription_id: string | null;
  estado: string;
  total_cents: number;
  pagado_cents: number;
  impuestos_cents: number;
  devuelto_cents: number;
  creada_en: string;
  pagada_en: string | null;
}

export interface IncidenteLibroFila {
  estado: string;
  importe_cents: number;
  abierto_en: string;
  recuperado_en: string | null;
}

/** Días de calendario de Madrid, 'YYYY-MM-DD', ambos extremos incluidos. */
export interface Periodo { desde: string; hasta: string }

const dia = (iso: string): string => hoyEnEstudio(new Date(iso));
const enPeriodo = (iso: string | null | undefined, p: Periodo): boolean => {
  if (!iso) return false;
  const d = dia(iso);
  return d >= p.desde && d <= p.hasta;
};

export interface Metricas {
  periodo: Periodo;
  plan: string | 'TODOS';
  facturado: { brutoCents: number; netoIvaCents: number; facturas: number };
  cobrado: { brutoCents: number; netoIvaCents: number; devueltoCents: number; facturas: number };
  movimientosMrr: {
    nuevoCents: number; ampliacionCents: number; reduccionCents: number; bajaCents: number; netoCents: number;
    altas: number; upgrades: number; downgrades: number; bajas: number;
  };
  churn: {
    activasAlInicio: number; bajasDeEsaCohorte: number; logosPct: number | null;
    mrrAlInicioCents: number; mrrPerdidoCents: number; mrrPct: number | null;
  };
  activasAlFinal: number;
  porPlan: Array<{ plan: string; facturadoBrutoCents: number; cobradoBrutoCents: number; facturas: number }>;
  pagosFallidos: {
    abiertosAhora: number; importeAbiertoCents: number; abiertosEnElPeriodo: number; recuperadosEnElPeriodo: number;
  };
  /** Lo que el lector debe saber para no sobreleer una cifra. */
  avisos: string[];
}

const ESTADOS_FACTURADOS = new Set(['open', 'paid', 'uncollectible']);

/** Foto de cada suscripción tras reproducir sus eventos en orden. */
interface Foto { plan: string | null; mrr: number | null; viva: boolean; desde: string }

function reproducir(eventos: readonly EventoLibroFila[], hasta: string | null): Map<string, Foto> {
  const orden = [...eventos].sort((a, b) => a.ocurrido_en.localeCompare(b.ocurrido_en));
  const fotos = new Map<string, Foto>();
  for (const e of orden) {
    if (!e.subscription_id) continue;
    if (hasta !== null && dia(e.ocurrido_en) > hasta) continue;
    const f = fotos.get(e.subscription_id) ?? { plan: null, mrr: null, viva: false, desde: e.ocurrido_en };
    if (e.tipo === 'ALTA') { f.viva = true; f.desde = e.ocurrido_en; }
    if (e.tipo === 'CANCELADA') f.viva = false;
    if (e.plan_despues) f.plan = e.plan_despues;
    // Una baja no «pone a cero» el MRR guardado: es lo que se perdió.
    if (e.mrr_lista_despues_cents !== null && e.tipo !== 'CANCELADA') f.mrr = e.mrr_lista_despues_cents;
    fotos.set(e.subscription_id, f);
  }
  return fotos;
}

/** El plan de una suscripción en un instante: el último evento anterior; si no hay, el último de todos. */
function planEn(eventos: readonly EventoLibroFila[], subscriptionId: string | null, instante: string): string {
  if (!subscriptionId) return 'SIN_SUSCRIPCION';
  const suyos = eventos.filter((e) => e.subscription_id === subscriptionId && e.plan_despues)
    .sort((a, b) => a.ocurrido_en.localeCompare(b.ocurrido_en));
  if (suyos.length === 0) return 'DESCONOCIDO';
  const antes = suyos.filter((e) => e.ocurrido_en <= instante);
  return (antes.length ? antes[antes.length - 1] : suyos[0])!.plan_despues as string;
}

const dirDe = (e: EventoLibroFila): string | null => (typeof e.detalle?.direccion === 'string' ? e.detalle.direccion : null);

export function calcularMetricas(entrada: {
  eventos: readonly EventoLibroFila[];
  facturas: readonly FacturaLibroFila[];
  incidentes: readonly IncidenteLibroFila[];
  periodo: Periodo;
  /** Un plan concreto o `TODOS`. */
  plan?: string;
}): Metricas {
  const { periodo } = entrada;
  const plan = entrada.plan && entrada.plan !== 'TODOS' ? entrada.plan : 'TODOS';
  const filtraPlan = (p: string | null) => plan === 'TODOS' || p === plan;
  const avisos: string[] = [];

  // ── Facturado y cobrado, por plan de la suscripción en la fecha de la factura ──
  const porPlan = new Map<string, { facturadoBrutoCents: number; cobradoBrutoCents: number; facturas: number }>();
  const celda = (p: string) => porPlan.get(p) ?? porPlan.set(p, { facturadoBrutoCents: 0, cobradoBrutoCents: 0, facturas: 0 }).get(p)!;
  const facturado = { brutoCents: 0, netoIvaCents: 0, facturas: 0 };
  const cobrado = { brutoCents: 0, netoIvaCents: 0, devueltoCents: 0, facturas: 0 };
  let sinPlan = 0;
  for (const f of entrada.facturas) {
    const planFactura = planEn(entrada.eventos, f.subscription_id, f.creada_en);
    if (planFactura === 'DESCONOCIDO' || planFactura === 'SIN_SUSCRIPCION') sinPlan++;
    if (!filtraPlan(planFactura)) continue;
    if (ESTADOS_FACTURADOS.has(f.estado) && enPeriodo(f.creada_en, periodo)) {
      facturado.brutoCents += f.total_cents;
      facturado.netoIvaCents += f.total_cents - f.impuestos_cents;
      facturado.facturas++;
      const c = celda(planFactura); c.facturadoBrutoCents += f.total_cents; c.facturas++;
    }
    if (f.estado === 'paid' && enPeriodo(f.pagada_en, periodo)) {
      const neto = f.pagado_cents - (f.total_cents > 0 ? Math.round((f.impuestos_cents * f.pagado_cents) / f.total_cents) : 0);
      cobrado.brutoCents += f.pagado_cents - f.devuelto_cents;
      cobrado.netoIvaCents += neto;
      cobrado.devueltoCents += f.devuelto_cents;
      cobrado.facturas++;
      celda(planFactura).cobradoBrutoCents += f.pagado_cents - f.devuelto_cents;
    }
  }
  if (sinPlan > 0) avisos.push(`${sinPlan} factura(s) sin plan conocido (sin eventos de su suscripción): cuentan en el total, no en «por plan».`);

  // ── Movimientos de MRR: UNA vez por evento de Stripe (un cambio puede dar varias filas) ──
  const mov = { nuevoCents: 0, ampliacionCents: 0, reduccionCents: 0, bajaCents: 0, netoCents: 0, altas: 0, upgrades: 0, downgrades: 0, bajas: 0 };
  const grupos = new Map<string, EventoLibroFila[]>();
  for (const e of entrada.eventos) {
    if (!enPeriodo(e.ocurrido_en, periodo) || !filtraPlan(e.plan_despues)) continue;
    grupos.set(e.stripe_event_id, [...(grupos.get(e.stripe_event_id) ?? []), e]);
  }
  let reconstruidas = 0;
  for (const [, filas] of grupos) {
    const alta = filas.find((e) => e.tipo === 'ALTA');
    const baja = filas.find((e) => e.tipo === 'CANCELADA');
    const cambio = filas.find((e) => e.tipo === 'CAMBIO_PLAN' || e.tipo === 'CAMBIO_COMPLEMENTOS');
    if (alta) {
      mov.altas++;
      if (alta.detalle?.relleno === true) reconstruidas++;
      mov.nuevoCents += alta.mrr_lista_despues_cents ?? 0;
    } else if (baja) {
      mov.bajas++;
      mov.bajaCents += baja.mrr_lista_despues_cents ?? 0;
    } else if (cambio && cambio.mrr_lista_antes_cents !== null && cambio.mrr_lista_despues_cents !== null) {
      const delta = cambio.mrr_lista_despues_cents - cambio.mrr_lista_antes_cents;
      const dir = dirDe(cambio);
      if (delta > 0 || dir === 'UPGRADE') { mov.upgrades++; mov.ampliacionCents += Math.max(delta, 0); }
      else if (delta < 0 || dir === 'DOWNGRADE') { mov.downgrades++; mov.reduccionCents += Math.max(-delta, 0); }
    }
  }
  mov.netoCents = mov.nuevoCents + mov.ampliacionCents - mov.reduccionCents - mov.bajaCents;
  if (reconstruidas > 0) avisos.push(`${reconstruidas} alta(s) vienen del relleno desde Stripe: llevan el plan y el importe de HOY, no los del día del alta.`);

  // ── Churn: de las que estaban vivas al empezar, cuántas se fueron en el periodo ──
  const fotosInicio = reproducir(entrada.eventos, restarDia(periodo.desde));
  const fotosFin = reproducir(entrada.eventos, periodo.hasta);
  const cohorte = [...fotosInicio.entries()].filter(([, f]) => f.viva && filtraPlan(f.plan));
  const mrrInicio = cohorte.reduce((t, [, f]) => t + (f.mrr ?? 0), 0);
  let bajasCohorte = 0;
  let mrrPerdido = 0;
  for (const [sub, f] of cohorte) {
    const fin = fotosFin.get(sub);
    if (fin && !fin.viva) { bajasCohorte++; mrrPerdido += f.mrr ?? 0; }
  }
  const activasAlFinal = [...fotosFin.values()].filter((f) => f.viva && filtraPlan(f.plan)).length;
  if (cohorte.some(([, f]) => f.mrr === null)) avisos.push('Alguna suscripción viva al empezar no tiene importe en el libro: el MRR perdido puede quedarse corto.');

  // ── Pagos fallidos ──
  const abiertos = entrada.incidentes.filter((i) => i.estado === 'ABIERTO' || i.estado === 'ESCALADO');

  // Las devoluciones de suscripciones aún no se apuntan en el libro (se verán en la factura de Stripe).
  avisos.push('Devoluciones: el libro todavía no las registra, así que «cobrado» no las descuenta.');
  avisos.push('«Cobrado neto» es neto de IVA, no de comisiones de Stripe (el libro no las guarda).');

  return {
    periodo, plan, facturado, cobrado, movimientosMrr: mov,
    churn: {
      activasAlInicio: cohorte.length, bajasDeEsaCohorte: bajasCohorte,
      logosPct: cohorte.length > 0 ? bajasCohorte / cohorte.length : null,
      mrrAlInicioCents: mrrInicio, mrrPerdidoCents: mrrPerdido,
      mrrPct: mrrInicio > 0 ? mrrPerdido / mrrInicio : null,
    },
    activasAlFinal,
    porPlan: [...porPlan.entries()].map(([p, v]) => ({ plan: p, ...v })).sort((a, b) => b.cobradoBrutoCents - a.cobradoBrutoCents),
    pagosFallidos: {
      abiertosAhora: abiertos.length,
      importeAbiertoCents: abiertos.reduce((t, i) => t + i.importe_cents, 0),
      abiertosEnElPeriodo: entrada.incidentes.filter((i) => enPeriodo(i.abierto_en, periodo)).length,
      recuperadosEnElPeriodo: entrada.incidentes.filter((i) => i.estado === 'RECUPERADO' && enPeriodo(i.recuperado_en, periodo)).length,
    },
    avisos,
  };
}

/** El día anterior a uno 'YYYY-MM-DD' (para «estado al empezar el periodo»). */
const restarDia = (d: string): string => masDias(d, -1);

// ── Periodos predefinidos ──────────────────────────────────────────────────

export type PeriodoNombre = 'este_mes' | 'mes_pasado' | 'ultimos_3' | 'ultimos_12' | 'este_ano';

/** El periodo de un atajo, en días de Madrid. `hoy` = 'YYYY-MM-DD'. */
export function periodoDe(nombre: PeriodoNombre, hoy: string): Periodo {
  const [y, m] = hoy.split('-').map(Number) as [number, number];
  const ultimoDia = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // mm 1-12
  const pad = (n: number) => String(n).padStart(2, '0');
  const mesAtras = (n: number) => { const t = new Date(Date.UTC(y, m - 1 - n, 1)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 }; };
  if (nombre === 'este_mes') return { desde: `${y}-${pad(m)}-01`, hasta: hoy };
  if (nombre === 'mes_pasado') {
    const t = mesAtras(1);
    return { desde: `${t.y}-${pad(t.m)}-01`, hasta: `${t.y}-${pad(t.m)}-${pad(ultimoDia(t.y, t.m))}` };
  }
  if (nombre === 'ultimos_3') { const t = mesAtras(2); return { desde: `${t.y}-${pad(t.m)}-01`, hasta: hoy }; }
  if (nombre === 'ultimos_12') { const t = mesAtras(11); return { desde: `${t.y}-${pad(t.m)}-01`, hasta: hoy }; }
  return { desde: `${y}-01-01`, hasta: hoy };
}

/** Un periodo recibido por la URL: dos 'YYYY-MM-DD' en orden, de como mucho 5 años. `null` si no vale. */
export function leerPeriodo(desde: unknown, hasta: unknown): Periodo | null {
  const ok = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));
  if (!ok(desde) || !ok(hasta) || desde > hasta) return null;
  if (Date.parse(hasta) - Date.parse(desde) > 5 * 366 * 86_400_000) return null;
  return { desde, hasta };
}
