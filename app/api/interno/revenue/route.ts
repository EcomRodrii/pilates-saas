import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { leerFacturacion } from '@/lib/interno/facturacion-servidor';
import { hoyEnEstudio } from '@/lib/utils';
import {
  calcularMetricas, leerPeriodo, periodoDe, type EventoLibroFila, type FacturaLibroFila, type IncidenteLibroFila, type PeriodoNombre,
} from '@/lib/billing/metricas/reglas';

export const runtime = 'nodejs';
// Habla con Stripe (MRR en vivo): nunca cacheado.
export const dynamic = 'force-dynamic';

// «Revenue & Subscriptions». Las cifras de periodo (facturado, cobrado, movimientos, churn, por plan,
// pagos fallidos) salen del LIBRO de billing; el MRR, el ARR y las renovaciones, de Stripe EN VIVO
// (lo que se cobraría hoy). No se mezclan: ver la cabecera de lib/billing/metricas/reglas.ts.
const LIMITE = 10_000;
const ATAJOS: PeriodoNombre[] = ['este_mes', 'mes_pasado', 'ultimos_3', 'ultimos_12', 'este_ano'];
const PLANES = ['BASE', 'ESTUDIO', 'CADENA'];

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'billing.read');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const q = req.nextUrl.searchParams;
  const hoy = hoyEnEstudio();
  const atajo = q.get('periodo') as PeriodoNombre | null;
  const periodo = atajo && ATAJOS.includes(atajo) ? periodoDe(atajo, hoy) : leerPeriodo(q.get('desde'), q.get('hasta')) ?? periodoDe('este_mes', hoy);
  const planPedido = q.get('plan');
  const plan = planPedido && PLANES.includes(planPedido) ? planPedido : 'TODOS';

  const [eventos, facturas, incidentes, vivo] = await Promise.all([
    db.from('billing_eventos').select('stripe_event_id, tipo, studio_id, cadena_id, subscription_id, plan_despues, mrr_lista_antes_cents, mrr_lista_despues_cents, detalle, ocurrido_en').order('ocurrido_en').limit(LIMITE),
    db.from('billing_facturas').select('stripe_invoice_id, subscription_id, estado, total_cents, pagado_cents, impuestos_cents, devuelto_cents, creada_en, pagada_en').order('creada_en').limit(LIMITE),
    db.from('billing_incidentes_pago').select('estado, importe_cents, abierto_en, recuperado_en').limit(LIMITE),
    leerFacturacion(db),
  ]);
  if (eventos.error || facturas.error || incidentes.error) {
    return NextResponse.json({ error: 'No se ha podido leer el libro de billing.' }, { status: 500 });
  }

  const metricas = calcularMetricas({
    eventos: (eventos.data ?? []) as EventoLibroFila[],
    facturas: (facturas.data ?? []) as FacturaLibroFila[],
    incidentes: (incidentes.data ?? []) as IncidenteLibroFila[],
    periodo, plan,
  });
  if ((eventos.data?.length ?? 0) >= LIMITE || (facturas.data?.length ?? 0) >= LIMITE) {
    metricas.avisos.push(`El libro supera ${LIMITE} filas: las cifras pueden estar incompletas.`);
  }

  // Lo de Stripe en vivo, con el mismo filtro de plan. `null` si Stripe no contestó (no se enseña un 0).
  let enVivo: {
    stripeDisponible: boolean; avisoStripe: string | null; mrrEuros: number | null; arrEuros: number | null; pagando: number | null;
    renovaciones: Array<{ nombre: string; plan: string | null; renuevaEl: string; eurosMes: number }>;
  } = { stripeDisponible: false, avisoStripe: vivo?.avisoStripe ?? 'No se ha podido leer', mrrEuros: null, arrEuros: null, pagando: null, renovaciones: [] };
  if (vivo) {
    const { resultado } = vivo;
    const lineas = resultado.lineas.filter((l) => plan === 'TODOS' || l.planEnBd === plan);
    const pagando = lineas.filter((l) => l.estado === 'pagando');
    const mrr = pagando.reduce((t, l) => t + l.eurosMes, 0);
    const limite = Date.now() + 30 * 86_400_000;
    enVivo = {
      stripeDisponible: resultado.stripeDisponible, avisoStripe: vivo.avisoStripe,
      mrrEuros: resultado.stripeDisponible ? mrr : null, arrEuros: resultado.stripeDisponible ? mrr * 12 : null,
      pagando: resultado.stripeDisponible ? pagando.length : null,
      renovaciones: pagando
        .filter((l) => l.renuevaEl && Date.parse(l.renuevaEl) <= limite)
        .sort((a, b) => (a.renuevaEl as string).localeCompare(b.renuevaEl as string))
        .map((l) => ({ nombre: l.nombre, plan: l.planEnBd, renuevaEl: l.renuevaEl as string, eurosMes: l.eurosMes })),
    };
  }

  return NextResponse.json({ metricas, enVivo, hoy });
}
