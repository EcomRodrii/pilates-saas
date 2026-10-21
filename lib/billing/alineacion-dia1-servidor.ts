// Lectura de la vista previa del modo B, en SERVIDOR y sobre las cuotas reales del
// estudio. Solo lee: no cobra, no crea recibos, no toca ninguna cuota.
// El cálculo es `vistaPreviaAlineacion` (puro, probado); aquí solo se trae lo que necesita.
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/supabase-data';
import { hoyEnEstudio } from '../utils.ts';
import { normalizarDiasMinimos } from './prorrateo.ts';
import { vistaPreviaAlineacion, type CuotaParaVistaPrevia, type VistaPrevia } from './alineacion-dia1.ts';

type Fila = Record<string, unknown>;
const TROZO = 150;

export async function cargarVistaPreviaAlineacion(admin: SupabaseClient, studioId: string, ahora: Date = new Date()): Promise<VistaPrevia> {
  const hoy = hoyEnEstudio(ahora);
  const { data: est, error: errEst } = await admin.from('studios').select('cobro_proporcional_dias_minimos').eq('id', studioId).maybeSingle();
  if (errEst) throw new Error(errEst.message);
  const diasMinimos = normalizarDiasMinimos(est?.cobro_proporcional_dias_minimos);

  const [susR, planesR] = await Promise.all([
    fetchAllRows<Fila>(studioId, 'suscripciones', (from, to) => admin.from('suscripciones')
      .select('id, socio_id, plan_id, fecha_fin, stripe_subscription_id, baja_al_vencer')
      .eq('studio_id', studioId).eq('estado', 'ACTIVA').not('fecha_fin', 'is', null)
      .order('id').range(from, to)),
    admin.from('planes_tarifa').select('id, tipo, precio, periodicidad_meses').eq('studio_id', studioId).eq('tipo', 'MENSUAL'),
  ]);
  if (susR.error) throw new Error(susR.error.message);
  if (planesR.error) throw new Error(planesR.error.message);
  const planes = new Map((planesR.data ?? []).map(p => [p.id as string, p]));
  // Las cuotas con baja programada y las de alumnas de baja las cancela el cron, no las renueva.
  const candidatas = susR.data.filter(s => planes.has(s.plan_id as string) && s.baja_al_vencer !== true);

  const idsSocio = [...new Set(candidatas.map(s => s.socio_id as string).filter(Boolean))];
  const socios = new Map<string, Fila>();
  for (let i = 0; i < idsSocio.length; i += TROZO) {
    const { data, error } = await admin.from('socios').select('id, nombre, apellidos, activo')
      .eq('studio_id', studioId).in('id', idsSocio.slice(i, i + TROZO));
    if (error) throw new Error(error.message);
    for (const s of data ?? []) socios.set(s.id as string, s);
  }

  const cuotas: CuotaParaVistaPrevia[] = [];
  for (const s of candidatas) {
    const socio = socios.get(s.socio_id as string);
    if (!socio || socio.activo === false) continue;
    const p = planes.get(s.plan_id as string)!;
    cuotas.push({
      suscripcionId: s.id as string,
      nombre: (socio.nombre as string) ?? '',
      apellidos: (socio.apellidos as string) ?? '',
      fechaFin: (s.fecha_fin as string | null) ?? null,
      plan: { tipo: 'MENSUAL', precio: Number(p.precio), periodicidadMeses: ((p.periodicidad_meses as number | null) ?? 1) as 1 },
      stripeSubscriptionId: (s.stripe_subscription_id as string | null) ?? null,
    });
  }
  return vistaPreviaAlineacion(cuotas, hoy, diasMinimos);
}
