import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Este plan está cobrado en el TPV y todavía «por asignar»?
//
// GET /api/pos/ventas/por-asignar?planId=plan-1
//
// Lo pregunta la ficha de la clienta ANTES de dar de alta un plan. En el TPV un
// plan puede venderse sin clienta, a propósito (la clase de prueba de alguien
// que no da sus datos), y queda por asignar hasta que se le pone ficha desde
// Ventas. El 10-sep se vendió así una cuota y, un minuto después, en vez de
// asignarla, se dio de alta el mismo plan desde la ficha: dos recibos cobrados
// por un solo pago. Con esto la ficha avisa y ofrece asignar esa venta.
//
// Mismo permiso que el historial de ventas (`puedeVerFinanzas`): es la misma
// información, filtrada. Asignarla sigue exigiendo `puedeMoverDinero` en
// /api/pos/venta/asignar.
// ─────────────────────────────────────────────────────────────────────────────

/** Una venta de hace más de esto ya no es «la de hace un rato»: no se ofrece. */
const DIAS_VENTANA = 30;

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede ver las ventas' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const planId = req.nextUrl.searchParams.get('planId');
  if (!planId) return NextResponse.json({ error: 'Falta el plan' }, { status: 400 });

  // Líneas de ese plan todavía sin entregar (sin suscripción creada).
  const { data: lineas, error: errLineas } = await admin.from('ventas_pos_lineas')
    .select('venta_id')
    .eq('studio_id', sesion.studioId)
    .eq('tipo', 'PLAN')
    .eq('referencia_id', planId)
    .is('suscripcion_id', null);
  if (errLineas) return errorInterno('[pos/ventas/por-asignar] líneas', errLineas, 'No se han podido cargar las ventas.');

  const ids = [...new Set((lineas ?? []).map((l) => l.venta_id as string))];
  if (ids.length === 0) return NextResponse.json({ ventas: [] });

  const desde = new Date(Date.now() - DIAS_VENTANA * 24 * 60 * 60 * 1000).toISOString();
  const { data: ventas, error: errVentas } = await admin.from('ventas_pos')
    .select('id, numero, total, realizada_en')
    .eq('studio_id', sesion.studioId)
    .in('id', ids)
    // Sin dueña: una venta con clienta ya se entregó (o se entregará) a ella.
    .is('socio_id', null)
    // Los mismos criterios que la RPC `asignar_venta_pos_a_socia` (PAGADA y sin
    // nada devuelto): ofrecer una venta que al asignarla da 409 es un aviso falso.
    .eq('estado', 'PAGADA')
    .or('importe_devuelto.is.null,importe_devuelto.eq.0')
    .gte('realizada_en', desde)
    .order('realizada_en', { ascending: false })
    .limit(5);
  if (errVentas) return errorInterno('[pos/ventas/por-asignar] ventas', errVentas, 'No se han podido cargar las ventas.');

  return NextResponse.json({
    ventas: (ventas ?? []).map((v) => ({
      id: v.id as string, numero: v.numero as number, total: Number(v.total), realizadaEn: v.realizada_en as string,
    })),
  });
}
