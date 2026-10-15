import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mensajeErrorVenta, codigoDeErrorPg } from '@/lib/pos/tipos';
import { saneaLineas } from '@/lib/pos/sanear-lineas';
import { leerPresupuesto } from '@/lib/pos/total-esperado';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// La vista previa del cobro del TPV: cuánto va a costar ESTA venta, antes de
// cobrarla.
//
// No hay una copia del cálculo en TypeScript: se le pide a `registrar_venta_pos`
// con `p_solo_calcular`, que hace la venta entera y la deshace con su excepción
// `PRESUPUESTO:…` (migr `20261015155427_pos_venta_total_esperado`). Así cuenta lo
// que el carrito no ve, la matrícula del primer plan de verdad con su cupo de
// promoción, con las mismas reglas que la venta de verdad. Nada queda escrito:
// ni venta, ni stock, ni cupo de matrícula, ni el uso del código.
//
// No reserva plazas de etapa ni mira la caja: no vende. Lo que se cobra lo
// vuelve a comprobar la venta (`totalEsperado`), así que esta respuesta no
// tiene que ser la última palabra; solo la que se enseña.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'pos-presupuesto', { max: 120, windowSeconds: 60 });
  if (limitado) return limitado;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Service-role y sin RLS, como la venta: el rol se comprueba aquí. El mismo que
  // puede cobrar, porque esto solo se pide al abrir la hoja de cobro.
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar ventas' }, { status: 403 });
  }

  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 });

  const sane = saneaLineas(body.lineas);
  if ('error' in sane) return NextResponse.json({ error: sane.error }, { status: 400 });

  const socioId = typeof body.socioId === 'string' && body.socioId ? body.socioId : null;
  const descuentoTipo = body.descuentoTipo === 'EUROS' || body.descuentoTipo === 'PORCENTAJE' ? body.descuentoTipo : null;
  const descuentoValor = Number(body.descuentoValor ?? 0);
  const codigoDescuentoId = typeof body.codigoDescuentoId === 'string' && body.codigoDescuentoId ? body.codigoDescuentoId : null;
  if (descuentoTipo && (!Number.isFinite(descuentoValor) || descuentoValor < 0)) {
    return NextResponse.json({ error: 'Ese descuento no es válido.' }, { status: 400 });
  }

  // La clienta decide la matrícula: tiene que ser de ESTE estudio, como en la venta.
  if (socioId) {
    const { data: socia } = await admin.from('socios')
      .select('id').eq('id', socioId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!socia) return NextResponse.json({ error: 'Esa clienta no es de este estudio.' }, { status: 403 });
  }

  const { data, error } = await admin.rpc('registrar_venta_pos', {
    p_venta_id: `vpos-pres-${uid()}`,
    p_studio_id: sesion.studioId,
    p_socio_id: socioId,
    p_lineas: sane.lineas.map((l) => ({
      tipo: l.tipo, referenciaId: l.referenciaId ?? null, cantidad: l.cantidad,
      ...(l.tipo === 'LIBRE' ? { nombre: l.nombre, precio: l.precio } : {}),
    })),
    p_descuento_tipo: descuentoTipo,
    p_descuento_valor: descuentoTipo ? descuentoValor : null,
    p_codigo_descuento_id: codigoDescuentoId,
    // El método no cambia el total (solo el cambio en efectivo, que aquí no se pide).
    p_metodo_pago: 'EFECTIVO',
    p_caja_id: null,
    p_vendido_por: sesion.userId,
    p_vendido_por_nombre: sesion.nombre,
    p_efectivo_recibido: null,
    // Sin clave: con una, la RPC devolvería una venta ya hecha en vez de calcular.
    p_idempotencia_clave: null,
    p_estado_inicial: 'PAGADA',
    p_notas: null,
    p_solo_calcular: true,
  });

  if (!error) {
    // No puede pasar: con `p_solo_calcular` la RPC siempre termina en excepción. Si
    // pasara, habría una venta escrita y hay que verlo.
    return errorInterno('pos:presupuesto', new Error(`la RPC no calculó: devolvió ${JSON.stringify(data)}`),
      'No hemos podido calcular el total.');
  }

  const presupuesto = leerPresupuesto(error.message);
  if (presupuesto) return NextResponse.json(presupuesto);

  // Un motivo de negocio (sin stock, código ya gastado, cuota sin clienta…): el mismo
  // que daría la venta, para que se vea antes de cobrar.
  const codigo = codigoDeErrorPg(error.message);
  const conocido = mensajeErrorVenta(codigo);
  if (codigo && conocido !== 'No se ha podido completar la operación. Inténtalo de nuevo.') {
    return NextResponse.json({ error: conocido, codigo }, { status: 409 });
  }
  return errorInterno('pos:presupuesto', error, 'No hemos podido calcular el total.');
}
