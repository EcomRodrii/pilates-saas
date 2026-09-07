import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { entregarVentaPOS } from '@/lib/pos/venta-servidor';
import { codigoDeErrorPg, mensajeErrorVenta } from '@/lib/pos/tipos';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Ponerle ficha, después, a una venta cobrada sin ella.
//
// Alguien entró de la calle, pagó una clase de prueba y se fue sin dar sus
// datos. A la semana vuelve y se apunta. Esto engancha aquella venta a su
// ficha recién creada: el bono se le entrega ENTONCES, con la misma
// `entregarVentaPOS` que usa el cobro normal, y los créditos también.
//
// No hay entidad nueva ni "cliente ocasional": la venta simplemente no tenía
// dueña y ahora la tiene. Un registro de invitados en paralelo habría sido
// justo el sistema duplicado que este rediseño existe para no crear.
//
// El rol se comprueba AQUÍ. La RPC corre con `service_role` (auth.uid() es
// NULL dentro), así que cualquier guardia basada en el usuario que se pusiera
// ahí dentro quedaría bypaseada en silencio — mismo criterio que el resto de
// las rutas del TPV.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede asignar ventas' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  let body: { ventaId?: unknown; socioId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Petición mal formada' }, { status: 400 });
  }

  const ventaId = typeof body.ventaId === 'string' ? body.ventaId : '';
  const socioId = typeof body.socioId === 'string' ? body.socioId : '';
  if (!ventaId || !socioId) {
    return NextResponse.json({ error: 'Falta la venta o la clienta' }, { status: 400 });
  }

  try {
    // El estudio SIEMPRE del JWT: si viniera del cuerpo, esto asignaría ventas
    // de otro estudio a clientas del propio.
    const { data, error } = await admin.rpc('asignar_venta_pos_a_socia', {
      p_studio_id: sesion.studioId,
      p_venta_id: ventaId,
      p_socio_id: socioId,
    });

    if (error) {
      const codigo = codigoDeErrorPg(error.message);
      // Códigos de negocio → 409 con una frase legible; el resto, 500.
      if (codigo) {
        return NextResponse.json({ error: mensajeErrorVenta(codigo), codigo }, { status: 409 });
      }
      return errorInterno('[pos/asignar] la RPC falló', error, 'No se ha podido asignar la venta.');
    }

    const fila = Array.isArray(data) ? data[0] : data;
    if (!fila?.r_aplicado) {
      return NextResponse.json({ error: 'No se ha podido asignar la venta.' }, { status: 409 });
    }

    // Ahora que la venta tiene dueña, la entrega de siempre crea el bono que
    // quedó pendiente y suma los créditos. Es idempotente: si se llamara dos
    // veces no duplicaría nada.
    const entrega = await entregarVentaPOS(admin, { studioId: sesion.studioId, ventaId });

    return NextResponse.json({
      ok: true,
      numero: fila.r_numero ?? null,
      reciboId: fila.r_recibo_id ?? null,
      entrega: {
        bonos: entrega.suscripcionesCreadas,
        creditos: entrega.creditos,
        facturaSellada: entrega.facturaSellada,
        avisos: entrega.avisos,
      },
    });
  } catch (e) {
    return errorInterno('[pos/asignar] excepción', e, 'No se ha podido asignar la venta.');
  }
}
