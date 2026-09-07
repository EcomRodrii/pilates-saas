import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero, puedeVerFinanzas } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mensajeErrorVenta, codigoDeErrorPg } from '@/lib/pos/tipos';

export const dynamic = 'force-dynamic';

/** Espejo del CHECK de `movimientos_caja.metodo_pago` (migr 20260907145937). */
const METODOS_CAJA = ['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA', 'DATAFONO', 'OTRO'];

// ─────────────────────────────────────────────────────────────────────────────
// La caja: abrir, mover y cerrar.
//
// GET  → la caja abierta ahora mismo, su saldo esperado y su libro.
// POST → { accion: 'abrir' | 'mover' | 'cerrar' }
//
// Leer la caja exige `puedeVerFinanzas`; tocarla, `puedeMoverDinero`. Hoy
// coinciden (PROPIETARIO y RECEPCION), pero son dos preguntas distintas y se
// escriben distintas para poder separarlas el día que alguien tenga que
// consultar el arqueo sin poder moverlo.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede ver la caja' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: caja } = await admin.from('cajas')
    .select('id, fondo_inicial, abierta_en, abierta_por_nombre')
    .eq('studio_id', sesion.studioId).eq('estado', 'ABIERTA')
    .maybeSingle();

  if (!caja) return NextResponse.json({ caja: null, movimientos: [], esperado: 0 });

  // El saldo esperado se DERIVA del libro, no se lee de una columna: un
  // contador incremental sería un segundo sitio donde puede quedar mal, y el
  // fallo clásico de toda caja es el contador y el detalle discrepando.
  const { data: esperado } = await admin.rpc('saldo_caja', { p_caja_id: caja.id });

  const { data: movimientos } = await admin.from('movimientos_caja')
    .select('id, tipo, importe, metodo_pago, concepto, referencia, creado_en, creado_por_nombre')
    .eq('caja_id', caja.id).eq('studio_id', sesion.studioId)
    .order('creado_en', { ascending: false })
    .limit(200);

  return NextResponse.json({
    caja: {
      id: caja.id,
      fondoInicial: Number(caja.fondo_inicial ?? 0),
      abiertaEn: caja.abierta_en,
      abiertaPor: caja.abierta_por_nombre,
    },
    esperado: Number(esperado ?? 0),
    movimientos: (movimientos ?? []).map((m) => ({
      id: m.id, tipo: m.tipo, importe: Number(m.importe), metodoPago: m.metodo_pago,
      concepto: m.concepto, referencia: m.referencia, creadoEn: m.creado_en, creadoPor: m.creado_por_nombre,
    })),
  });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede tocar la caja' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const accion = body?.accion;

  const fallo = (error: { message: string }) => {
    const codigo = codigoDeErrorPg(error.message);
    const frase = mensajeErrorVenta(codigo);
    if (codigo && frase !== 'No se ha podido completar la operación. Inténtalo de nuevo.') {
      return NextResponse.json({ error: frase, codigo }, { status: 409 });
    }
    return errorInterno('pos:caja', error, 'No se ha podido completar la operación en la caja.');
  };

  if (accion === 'abrir') {
    const fondo = Number(body?.fondoInicial ?? 0);
    if (!Number.isFinite(fondo) || fondo < 0) {
      return NextResponse.json({ error: 'Ese fondo inicial no es válido.' }, { status: 400 });
    }
    const { data, error } = await admin.rpc('abrir_caja', {
      p_caja_id: `caja-${uid()}`, p_studio_id: sesion.studioId,
      p_fondo_inicial: fondo, p_por: sesion.userId, p_por_nombre: sesion.nombre,
    });
    if (error) return fallo(error);
    const fila = Array.isArray(data) ? data[0] : data;
    // `yaAbierta` no es un error: dos personas abriendo a la vez, o un doble
    // toque, reciben la caja que ya existe en vez de un fallo que no significa
    // nada para quien está en el mostrador.
    return NextResponse.json({ cajaId: fila?.r_caja_id, yaAbierta: fila?.r_ya_abierta === true });
  }

  if (accion === 'mover') {
    const tipo = body?.tipo === 'ENTRADA' || body?.tipo === 'SALIDA' ? body.tipo : null;
    const importe = Number(body?.importe ?? 0);
    const concepto = typeof body?.concepto === 'string' ? body.concepto.trim() : '';
    if (!tipo) return NextResponse.json({ error: 'Di si es una entrada o una salida.' }, { status: 400 });
    // Lista blanca antes de la BD: sin ella un valor inventado lo rechazaba el
    // CHECK de `movimientos_caja` y salía como 500 genérico, no como el 400
    // que es. Mismo criterio que `METODOS` en la ruta de venta.
    const metodoPago = typeof body?.metodoPago === 'string' ? body.metodoPago : 'EFECTIVO';
    if (!METODOS_CAJA.includes(metodoPago)) {
      return NextResponse.json({ error: 'Ese método de pago no es válido.' }, { status: 400 });
    }
    if (!Number.isFinite(importe) || importe <= 0) return NextResponse.json({ error: 'Ese importe no es válido.' }, { status: 400 });
    if (!concepto) return NextResponse.json({ error: 'Escribe de qué es el movimiento.' }, { status: 400 });

    const { data: caja } = await admin.from('cajas')
      .select('id').eq('studio_id', sesion.studioId).eq('estado', 'ABIERTA').maybeSingle();
    if (!caja) return NextResponse.json({ error: 'No hay ninguna caja abierta.' }, { status: 409 });

    const { data, error } = await admin.rpc('mover_caja', {
      p_movimiento_id: `mov-${uid()}`, p_studio_id: sesion.studioId, p_caja_id: caja.id,
      p_tipo: tipo, p_importe: importe, p_concepto: concepto,
      p_metodo_pago: metodoPago,
      p_por: sesion.userId, p_por_nombre: sesion.nombre,
    });
    if (error) return fallo(error);
    return NextResponse.json({ ok: true, saldo: Number(data ?? 0) });
  }

  if (accion === 'cerrar') {
    const contado = Number(body?.efectivoContado);
    if (!Number.isFinite(contado) || contado < 0) {
      return NextResponse.json({ error: 'Ese recuento no es válido.' }, { status: 400 });
    }
    const { data: caja } = await admin.from('cajas')
      .select('id').eq('studio_id', sesion.studioId).eq('estado', 'ABIERTA').maybeSingle();
    if (!caja) return NextResponse.json({ error: 'No hay ninguna caja abierta.' }, { status: 409 });

    const { data, error } = await admin.rpc('cerrar_caja', {
      p_caja_id: caja.id, p_studio_id: sesion.studioId, p_efectivo_contado: contado,
      p_notas: typeof body?.notas === 'string' ? body.notas : null,
      p_por: sesion.userId, p_por_nombre: sesion.nombre,
    });
    if (error) return fallo(error);
    const fila = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      esperado: Number(fila?.r_esperado ?? 0),
      contado: Number(fila?.r_contado ?? 0),
      diferencia: Number(fila?.r_diferencia ?? 0),
    });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
