import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { calcularReversion, huellaDe, type Snapshot, type SuscripcionActual } from '@/lib/billing/preview-reversion';

// Resuelve una devolución pendiente: o se deshace lo que entregó el cobro, o se
// descarta explícitamente.
//
// ⚠️ DESCARTAR no es "ignorar": es una decisión que queda escrita, y tiene que
// ser tan fácil de pulsar como revertir. El caso más frecuente de reembolso es
// el doble cargo, y ahí revertir sería quitarle a la socia sesiones que sí pagó.
//
// El resultado NO se recibe del cliente: se recalcula aquí con el mismo módulo
// puro que pintó la vista previa, y si no coincide con la huella que se envió,
// se responde 409 con los números nuevos en vez de escribir algo que la
// propietaria nunca llegó a ver.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // La ruta usa service-role (se salta la RLS), así que el rol se comprueba
  // aquí. Mismo criterio que penalizaciones/aprobar y charge-off-session.
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede resolver devoluciones' }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as
    { devolucionId?: string; accion?: 'REVERTIR' | 'DESCARTAR'; huella?: string } | null;
  if (!body?.devolucionId || (body.accion !== 'REVERTIR' && body.accion !== 'DESCARTAR')) {
    return NextResponse.json({ error: 'Petición incompleta' }, { status: 400 });
  }

  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Service role no configurada' }, { status: 503 });

  // Acotado por el estudio de la SESIÓN, nunca por lo que diga el cuerpo.
  const { data: dev } = await admin
    .from('devoluciones')
    .select('id, recibo_id, suscripcion_id, estado')
    .eq('id', body.devolucionId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!dev) return NextResponse.json({ error: 'Devolución no encontrada' }, { status: 404 });
  // Guard de estado: impide que un doble clic aplique la reversión dos veces.
  if (dev.estado !== 'PENDIENTE_REVISION') {
    return NextResponse.json({ error: 'Esta devolución ya está resuelta' }, { status: 409 });
  }

  const marcar = (estado: string, aplicado: unknown = null) =>
    admin.from('devoluciones').update({
      estado, aplicado, resuelta_en: new Date().toISOString(), resuelta_por: sesion.userId ?? null,
    }).eq('id', dev.id).eq('studio_id', sesion.studioId).eq('estado', 'PENDIENTE_REVISION');

  if (body.accion === 'DESCARTAR') {
    await marcar('DESCARTADA');
    return NextResponse.json({ ok: true, accion: 'DESCARTADA' });
  }

  // ── Revertir ──────────────────────────────────────────────────────────────
  const [{ data: rec }, { data: sus }] = await Promise.all([
    admin.from('recibos')
      .select('entrega_tipo, entrega_aplicada, entrega_sesiones_antes, entrega_sesiones_despues, entrega_fecha_fin_antes, entrega_fecha_fin_despues, entrega_estado_antes')
      .eq('id', dev.recibo_id).eq('studio_id', sesion.studioId).maybeSingle(),
    dev.suscripcion_id
      ? admin.from('suscripciones').select('sesiones_restantes, fecha_fin, estado')
          .eq('id', dev.suscripcion_id).eq('studio_id', sesion.studioId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const snapshot: Snapshot = {
    tipo: (rec?.entrega_tipo ?? null) as Snapshot['tipo'],
    aplicada: (rec?.entrega_aplicada ?? null) as boolean | null,
    sesionesAntes: (rec?.entrega_sesiones_antes ?? null) as number | null,
    sesionesDespues: (rec?.entrega_sesiones_despues ?? null) as number | null,
    fechaFinAntes: (rec?.entrega_fecha_fin_antes ?? null) as string | null,
    fechaFinDespues: (rec?.entrega_fecha_fin_despues ?? null) as string | null,
    estadoAntes: (rec?.entrega_estado_antes ?? null) as string | null,
  };
  const actual: SuscripcionActual | null = sus ? {
    sesionesRestantes: (sus.sesiones_restantes ?? null) as number | null,
    fechaFin: (sus.fecha_fin ?? null) as string | null,
    estado: (sus.estado ?? null) as string | null,
  } : null;

  const reversion = calcularReversion({ snapshot, actual });

  // La suscripción pudo moverse entre que se pintó la card y se pulsó el botón.
  // Se responde con los números nuevos para que la propietaria vuelva a decidir,
  // en vez de escribir algo distinto de lo que vio.
  if (body.huella && body.huella !== huellaDe(reversion)) {
    return NextResponse.json({
      error: 'La suscripción ha cambiado desde que se te mostró. Vuelve a revisarlo.',
      recalculo: reversion,
    }, { status: 409 });
  }

  if (!reversion.posible || !reversion.objetivo) {
    // No es un error del llamante: es que ya no procede. Queda escrito POR QUÉ.
    const estado = reversion.motivo === 'SIN_INSTRUMENTAR' ? 'OMITIDA_SIN_INSTRUMENTAR'
      : reversion.motivo === 'ESTADO_CAMBIADO' ? 'OMITIDA_ESTADO_CAMBIADO'
      : 'OMITIDA_SIN_ENTREGA';
    await marcar(estado);
    return NextResponse.json({ ok: true, accion: estado, motivo: reversion.motivo });
  }

  const cambio: Record<string, unknown> = {};
  if (reversion.objetivo.sesionesRestantes !== undefined) cambio.sesiones_restantes = reversion.objetivo.sesionesRestantes;
  if (reversion.objetivo.fechaFin !== undefined) cambio.fecha_fin = reversion.objetivo.fechaFin;
  if (reversion.objetivo.estado !== undefined) cambio.estado = reversion.objetivo.estado;

  // ⚠️ `.select('id')` obligatorio: un UPDATE que no casa NINGUNA fila no da
  // error en Supabase (auditoría 22ª pasada, D-6). Sin esto, si la suscripción
  // desapareció entre la lectura de arriba y esta escritura, la devolución
  // quedaba marcada REVERTIDA con un `aplicado` que describe algo que nunca se
  // escribió: el panel decía que se retiraron las sesiones, la socia las
  // conservaba, y nada lo señalaba.
  const { data: revertidas, error } = await admin.from('suscripciones').update(cambio)
    .eq('id', dev.suscripcion_id).eq('studio_id', sesion.studioId).select('id');
  if (error || !revertidas?.length) {
    console.error('[devoluciones] no se pudo revertir la entrega', dev.id, error?.message ?? 'sin filas afectadas');
    return NextResponse.json({ error: 'No se ha podido revertir. Inténtalo de nuevo.' }, { status: 500 });
  }

  // `aplicado` guarda lo que se escribió DE VERDAD: sin esto, un "REVERTIDA" no
  // dice cuánto se quitó ni sobre qué números se decidió.
  await marcar('REVERTIDA', { objetivo: reversion.objetivo, consumidasDesde: reversion.consumidasDesde });
  return NextResponse.json({ ok: true, accion: 'REVERTIDA', objetivo: reversion.objetivo });
}
