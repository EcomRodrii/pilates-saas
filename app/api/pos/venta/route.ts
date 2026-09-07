import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { contextoCobroDe, proveedorPara, MAX_CENTIMOS_POS } from '@/lib/pos/terminal';
import { entregarVentaPOS } from '@/lib/pos/venta-servidor';
import { mensajeErrorVenta, codigoDeErrorPg, type LineaVentaPeticion } from '@/lib/pos/tipos';
import type { MetodoPago } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// La ÚNICA puerta por la que se registra una venta del mostrador.
//
// Recibe ids y cantidades. Nunca precios, nunca totales. Los calcula
// `registrar_venta_pos` releyendo el catálogo dentro de una transacción que
// además reserva el stock y numera la venta.
//
// ─── Las dos mitades del cobro ────────────────────────────────────────────
//
//   Efectivo / transferencia / TPV del banco  → la venta nace PAGADA.
//     No hay tercero a quien preguntar: quien cobra ha visto el dinero. El
//     sistema lo registra así, con su nombre, sin fingir una comprobación.
//
//   Datáfono / Bizum / tarjeta integrada      → la venta nace PENDIENTE_PAGO.
//     Se lanza el cobro al proveedor y se responde con la referencia. La venta
//     NO pasa a PAGADA aquí: lo hace /api/pos/venta/confirmar releyendo el
//     PaymentIntent, o el webhook de Stripe — quien llegue primero.
//
// Esto es lo que arregla el fallo más grave del TPV anterior: un botón «Cobro
// realizado» que marcaba la venta como cobrada sin preguntarle nada a Stripe,
// y un fallback que hacía lo mismo cuando Stripe ni respondía.
//
// El stock se reserva YA, incluso en PENDIENTE_PAGO: mientras la clienta pasa
// la tarjeta nadie puede vender por debajo esa última unidad. Si el pago falla,
// `fallar_pago_venta_pos` lo devuelve.
// ─────────────────────────────────────────────────────────────────────────────

const METODOS: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA', 'DATAFONO'];

function saneaLineas(bruto: unknown): { lineas: LineaVentaPeticion[] } | { error: string } {
  if (!Array.isArray(bruto) || bruto.length === 0) return { error: 'El ticket está vacío.' };
  if (bruto.length > 100) return { error: 'Demasiadas líneas en un solo ticket.' };

  const lineas: LineaVentaPeticion[] = [];
  for (const raw of bruto) {
    if (typeof raw !== 'object' || raw === null) return { error: 'Línea no válida.' };
    const l = raw as Record<string, unknown>;
    const tipo = l.tipo;
    if (tipo !== 'PRODUCTO' && tipo !== 'PLAN' && tipo !== 'LIBRE') return { error: 'Línea no válida.' };

    const cantidad = Number(l.cantidad ?? 1);
    if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 999) return { error: 'Cantidad no válida.' };

    if (tipo === 'LIBRE') {
      const nombre = String(l.nombre ?? '').trim();
      const precio = Number(l.precio);
      if (!nombre) return { error: 'Pon un concepto al importe libre.' };
      if (!Number.isFinite(precio) || precio < 0 || precio > 10000) return { error: 'Ese importe libre no es válido.' };
      lineas.push({ tipo, cantidad, nombre: nombre.slice(0, 120), precio, referenciaId: null });
      continue;
    }

    const referenciaId = typeof l.referenciaId === 'string' ? l.referenciaId : '';
    if (!referenciaId) return { error: 'Línea sin artículo.' };
    lineas.push({ tipo, cantidad, referenciaId });
  }
  return { lineas };
}

