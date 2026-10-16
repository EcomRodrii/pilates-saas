import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { leerFacturacion } from '@/lib/interno/facturacion-servidor';

export const runtime = 'nodejs';
// Habla con Stripe: nunca cacheado. Un MRR de hace una hora es un MRR que miente.
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// El estado de cobro real de cada estudio, leído de Stripe.
//
// Por qué no basta con nuestras columnas: `subscription_status` lo escribe el
// webhook, y un webhook que se perdió deja la columna mintiendo para siempre.
// Aquí se pregunta a Stripe y se marca lo que no cuadre — ver la cabecera de
// `lib/interno/facturacion-real.ts` para el razonamiento completo.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // `billing.read`, no `studios.read`: hasta ahora ese permiso no cerraba
  // ninguna puerta (se concedía y no gateaba nada). Esta pantalla es justo lo
  // que decía proteger, así que aquí pasa a ser real. Quien tiene acceso al
  // panel pero no a las cuentas —marketing, soporte— deja de ver los ingresos.
  const g = await exigirPermiso(req, 'billing.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const leida = await leerFacturacion(db);
  if (!leida) return NextResponse.json({ error: 'No se han podido leer los estudios.' }, { status: 500 });
  const { resultado, subs, avisoStripe } = leida;

  return NextResponse.json({ ...resultado, avisoStripe, suscripcionesEnStripe: subs.length });
}
