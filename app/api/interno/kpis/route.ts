import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// KPIs de uso de la plataforma entera.
//
// Principio de esta ruta: **no inventar números**. Ninguna columna de la BD
// prueba por sí sola que un estudio pague, así que aquí NO se calcula dinero:
// el MRR y el estado de cobro los sirve `/api/interno/facturacion`, que se lo
// pregunta a Stripe.
//
// Antes esta ruta sumaba el PRECIO DE LISTA de los estudios con
// `stripe_customer_id` + `subscription_status = 'active'`. Dos motivos para
// haberlo quitado, no uno:
//   · el precio de lista no es lo que se cobra (descuentos, precios heredados);
//   · solo miraba `studios`, y una cadena factura en `cadenas` — sus sedes
//     heredan `active` sin customer, así que una cadena que pagase habría
//     salido como N «accesos a mano» y 0 € de MRR.
// Tener dos sitios que calculan el dinero de forma distinta es peor que tener
// uno malo: nunca sabes cuál te está mintiendo.
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
    db.from('studios').select('id, slug, nombre, plan, creado_en, stripe_customer_id, subscription_status, suspendido_en'),
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
  const suspendidos = filas.filter(s => s.suspendido_en);

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
      suspendidos: suspendidos.length,
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
