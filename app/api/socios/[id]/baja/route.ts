import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarCalendario, puedeGestionarClientas } from '@/lib/permisos-reglas';
import { cambiarEstadoPlazaFijaStaff, ejecutarCancelacionReserva } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { esMotivoBaja, planDeBaja, type RespuestaBaja } from '@/lib/socios/baja';
import { hoyEnEstudio, uid } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Dar de baja a una clienta (POST) y volver a darla de alta (DELETE).
//
// «Desactivar» era un `activo = false` escrito desde el navegador y nada más: la
// cuota seguía ACTIVA, el cron de renovaciones le generaba el recibo del mes
// siguiente y el cobro diario se lo pasaba a la tarjeta. Aquí la baja hace lo
// que dice, en este orden:
//
//   1. Lo que tiene que ver con el dinero, con `planDeBaja` (lib/socios/baja.ts,
//      el mismo plan que enseña la ventana antes de confirmar): su cuota mensual
//      se queda sin renovar al vencer, o se cancela si ya había vencido o estaba
//      pausada. Si esto falla no se marca nada: 500, y repetir es seguro.
//   2. Sus plazas fijas pasan a BAJA por `cambiarEstadoPlazaFijaStaff`, el mismo
//      camino que quitar una plaza a mano (suelta lo que ya tenía reservado).
//   3. Si se pide, sus reservas futuras, por `ejecutarCancelacionReserva` y sin
//      penalización: no lo ha decidido ella clase a clase. Una a una, porque cada
//      cancelación puede darle la plaza a la siguiente de la lista de espera.
//      Las que no se puedan cancelar se cuentan en la respuesta, no se esconden.
//   4. Solo entonces `activo = false`.
//
// Es reversible: DELETE la vuelve a dar de alta. No deshace lo anterior —la
// cuota que ya no se renueva se vuelve a renovar quitando su baja programada en
// la ficha, como siempre— y la respuesta lo dice para que la pantalla lo cuente.
//
// Permiso: el de gestionar clientas, el que ya tenía el botón «Desactivar». No
// es mover dinero: parar una renovación protege a la clienta de un cargo. Para
// cancelar reservas hace falta además el de calendario (lo hace con service_role
// por encima de la RLS de `reservas`), como en /api/plazas-fijas/estado. El
// estudio sale de la sesión, nunca del body.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para dar de baja a una clienta.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-baja', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId } = await params;
  const body = (await req.json().catch(() => null)) as { cancelarReservas?: unknown; motivo?: unknown } | null;
  const cancelarReservas = body?.cancelarReservas === true;
  // El motivo es obligatorio y se comprueba ANTES de tocar nada.
  if (!esMotivoBaja(body?.motivo)) {
    return NextResponse.json({ error: 'Elige por qué se da de baja.' }, { status: 400 });
  }
  const motivo = body.motivo;
  if (cancelarReservas && !puedeGestionarCalendario(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para cancelar sus reservas.' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data: socia, error: errSocia } = await admin.from('socios')
      .select('id, nombre, apellidos')
      .eq('id', socioId).eq('studio_id', sesion.studioId).is('borrado_en', null)
      .maybeSingle();
    if (errSocia) return errorInterno('socios:baja:leer', errSocia, 'No se ha podido leer la ficha. Vuelve a intentarlo.');
    if (!socia) return NextResponse.json({ error: 'No se encuentra esta clienta.' }, { status: 404 });

    const [cuotasRes, plazasRes] = await Promise.all([
      admin.from('suscripciones')
        .select('id, plan_id, estado, fecha_fin')
        .eq('studio_id', sesion.studioId).eq('socio_id', socioId)
        .in('estado', ['ACTIVA', 'PAUSADA']),
      admin.from('plazas_fijas')
        .select('id, estado')
        .eq('studio_id', sesion.studioId).eq('socio_id', socioId)
        .neq('estado', 'BAJA'),
    ]);
    if (cuotasRes.error) return errorInterno('socios:baja:cuotas', cuotasRes.error, 'No se han podido leer sus planes. No se ha dado de baja.');
    if (plazasRes.error) return errorInterno('socios:baja:plazas', plazasRes.error, 'No se han podido leer sus plazas fijas. No se ha dado de baja.');

    const idsPlanes = [...new Set((cuotasRes.data ?? []).map(c => c.plan_id as string))];
    const { data: planes, error: errPlanes } = idsPlanes.length === 0
      ? { data: [], error: null }
      : await admin.from('planes_tarifa').select('id, nombre, tipo').eq('studio_id', sesion.studioId).in('id', idsPlanes);
    if (errPlanes) return errorInterno('socios:baja:planes', errPlanes, 'No se han podido leer sus planes. No se ha dado de baja.');

    const plan = planDeBaja(
      (cuotasRes.data ?? []).map(c => ({ id: c.id as string, planId: c.plan_id as string, estado: c.estado as string, fechaFin: (c.fecha_fin as string | null) ?? null })),
      (planes ?? []).map(p => ({ id: p.id as string, nombre: p.nombre as string, tipo: p.tipo as string })),
      (plazasRes.data ?? []).map(p => ({ id: p.id as string, estado: p.estado as 'ACTIVA' | 'PAUSADA' | 'BAJA' })),
      hoyEnEstudio(new Date()),
    );

    // 1) Dinero. Compare-and-set sobre el estado leído: lo que alguien haya
    //    cambiado entretanto no se pisa.
    if (plan.alVencer.length > 0) {
      const { error } = await admin.from('suscripciones')
        .update({ baja_al_vencer: true })
        .eq('studio_id', sesion.studioId).eq('socio_id', socioId).eq('estado', 'ACTIVA')
        .in('id', plan.alVencer.map(c => c.id));
      if (error) return errorInterno('socios:baja:al-vencer', error, 'No se ha podido parar la renovación de su cuota. No se ha dado de baja.');
    }
    if (plan.cancelarAhora.length > 0) {
      // El trigger de `suscripciones` aplica a sus recibos pendientes la
      // política del estudio (`recibos_al_cancelar_cuota`), igual que «Cancelar».
      const { error } = await admin.from('suscripciones')
        .update({ estado: 'CANCELADA' })
        .eq('studio_id', sesion.studioId).eq('socio_id', socioId).in('estado', ['ACTIVA', 'PAUSADA'])
        .in('id', plan.cancelarAhora.map(c => c.id));
      if (error) return errorInterno('socios:baja:cancelar', error, 'No se ha podido cancelar su cuota. No se ha dado de baja.');
    }

    // 2) Plazas fijas.
    const reservasDePlazaRetiradas: string[] = [];
    for (const plazaId of plan.plazas) {
      const r = await cambiarEstadoPlazaFijaStaff(admin, { studioId: sesion.studioId, plazaId, estado: 'BAJA' });
      if ('error' in r) {
        return errorInterno('socios:baja:plaza-fija', new Error(r.error), 'No se ha podido quitar su plaza fija. No se ha dado de baja; vuelve a intentarlo.');
      }
      reservasDePlazaRetiradas.push(...r.canceladas);
    }

    // 3) Reservas futuras, si se ha pedido.
    const reservasCanceladas: RespuestaBaja['reservasCanceladas'] = [];
    let reservasSinCancelar = 0;
    if (cancelarReservas) {
      const { data: futuras, error: errFuturas } = await admin.from('reservas')
        .select('id, sesion_id, sesiones!inner(inicio)')
        .eq('studio_id', sesion.studioId).eq('socio_id', socioId)
        .in('estado', ['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION'])
        .gt('sesiones.inicio', new Date().toISOString());
      if (errFuturas) return errorInterno('socios:baja:reservas', errFuturas, 'No se han podido leer sus reservas. No se ha dado de baja.');
      for (const r of futuras ?? []) {
        const res = await ejecutarCancelacionReserva(admin, {
          studioId: sesion.studioId, reservaId: r.id as string, socioId,
          omitirPenalizacion: true, otorgarRecuperacionPlazaFija: false,
        });
        if ('error' in res) {
          reservasSinCancelar++;
          console.error('[socios:baja] no se pudo cancelar una reserva futura', r.id, res.error);
        } else {
          reservasCanceladas.push({
            id: r.id as string, sesionId: r.sesion_id as string,
            promovidaSocioId: res.promovidaSocioId, ofertaSocioId: res.ofertaSocioId, ofertaExpiraEn: res.ofertaExpiraEn,
          });
        }
      }
    }

    // 4) El motivo (bajas_clienta, una abierta por socia). Si ya tenía una baja
    //    abierta —repetir la baja, o una que quedó a medias—, se actualiza esa:
    //    PostgREST no sabe apuntar a un índice único parcial con upsert.
    const baja = { motivo, baja_en: new Date().toISOString(), baja_por: sesion.userId };
    const { error: errMotivo } = await admin.from('bajas_clienta')
      .insert({ id: uid(), studio_id: sesion.studioId, socio_id: socioId, ...baja });
    if (errMotivo) {
      const yaAbierta = (errMotivo as { code?: string }).code === '23505';
      const { error: errActualizar } = yaAbierta
        ? await admin.from('bajas_clienta').update(baja)
          .eq('studio_id', sesion.studioId).eq('socio_id', socioId).is('alta_en', null)
        : { error: errMotivo };
      if (errActualizar) return errorInterno('socios:baja:motivo', errActualizar, 'Se ha parado su cuota pero no se ha podido guardar el motivo. No se ha dado de baja: vuelve a intentarlo.');
    }

    // 5) La marca.
    const { data: marcada, error: errMarca } = await admin.from('socios')
      .update({ activo: false })
      .eq('id', socioId).eq('studio_id', sesion.studioId).is('borrado_en', null)
      .select('id');
    if (errMarca) return errorInterno('socios:baja:marca', errMarca, 'Se ha parado su cuota pero no se ha podido marcar de baja. Vuelve a intentarlo.');
    if (!marcada || marcada.length === 0) return NextResponse.json({ error: 'No se encuentra esta clienta.' }, { status: 404 });

    await registrar(admin, sesion, socioId, `${sesion.nombre} dio de baja a ${nombreDe(socia)}`);

    const respuesta: RespuestaBaja = {
      ok: true,
      cuotasAlVencer: plan.alVencer.map(c => ({ id: c.id, plan: c.plan, fechaFin: c.fechaFin })),
      cuotasCanceladas: plan.cancelarAhora.map(c => ({ id: c.id, plan: c.plan })),
      plazasDadasDeBaja: plan.plazas,
      reservasDePlazaRetiradas,
      reservasCanceladas,
      reservasSinCancelar,
    };
    return NextResponse.json(respuesta);
  } catch (e) {
    return errorInterno('socios:baja', e, 'No se ha podido dar de baja. Vuelve a intentarlo.');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para dar de alta a una clienta.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'socios-baja', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id: socioId } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data, error } = await admin.from('socios')
      .update({ activo: true })
      .eq('id', socioId).eq('studio_id', sesion.studioId).is('borrado_en', null)
      .select('id, nombre, apellidos');
    if (error) return errorInterno('socios:alta', error, 'No se ha podido dar de alta. Vuelve a intentarlo.');
    const socia = data?.[0];
    if (!socia) return NextResponse.json({ error: 'No se encuentra esta clienta.' }, { status: 404 });

    // Lo que la baja dejó sin renovar sigue así: se le cuenta a quien la da de alta.
    const { data: sinRenovar, error: errCuotas } = await admin.from('suscripciones')
      .select('id')
      .eq('studio_id', sesion.studioId).eq('socio_id', socioId)
      .eq('estado', 'ACTIVA').eq('baja_al_vencer', true);
    if (errCuotas) console.error('[socios:alta] no se pudo leer si tiene cuotas sin renovar', errCuotas.message);

    // Su baja abierta se cierra (queda en su historia, con la fecha de la vuelta).
    // Si falla, se arregla sola en la siguiente baja: no deshace el alta.
    const { error: errCerrar } = await admin.from('bajas_clienta')
      .update({ alta_en: new Date().toISOString(), alta_por: sesion.userId })
      .eq('studio_id', sesion.studioId).eq('socio_id', socioId).is('alta_en', null);
    if (errCerrar) console.error('[socios:alta] no se pudo cerrar su baja abierta', errCerrar.message);

    await registrar(admin, sesion, socioId, `${sesion.nombre} volvió a dar de alta a ${nombreDe(socia)}`);
    return NextResponse.json({ ok: true, cuotasSinRenovar: (sinRenovar ?? []).length });
  } catch (e) {
    return errorInterno('socios:alta', e, 'No se ha podido dar de alta. Vuelve a intentarlo.');
  }
}

function nombreDe(s: { nombre?: unknown; apellidos?: unknown }): string {
  return `${(s.nombre as string | null) ?? ''} ${(s.apellidos as string | null) ?? ''}`.trim() || 'una clienta';
}

// Si falla la constancia no se deshace nada: lo importante ya está guardado.
async function registrar(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  sesion: { studioId: string; nombre: string },
  socioId: string,
  texto: string,
) {
  const { error } = await admin.from('actividad_reciente').insert({
    id: uid(), studio_id: sesion.studioId, tipo: 'SOCIA_EDITADA', texto,
    socio_id: socioId, enlace: `/clientas/${socioId}`, creado_en: new Date().toISOString(), actor_nombre: sesion.nombre,
  });
  if (error) console.error('[socios:baja] no se pudo registrar la actividad', error.message);
}
