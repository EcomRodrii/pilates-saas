import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { PLAN_INFO } from '@/lib/billing/entitlements';

export const runtime = 'nodejs';

// KPIs de la plataforma entera.
//
// Principio de esta ruta: **no inventar números**. `studios.plan` NO prueba que
// nadie pague — hoy 12 de 14 estudios son altas de prueba en BASE y los dos
// CADENA se pusieron a mano. Sumar el precio de lista de todos los planes daría
// un MRR de cuatro cifras que no existe, que es justo el tipo de mentira que
// nos costó una tarde limpiar en la BD del estudio.
//
// Así que el MRR sale SOLO de los estudios que llegaron a crear un cliente en
// Stripe, y se devuelve junto al recuento para que la UI pueda decir de dónde
// sale. La verdad última de cobros vive en Stripe, no aquí.
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'studios.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const ahora = new Date();
  const hace30 = new Date(ahora.getTime() - 30 * 864e5).toISOString();
  const hace7 = new Date(ahora.getTime() - 7 * 864e5).toISOString();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();

  const [studios, socios, sesiones, reservas7, reservas30, reservasHoy] = await Promise.all([
    db.from('studios').select('id, slug, nombre, plan, creado_en, stripe_customer_id'),
    db.from('socios').select('studio_id'),
    db.from('sesiones').select('studio_id, creado_en'),
    db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', hace7),
    db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', hace30),
    db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', inicioHoy),
  ]);

  const filas = studios.data ?? [];
  const sociosPorEstudio = new Map<string, number>();
  for (const s of socios.data ?? []) {
    sociosPorEstudio.set(s.studio_id as string, (sociosPorEstudio.get(s.studio_id as string) ?? 0) + 1);
  }
  const clasesPorEstudio = new Map<string, number>();
  for (const s of sesiones.data ?? []) {
    clasesPorEstudio.set(s.studio_id as string, (clasesPorEstudio.get(s.studio_id as string) ?? 0) + 1);
  }

  // "Con actividad" = tiene al menos una socia o una clase. Lo demás son altas
  // que nunca llegaron a usarse: contarlas como estudios sería engañarse.
  const conActividad = filas.filter(
    s => (sociosPorEstudio.get(s.id as string) ?? 0) > 0 || (clasesPorEstudio.get(s.id as string) ?? 0) > 0,
  );
  const dePago = filas.filter(s => s.stripe_customer_id);

  const mrr = dePago.reduce((total, s) => {
    const info = PLAN_INFO[s.plan as keyof typeof PLAN_INFO];
    return total + (info?.precioMes ?? 0);
  }, 0);

  // Altas por mes, para el gráfico. Clave 'YYYY-MM'.
  const altasPorMes = new Map<string, number>();
  for (const s of filas) {
    const mes = String(s.creado_en ?? '').slice(0, 7);
    if (mes) altasPorMes.set(mes, (altasPorMes.get(mes) ?? 0) + 1);
  }

  return NextResponse.json({
    estudios: {
      total: filas.length,
      conActividad: conActividad.length,
      vacios: filas.length - conActividad.length,
      altasUltimos30d: filas.filter(s => String(s.creado_en ?? '') >= hace30).length,
    },
    ingresos: {
      mrr,
      arr: mrr * 12,
      estudiosDePago: dePago.length,
      // Bandera para que la UI no presente como hecho lo que es una estimación.
      // Si nadie ha pagado todavía, decirlo es más útil que un 0 sin contexto.
      fuente: 'estudios con cliente de Stripe · el estado real de cada cobro vive en Stripe',
    },
    actividad: {
      socias: (socios.data ?? []).length,
      clases: (sesiones.data ?? []).length,
      reservasHoy: reservasHoy.count ?? 0,
      reservas7d: reservas7.count ?? 0,
      reservas30d: reservas30.count ?? 0,
    },
    altasPorMes: [...altasPorMes.entries()].sort().map(([mes, n]) => ({ mes, altas: n })),
  });
}
