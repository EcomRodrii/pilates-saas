import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { ES_UUID, validarFechaSeguimiento } from '@/lib/clientas/seguimientos';
import { hoyEnEstudio } from '@/lib/utils';
import { cuentaDelEquipo } from '@/lib/clientas/equipo-servidor';

export const dynamic = 'force-dynamic';

// Marcar un seguimiento como hecho (o deshacerlo), moverlo de día o pasárselo a
// otra persona (PATCH), y borrarlo (DELETE). Solo seguimientos DE CLIENTAS
// (`socio_id` no nulo): las tareas sueltas de la API OAuth no se tocan desde aquí.
//
// Hecho/deshecho es un compare-and-set sobre el estado: repetir el clic, o dos
// personas marcándolo a la vez, no cambia nada la segunda vez.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para cambiar seguimientos.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'seguimientos', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id } = await params;
  const cuerpo = (await req.json().catch(() => null)) as { hecha?: unknown; venceEl?: unknown; asignadaA?: unknown } | null;
  const cambios: Record<string, unknown> = {};
  if (cuerpo?.venceEl !== undefined) {
    const f = validarFechaSeguimiento(cuerpo.venceEl, hoyEnEstudio(new Date()));
    if (!f.ok) return NextResponse.json({ error: f.error }, { status: 400 });
    cambios.vence_el = f.venceEl;
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    if (cuerpo?.asignadaA !== undefined) {
      // Una cuenta del equipo es un uuid: lo demás es un 400, no un error de Postgres (500).
      if (typeof cuerpo.asignadaA !== 'string' || !ES_UUID.test(cuerpo.asignadaA)) return NextResponse.json({ error: 'Elige a alguien del equipo.' }, { status: 400 });
      const puede = await cuentaDelEquipo(admin, sesion.studioId, cuerpo.asignadaA);
      if (puede === null) return errorInterno('seguimientos:equipo', new Error('lectura del equipo'), 'No se ha podido comprobar el equipo. Vuelve a intentarlo.');
      if (!puede) return NextResponse.json({ error: 'Esa persona no está en el equipo, o no gestiona clientas.' }, { status: 400 });
      cambios.asignada_a = cuerpo.asignadaA;
    }

    let estadoAntes: 'PENDIENTE' | 'HECHA' | null = null;
    if (cuerpo?.hecha === true) {
      Object.assign(cambios, { estado: 'HECHA', completado_en: new Date().toISOString(), hecha_por: sesion.userId });
      estadoAntes = 'PENDIENTE';
    } else if (cuerpo?.hecha === false) {
      Object.assign(cambios, { estado: 'PENDIENTE', completado_en: null, hecha_por: null });
      estadoAntes = 'HECHA';
    }
    if (Object.keys(cambios).length === 0) return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 });

    let q = admin.from('tareas').update(cambios)
      .eq('id', id).eq('studio_id', sesion.studioId).not('socio_id', 'is', null);
    if (estadoAntes) q = q.eq('estado', estadoAntes);
    const { data, error } = await q.select('id');
    if (error) return errorInterno('seguimientos:cambiar', error, 'No se ha podido guardar el cambio. Vuelve a intentarlo.');
    if (!data || data.length === 0) {
      // ¿Ya estaba como se pedía (doble clic, o lo marcó otra persona)? Entonces está bien.
      const { data: ya, error: errYa } = await admin.from('tareas')
        .select('estado').eq('id', id).eq('studio_id', sesion.studioId).not('socio_id', 'is', null).maybeSingle();
      if (errYa) return errorInterno('seguimientos:releer', errYa, 'No se ha podido comprobar el seguimiento.');
      if (!ya) return NextResponse.json({ error: 'Este seguimiento ya no existe.' }, { status: 404 });
      if (estadoAntes && ya.estado !== estadoAntes) return NextResponse.json({ ok: true, yaEstaba: true });
      return NextResponse.json({ error: 'No se ha podido guardar el cambio.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno('seguimientos:cambiar', e, 'No se ha podido guardar el cambio. Vuelve a intentarlo.');
  }
}

// Borrar: quien lo creó o la propietaria.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para borrar seguimientos.' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'seguimientos', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;

  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    let q = admin.from('tareas').delete().eq('id', id).eq('studio_id', sesion.studioId).not('socio_id', 'is', null);
    if (sesion.rol !== 'PROPIETARIO') q = q.eq('creada_por', sesion.userId);
    const { data, error } = await q.select('id');
    if (error) return errorInterno('seguimientos:borrar', error, 'No se ha podido borrar el seguimiento.');
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Este seguimiento no existe o lo creó otra persona: solo lo puede borrar ella o la propietaria.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorInterno('seguimientos:borrar', e, 'No se ha podido borrar el seguimiento.');
  }
}
