import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Todo lo que el TPV necesita para arrancar, en UNA petición.
//
// Antes el POS se servía de `useStudio()`, que carga el estudio ENTERO en el
// navegador — incluida `ventas_pos` completa y paginada (supabase-data.ts:4747).
// Un estudio con años de histórico descargaba miles de ventas para pintar la
// cifra del día. Aquí van solo el catálogo, la caja abierta y el resumen de
// hoy; el histórico se pide aparte y paginado.
//
// ─── El catálogo son DOS fuentes, no una ──────────────────────────────────
// `productos_pos` es el género físico del mostrador. Los bonos, las cuotas y
// las clases sueltas salen de `planes_tarifa`, que es su catálogo canónico y
// el que ya usa el resto del producto. El TPV los presenta juntos, pero por
// debajo cada uno sigue siendo lo que era — por eso vender un bono aquí crea
// la MISMA suscripción que venderlo desde la ficha de la clienta.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede usar el TPV' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const desdeHoy = new Date();
  desdeHoy.setHours(0, 0, 0, 0);

  const [prodRes, planRes, studioRes, cajaRes, hoyRes] = await Promise.all([
    admin.from('productos_pos')
      .select('id, nombre, descripcion, categoria, precio, activo, stock, stock_minimo, iva_pct, imagen_url, sku, codigo_barras, orden')
      .eq('studio_id', sesion.studioId)
      .order('orden', { ascending: true, nullsFirst: false })
      .order('nombre'),
    admin.from('planes_tarifa')
      .select('id, nombre, descripcion, precio, tipo, sesiones, validez_dias, activo')
      .eq('studio_id', sesion.studioId).eq('activo', true)
      .order('tipo').order('precio'),
    admin.from('studios').select('iva_por_defecto, stripe_account_id, stripe_terminal_reader_id')
      .eq('id', sesion.studioId).maybeSingle(),
    admin.from('cajas').select('id, fondo_inicial, abierta_en, abierta_por_nombre')
      .eq('studio_id', sesion.studioId).eq('estado', 'ABIERTA').maybeSingle(),
    admin.from('ventas_pos')
      .select('id, numero, total, metodo_pago, realizada_en, socio_id, estado')
      .eq('studio_id', sesion.studioId).eq('estado', 'PAGADA')
      .gte('realizada_en', desdeHoy.toISOString())
      .order('realizada_en', { ascending: false }),
  ]);

  const ivaDefecto = Number(studioRes.data?.iva_por_defecto ?? 21);
  const ventasHoy = hoyRes.data ?? [];

  // El resumen se agrega EN SERVIDOR. Un `.filter().reduce()` en el navegador
  // sobre la tabla entera es lo que hacía el TPV anterior, y es lo que obligaba
  // a descargarla entera.
  const porMetodo = new Map<string, { n: number; total: number }>();
  let totalHoy = 0;
  for (const v of ventasHoy) {
    const t = Number(v.total ?? 0);
    totalHoy += t;
    const prev = porMetodo.get(v.metodo_pago) ?? { n: 0, total: 0 };
    porMetodo.set(v.metodo_pago, { n: prev.n + 1, total: Math.round((prev.total + t) * 100) / 100 });
  }

  return NextResponse.json({
    ivaDefecto,
    // El TPV necesita saber si puede ofrecer datáfono y Bizum ANTES de que
    // alguien lo pulse: un método que va a fallar no debe pintarse como
    // disponible.
    cobro: {
      stripeConectado: Boolean(studioRes.data?.stripe_account_id),
      datafonoEmparejado: Boolean(studioRes.data?.stripe_terminal_reader_id),
    },
    productos: (prodRes.data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      categoria: p.categoria,
      precio: Number(p.precio),
      activo: p.activo !== false,
      // `null` = no controla stock. Se transmite tal cual: convertirlo a 0
      // aquí haría que un servicio se pintara como agotado.
      stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
      stockMinimo: Number(p.stock_minimo ?? 0),
      // Se resuelve la herencia aquí, una vez, para que el TPV no tenga que
      // saber que existe un default de estudio.
      ivaPct: p.iva_pct === null || p.iva_pct === undefined ? ivaDefecto : Number(p.iva_pct),
      imagenUrl: p.imagen_url,
      sku: p.sku,
      codigoBarras: p.codigo_barras,
    })),
    planes: (planRes.data ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: Number(p.precio),
      tipo: p.tipo,
      sesiones: p.sesiones,
      validezDias: p.validez_dias,
      ivaPct: ivaDefecto,
    })),
    caja: cajaRes.data ? {
      id: cajaRes.data.id,
      fondoInicial: Number(cajaRes.data.fondo_inicial ?? 0),
      abiertaEn: cajaRes.data.abierta_en,
      abiertaPor: cajaRes.data.abierta_por_nombre,
    } : null,
    hoy: {
      ventas: ventasHoy.length,
      total: Math.round(totalHoy * 100) / 100,
      ticketMedio: ventasHoy.length ? Math.round((totalHoy / ventasHoy.length) * 100) / 100 : 0,
      porMetodo: [...porMetodo.entries()].map(([metodo, v]) => ({ metodo, ...v })),
      ultimas: ventasHoy.slice(0, 10).map((v) => ({
        id: v.id, numero: v.numero, total: Number(v.total), metodoPago: v.metodo_pago,
        realizadaEn: v.realizada_en, socioId: v.socio_id,
      })),
    },
  });
}
