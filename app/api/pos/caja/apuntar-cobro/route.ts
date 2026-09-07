import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// El apunte de caja que le faltaba a un cobro de mostrador.
//
// Hasta ahora las únicas escrituras en `movimientos_caja` venían del TPV. Pero
// /cobros deja marcar un recibo como cobrado EN EFECTIVO, y ese dinero entra en
// el cajón sin constar en el libro: al cerrar, el recuento salía por encima de
// lo esperado exactamente por esa cantidad, cada vez, sin ninguna pista de
// dónde venía.
//
// Se llama DESPUÉS de que el cobro ya esté registrado, nunca antes: quien
// decide si el recibo pasa a COBRADO sigue siendo `marcarCobrado`, con su
// compare-and-set y su sellado fiscal. Esto solo anota que el dinero pasó por
// el mostrador.
//
// No recibe importe ni método: los lee la RPC de la base. Un apunte de caja
// cuyo importe viniera del navegador sería un descuadre a un `fetch` de
// distancia.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  let body: { reciboId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Petición mal formada' }, { status: 400 });
  }
  const reciboId = typeof body.reciboId === 'string' ? body.reciboId : '';
  if (!reciboId) return NextResponse.json({ error: 'Falta el recibo' }, { status: 400 });

  try {
    const { data, error } = await admin.rpc('apuntar_cobro_en_caja', {
      p_studio_id: sesion.studioId,
      p_recibo_id: reciboId,
      p_por: sesion.userId,
      p_por_nombre: sesion.nombre,
    });
    if (error) {
      return errorInterno('[pos/apuntar-cobro] la RPC falló', error, 'No se ha podido apuntar el cobro en la caja.');
    }

    const fila = Array.isArray(data) ? data[0] : data;
    // `apuntado: false` NO es un error: casi todos sus motivos son situaciones
    // normales (sin caja abierta, cobrado por transferencia, ya apuntado). Se
    // devuelve el motivo para que quien llama decida si merece decir algo.
    return NextResponse.json({
      apuntado: Boolean(fila?.r_apuntado),
      importe: Number(fila?.r_importe ?? 0),
      motivo: fila?.r_motivo ?? null,
    });
  } catch (e) {
    return errorInterno('[pos/apuntar-cobro] excepción', e, 'No se ha podido apuntar el cobro en la caja.');
  }
}
