import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { calcularPasosOnboarding, type PasoOnboarding } from '@/lib/onboarding';
import { catalogo } from '@/lib/migracion/catalogo';

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

  // catalogo() (no un select a secas) para las tablas que agregan TODOS los
  // estudios: sin paginar, PostgREST corta en 1000 filas — con la plataforma
  // creciendo, socios/sesiones/instructores/tipos_clase de todos los estudios
  // juntos ya pueden superar ese corte y dar conteos/última actividad falsos.
  const [studios, socios, sesiones, reservas7, reservas30, reservasHoy, instructores, tiposClase] = await Promise.all([
    db.from('studios').select('id, slug, nombre, plan, creado_en, stripe_customer_id, subscription_status, suspendido_en, nif, stripe_account_id'),
    catalogo<{ studio_id: string }>((d, h) => db.from('socios').select('studio_id').range(d, h)),
    catalogo<{ studio_id: string; creado_en: string | null }>((d, h) => db.from('sesiones').select('studio_id, creado_en').range(d, h)),
    db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', hace7),
    db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', hace30),
    db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', inicioHoy),
    catalogo<{ studio_id: string; activo: boolean }>((d, h) => db.from('instructores').select('studio_id, activo').range(d, h)),
    catalogo<{ studio_id: string }>((d, h) => db.from('tipos_clase').select('studio_id').range(d, h)),
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

  // Onboarding: `calcularPasosOnboarding` (lib/onboarding.ts) ya existe y corre
  // per-estudio en el navegador de cada propietaria; esto la centraliza para
  // ver el embudo real (dónde se atascan las que ya empezaron a usarlo). Solo
  // sobre "con actividad" — una alta vacía nunca completó nada, incluirla
  // mezclaría "no ha llegado" con "no le hace falta".
  const instructoresActivosPorEstudio = new Map<string, number>();
  for (const i of instructores.data ?? []) {
    if (!i.activo) continue;
    const k = i.studio_id as string;
    instructoresActivosPorEstudio.set(k, (instructoresActivosPorEstudio.get(k) ?? 0) + 1);
  }
  const tiposClasePorEstudio = new Map<string, number>();
  for (const t of tiposClase.data ?? []) {
    const k = t.studio_id as string;
    tiposClasePorEstudio.set(k, (tiposClasePorEstudio.get(k) ?? 0) + 1);
  }
  const pasosPorEstudio: PasoOnboarding[][] = conActividad.map(s => {
    const id = s.id as string;
    return calcularPasosOnboarding({
      nif: s.nif as string | null,
      stripeAccountId: s.stripe_account_id as string | null,
      slug: s.slug as string | null,
      numInstructores: instructoresActivosPorEstudio.get(id) ?? 0,
      numTiposClase: tiposClasePorEstudio.get(id) ?? 0,
      numSesiones: clasesPorEstudio.get(id) ?? 0,
      numSocios: sociosPorEstudio.get(id) ?? 0,
    });
  });
  const activados = pasosPorEstudio.filter(pasos => pasos.every(p => p.done)).length;
  const pendientesPorPaso = new Map<string, { label: string; pendientes: number }>();
  for (const pasos of pasosPorEstudio) {
    for (const p of pasos) {
      if (p.done || p.id === 'reservas') continue; // consecuencia de los demás, no un paso propio que resolver
      const actual = pendientesPorPaso.get(p.id);
      pendientesPorPaso.set(p.id, { label: p.label, pendientes: (actual?.pendientes ?? 0) + 1 });
    }
  }
  const pasoMasBloqueante = [...pendientesPorPaso.entries()]
    .sort((a, b) => b[1].pendientes - a[1].pendientes)[0];

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
    onboarding: {
      activados,
      totalConActividad: conActividad.length,
      pasoMasBloqueante: pasoMasBloqueante
        ? { id: pasoMasBloqueante[0], label: pasoMasBloqueante[1].label, pendientes: pasoMasBloqueante[1].pendientes }
        : null,
    },
  });
}