export async function POST(req: NextRequest) {
  // El rate limit va PRIMERO, antes incluso de resolver la sesión: es lo que
  // protege de un bucle de reintentos del propio TPV lanzando cobros al
  // datáfono. Fail-open por diseño (ver lib/rate-limit.ts).
  const limitado = await enforceRateLimit(req, 'pos-venta', { max: 60, windowSeconds: 60 });
  if (limitado) return limitado;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Esta ruta usa service-role y SE SALTA la RLS: el rol se comprueba aquí o no
  // lo comprueba nadie. Vía `puedeMoverDinero` y no con una lista escrita a
  // mano — MANAGER no toca caja, igual que no toca cobros.
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

  const metodoPago = body.metodoPago as MetodoPago;
  if (!METODOS.includes(metodoPago)) return NextResponse.json({ error: 'Método de pago no válido.' }, { status: 400 });

  const idempotenciaClave = typeof body.idempotenciaClave === 'string' ? body.idempotenciaClave.slice(0, 80) : null;
  if (!idempotenciaClave) return NextResponse.json({ error: 'Falta la clave de la operación.' }, { status: 400 });

  const socioId = typeof body.socioId === 'string' && body.socioId ? body.socioId : null;
  const descuentoTipo = body.descuentoTipo === 'EUROS' || body.descuentoTipo === 'PORCENTAJE' ? body.descuentoTipo : null;
  const descuentoValor = Number(body.descuentoValor ?? 0);
  const codigoDescuentoId = typeof body.codigoDescuentoId === 'string' && body.codigoDescuentoId ? body.codigoDescuentoId : null;
  const efectivoRecibido = body.efectivoRecibido == null ? null : Number(body.efectivoRecibido);
  const notas = typeof body.notas === 'string' ? body.notas.slice(0, 500) : null;

  if (descuentoTipo && (!Number.isFinite(descuentoValor) || descuentoValor < 0)) {
    return NextResponse.json({ error: 'Ese descuento no es válido.' }, { status: 400 });
  }
  if (efectivoRecibido !== null && (!Number.isFinite(efectivoRecibido) || efectivoRecibido < 0)) {
    return NextResponse.json({ error: 'Ese importe en efectivo no es válido.' }, { status: 400 });
  }

  // La socia, si viene, tiene que ser de ESTE estudio. El id lo manda el
  // navegador, así que se comprueba: sin esto se podría colgar una venta —y su
  // bono— de la ficha de otro negocio.
  if (socioId) {
    const { data: socia } = await admin.from('socios')
      .select('id').eq('id', socioId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!socia) return NextResponse.json({ error: 'Esa clienta no es de este estudio.' }, { status: 403 });
  }

  // Caja abierta, si la hay. La venta se apunta en ella; si no hay ninguna
  // abierta, la venta se registra igual — no cobrar por no haber abierto caja
  // sería un impedimento absurdo en un mostrador.
  const { data: caja } = await admin.from('cajas')
    .select('id').eq('studio_id', sesion.studioId).eq('estado', 'ABIERTA').maybeSingle();

  const proveedor = proveedorPara(metodoPago);
  const estadoInicial = proveedor.esAutoritativo ? 'PENDIENTE_PAGO' : 'PAGADA';
  const ventaId = `vpos-${uid()}`;

  const { data, error } = await admin.rpc('registrar_venta_pos', {
    p_venta_id: ventaId,
    p_studio_id: sesion.studioId,
    p_socio_id: socioId,
    p_lineas: sane.lineas.map((l) => ({
      tipo: l.tipo, referenciaId: l.referenciaId ?? null, cantidad: l.cantidad,
      ...(l.tipo === 'LIBRE' ? { nombre: l.nombre, precio: l.precio } : {}),
    })),
    p_descuento_tipo: descuentoTipo,
    p_descuento_valor: descuentoTipo ? descuentoValor : null,
    p_codigo_descuento_id: codigoDescuentoId,
    p_metodo_pago: metodoPago,
    p_caja_id: caja?.id ?? null,
    p_vendido_por: sesion.userId,
    p_vendido_por_nombre: sesion.nombre,
    p_efectivo_recibido: efectivoRecibido,
    p_idempotencia_clave: idempotenciaClave,
    p_estado_inicial: estadoInicial,
    p_notas: notas,
  });

  if (error) {
    // Los códigos de negocio de la RPC (`SIN_STOCK:Calcetines:1`) se traducen a
    // una frase; el resto es un fallo de verdad y se reporta.
    const codigo = codigoDeErrorPg(error.message);
    const conocido = mensajeErrorVenta(codigo);
    if (codigo && conocido !== 'No se ha podido completar la operación. Inténtalo de nuevo.') {
      return NextResponse.json({ error: conocido, codigo }, { status: 409 });
    }
    return errorInterno('pos:venta', error, 'No se ha podido registrar la venta. Inténtalo de nuevo.');
  }

  const fila = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!fila) return errorInterno('pos:venta', new Error('RPC sin resultado'), 'No se ha podido registrar la venta.');

  const total = Number(fila.r_total ?? 0);
  const base = {
    ventaId: String(fila.r_venta_id),
    numero: Number(fila.r_numero),
    subtotal: Number(fila.r_subtotal),
    descuento: Number(fila.r_descuento),
    baseImponible: Number(fila.r_base_imponible),
    ivaTotal: Number(fila.r_iva_total),
    total,
    cambio: fila.r_cambio == null ? null : Number(fila.r_cambio),
    yaExistia: fila.r_ya_existia === true,
  };

  // Reintento de una venta ya registrada: se devuelve tal cual, sin volver a
  // cobrar ni a entregar nada.
  if (base.yaExistia) {
    const { data: v } = await admin.from('ventas_pos')
      .select('estado, pago_estado, stripe_payment_intent_id')
      .eq('id', base.ventaId).eq('studio_id', sesion.studioId).maybeSingle();
    return NextResponse.json({
      ...base,
      estado: v?.estado ?? 'PAGADA',
      pagoEstado: v?.pago_estado ?? 'PAGADO',
      pago: v?.stripe_payment_intent_id ? { referencia: v.stripe_payment_intent_id } : undefined,
    });
  }

  // ── Cobro manual: ya está. Se entrega todo y se responde. ────────────────
  if (!proveedor.esAutoritativo) {
    const entrega = await entregarVentaPOS(admin, { studioId: sesion.studioId, ventaId: base.ventaId });
    return NextResponse.json({
      ...base, estado: 'PAGADA', pagoEstado: 'PAGADO',
      entrega: {
        bonos: entrega.suscripcionesCreadas, creditos: entrega.creditos,
        facturaSellada: entrega.facturaSellada, avisos: entrega.avisos,
      },
    });
  }

  // ── Cobro con proveedor: se lanza y se espera confirmación real ──────────
  const centimos = Math.round(total * 100);
  if (centimos <= 0) {
    // Un ticket a 0 € (todo descontado) no necesita pasar por el datáfono.
    await admin.rpc('confirmar_pago_venta_pos', {
      p_venta_id: base.ventaId, p_studio_id: sesion.studioId,
      p_payment_intent_id: null, p_importe_confirmado: 0,
    });
    const entrega = await entregarVentaPOS(admin, { studioId: sesion.studioId, ventaId: base.ventaId });
    return NextResponse.json({
      ...base, estado: 'PAGADA', pagoEstado: 'PAGADO',
      entrega: { bonos: entrega.suscripcionesCreadas, creditos: entrega.creditos, facturaSellada: entrega.facturaSellada, avisos: entrega.avisos },
    });
  }
  if (centimos > MAX_CENTIMOS_POS) {
    await admin.rpc('fallar_pago_venta_pos', {
      p_venta_id: base.ventaId, p_studio_id: sesion.studioId,
      p_pago_estado: 'ERROR', p_motivo: 'Importe por encima del máximo del TPV',
    });
    return NextResponse.json({ error: 'El importe supera el máximo permitido en el TPV (10.000 €).' }, { status: 400 });
  }

  const ctx = await contextoCobroDe(admin, sesion.studioId);
  if (!ctx.ok) {
    // No se pudo ni intentar el cobro: se anula la venta y se devuelve el
    // stock reservado. Dejarla PENDIENTE_PAGO para siempre bloquearía género.
    await admin.rpc('fallar_pago_venta_pos', {
      p_venta_id: base.ventaId, p_studio_id: sesion.studioId,
      p_pago_estado: 'ERROR', p_motivo: ctx.motivo,
    });
    return NextResponse.json({ error: ctx.motivo }, { status: ctx.status });
  }

  const origen = req.nextUrl.origin;
  const prov = proveedorPara(metodoPago, { readerId: ctx.readerId, origen });
  const concepto = sane.lineas.length === 1 ? 'Venta en el estudio' : `Venta de ${sane.lineas.length} artículos`;
  const inicio = await prov.iniciar(ctx.ctx, { importeCentimos: centimos, concepto, ref: { ventaId: base.ventaId } });

  if (!inicio.ok) {
    await admin.rpc('fallar_pago_venta_pos', {
      p_venta_id: base.ventaId, p_studio_id: sesion.studioId,
      p_pago_estado: 'ERROR', p_motivo: inicio.error,
    });
    return NextResponse.json({ error: inicio.error }, { status: 409 });
  }

  // Se guarda la referencia y se marca PROCESANDO. La venta sigue
  // PENDIENTE_PAGO: nadie la da por cobrada hasta que el proveedor lo diga.
  const { error: errRef } = await admin.from('ventas_pos').update({
    stripe_payment_intent_id: inicio.referencia || null,
    pago_estado: inicio.estado,
    pago_actualizado_en: new Date().toISOString(),
  }).eq('id', base.ventaId).eq('studio_id', sesion.studioId);
  if (errRef) {
    // La referencia es lo que permite confirmar después. Sin ella el cobro
    // podría completarse en Stripe y quedarse huérfano — hay que verlo.
    Sentry.captureMessage('[pos] cobro lanzado sin poder guardar su referencia', {
      level: 'error', tags: { area: 'cobros' },
      extra: { ventaId: base.ventaId, referencia: inicio.referencia, error: errRef.message },
    });
  }

  return NextResponse.json({
    ...base,
    estado: 'PENDIENTE_PAGO',
    pagoEstado: inicio.estado,
    pago: { referencia: inicio.referencia, url: inicio.url ?? null },
  });
}
