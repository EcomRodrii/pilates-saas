import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { avisarAlumnas } from '@/lib/sustituciones/avisos';
import { contactarCandidata, ESTADOS_EN_JUEGO, type RankingItem } from '@/lib/sustituciones/contacto';
import { crearBaja } from '@/lib/sustituciones/baja';
import {
  puedeRecalcular, filtrarYaRechazadas, estadoTrasRecalcular, resumenRecalculo,
} from '@/lib/sustituciones/recalculo';

// Emite el evento de escalado. Best-effort: si el bus de Inngest falla, el contacto
// ya se hizo (email enviado) — el escalado es una capa de resiliencia encima, no
// debe tumbar la petición del usuario.
async function emitirEscalado(data: { sustitucionId: string; studioId: string; instructorId: string; idx: number }) {
  try {
    await inngest.send({ name: EVENTS.SUSTITUCION_CONTACTADA, data });
  } catch (e) {
    console.error('[sustituciones] no se pudo emitir el evento de escalado', e);
  }
}

// POST /api/sustituciones — marcar una baja: "no puedo dar esta clase".
// El motor (idempotencia, scoring, modo de autonomía, arranque del escalado)
// vive en lib/sustituciones/baja.ts, compartido con la vía pública por la que
// la propia instructora se da de baja desde el móvil. Aquí solo queda el
// control de acceso: quién puede pedirlo.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { sesionId?: string; motivo?: string } | null;
  const sesionId = typeof body?.sesionId === 'string' ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase (sesionId)' }, { status: 400 });

  const r = await crearBaja(admin, {
    studioId: sesion.studioId,
    sesionId,
    motivo: body?.motivo ?? null,
    origen: 'panel',
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ sustitucion: r.sustitucion, yaExistia: r.yaExistia });
}

// GET /api/sustituciones — lista las sustituciones del estudio (activas +
// resueltas recientes) con el ranking y los datos de la clase, para el panel.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('sustituciones')
    .select('id, estado, motivo, origen, creado_en, resuelto_en, instructor_original_id, sustituta_final_id, ranking, sesion_id, sesiones(inicio, fin, tipo_clase_id, cancelada)')
    .eq('studio_id', sesion.studioId)
    .order('creado_en', { ascending: false })
    .limit(50);

  if (error) return errorInterno('sustituciones:listar', error,
    'No se ha podido cargar el listado de sustituciones. Recarga la página.');

  const lista = data ?? [];

  // Traza de contactos: a quién se avisó, por qué canal y qué contestó. En una
  // consulta aparte (no embebida) a propósito: si esta falla, el panel se queda
  // sin traza pero SIGUE funcionando. Embebida, un fallo tumbaría toda la página
  // de Sustituciones — un extra informativo no puede llevarse por delante la
  // herramienta con la que se resuelve una baja.
  const ids = lista.map((s) => s.id);
  const contactosPorSust = new Map<string, unknown[]>();
  if (ids.length > 0) {
    const { data: contactos, error: errCont } = await admin
      .from('sustitucion_contactos')
      .select('sustitucion_id, instructor_id, canal, estado, enviado_en, respondido_en')
      .eq('studio_id', sesion.studioId)
      .in('sustitucion_id', ids)
      .order('enviado_en', { ascending: true });
    if (errCont) {
      console.error('[sustituciones] no se pudo cargar la traza de contactos', errCont);
    } else {
      for (const c of contactos ?? []) {
        const arr = contactosPorSust.get(c.sustitucion_id) ?? [];
        arr.push(c);
        contactosPorSust.set(c.sustitucion_id, arr);
      }
    }
  }

  const { data: estudio } = await admin
    .from('studios').select('avisar_alumnas').eq('id', sesion.studioId).maybeSingle();

  // Diagnóstico del equipo: quién es INVISIBLE para el ranking por no tener
  // ninguna franja en `instructora_disponibilidad`. `rankear_candidatas` (0038)
  // las excluye, así que sin esto el panel enseña "ninguna candidata" sin decir
  // que a media plantilla ni se la ha mirado. Dos consultas simples en vez de un
  // join: el equipo de un estudio cabe de sobra en memoria.
  const equipo = await diagnosticarEquipo(admin, sesion.studioId);

  return NextResponse.json({
    sustituciones: lista.map((s) => ({ ...s, sustitucion_contactos: contactosPorSust.get(s.id) ?? [] })),
    avisarAlumnas: !!estudio?.avisar_alumnas,
    equipo,
  });
}

// PATCH /api/sustituciones — confirmar una candidata (aceptación atómica) o
// descartar la sustitución ("resuelto fuera del sistema").
export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    { sustitucionId?: string; action?: string; instructorId?: string; avisar?: boolean; inicio?: string } | null;

  // Toggle de "avisar a alumnas" (ajuste del estudio, no necesita sustitución).
  if (body?.action === 'config_avisar') {
    if (typeof body?.avisar !== 'boolean') return NextResponse.json({ error: 'Falta el valor' }, { status: 400 });
    if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'Solo la propietaria' }, { status: 403 });
    const { error } = await admin.from('studios').update({ avisar_alumnas: body.avisar }).eq('id', sesion.studioId);
    if (error) return errorInterno('sustituciones:config_avisar', error,
      'No se ha podido guardar el ajuste de avisos. Vuelve a intentarlo.');
    return NextResponse.json({ ok: true, avisarAlumnas: body.avisar });
  }

  const sustitucionId = typeof body?.sustitucionId === 'string' ? body.sustitucionId : null;
  if (!sustitucionId) return NextResponse.json({ error: 'Falta sustitucionId' }, { status: 400 });

  if (body?.action === 'confirmar') {
    const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
    if (!instructorId) return NextResponse.json({ error: 'Falta la candidata (instructorId)' }, { status: 400 });

    // Aceptación atómica + reasignación de la clase, en una transacción (función
    // 0040, con re-check de solape por exclusion constraint desde 0048).
    const { data, error } = await admin.rpc('confirmar_sustitucion', {
      p_sustitucion_id: sustitucionId,
      p_instructor_id: instructorId,
      p_studio_id: sesion.studioId,
      p_aprobada_por: sesion.userId,
    });
    if (error) return errorInterno('sustituciones:confirmar', error,
      'No se ha podido confirmar la sustituta. La clase sigue sin cubrir; inténtalo de nuevo.');
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; sesion_id?: string };
    if (!r.ok) {
      const mensaje = r.motivo === 'conflicto_horario'
        ? 'No se puede: esta instructora ya tiene otra clase en ese horario. Elige otra candidata.'
        : 'Esta sustitución ya está resuelta';
      return NextResponse.json({ error: mensaje, ...r }, { status: 409 });
    }

    // Aviso a las alumnas (si el estudio lo tiene activado): "tu clase sigue en pie".
    let alumnas = { avisadas: 0, total: 0, skipped: false, desactivado: true };
    if (r.sesion_id) {
      const { data: cand } = await admin.from('instructores').select('nombre').eq('id', instructorId).maybeSingle();
      alumnas = await avisarAlumnas(admin, {
        sesionId: r.sesion_id, studioId: sesion.studioId, tipo: 'cubierta', sustituta: cand?.nombre,
      });
    }
    return NextResponse.json({ ...r, alumnas });
  }

  if (body?.action === 'reprogramar') {
    // Tercera salida cuando no hay sustituta: mover la clase a un horario en el
    // que la instructora original SÍ pueda — la clase se salva, la plaza de las
    // alumnas se mantiene y se les avisa del cambio.
    const inicioNuevo = typeof body?.inicio === 'string' ? new Date(body.inicio) : null;
    if (!inicioNuevo || Number.isNaN(inicioNuevo.getTime())) {
      return NextResponse.json({ error: 'Falta la nueva fecha y hora' }, { status: 400 });
    }
    if (inicioNuevo.getTime() < Date.now()) {
      return NextResponse.json({ error: 'La nueva fecha debe ser futura' }, { status: 400 });
    }

    const { data: sust } = await admin
      .from('sustituciones').select('id, estado, sesion_id')
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!sust) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });
    if (!ESTADOS_EN_JUEGO.includes(sust.estado as string)) {
      return NextResponse.json({ error: 'Esta sustitución ya está resuelta' }, { status: 409 });
    }

    const { data: ses } = await admin
      .from('sesiones').select('inicio, fin')
      .eq('id', sust.sesion_id).eq('studio_id', sesion.studioId).maybeSingle();
    if (!ses) return NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 });

    // El horario ORIGINAL, formateado ANTES de moverla (va en el email).
    const cuandoAntes = new Date(ses.inicio).toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid',
    }) + ' · ' + new Date(ses.inicio).toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
    });

    // Misma duración, nuevo hueco. Las exclusion constraints (0048 instructora,
    // 0071 sala) re-validan el hueco de forma atómica: si choca, 23P01.
    const duracionMs = new Date(ses.fin).getTime() - new Date(ses.inicio).getTime();
    const finNuevo = new Date(inicioNuevo.getTime() + duracionMs);
    const upd = await admin.from('sesiones')
      .update({ inicio: inicioNuevo.toISOString(), fin: finNuevo.toISOString() })
      .eq('id', sust.sesion_id).eq('studio_id', sesion.studioId).select('id');
    if (upd.error) {
      if (upd.error.code === '23P01') {
        return NextResponse.json(
          { error: 'En ese horario la instructora o la sala ya tienen otra clase. Prueba con otro hueco.' },
          { status: 409 },
        );
      }
      return errorInterno('sustituciones:reprogramar:mover-sesion', upd.error,
        'No se ha podido mover la clase. Vuelve a intentarlo.');
    }
    if (!upd.data || upd.data.length === 0) {
      return NextResponse.json({ error: 'No se pudo mover la clase. Recarga la página.' }, { status: 409 });
    }

    // La clase movida ya no necesita sustituta en el hueco viejo: se cierra
    // como resuelta fuera del motor. Si esto falla, la clase YA está movida —
    // se avisa a las alumnas igualmente y se pide recargar.
    const marc = await admin.from('sustituciones')
      .update({ estado: 'resuelta_fuera', resuelto_en: new Date().toISOString() })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).select('id');

    const alumnas = await avisarAlumnas(admin, {
      sesionId: sust.sesion_id as string, studioId: sesion.studioId, tipo: 'reprogramada', cuandoAntes,
    });

    if (marc.error) {
      return errorInterno('sustituciones:reprogramar:marcar-sustitucion', marc.error,
        'La clase se movió y avisamos a las alumnas, pero no se ha podido cerrar la sustitución. Recarga la página.');
    }
    return NextResponse.json({ ok: true, alumnas });
  }

  if (body?.action === 'cancelar_clase') {
    // No hay sustituta posible: cancela la clase y avisa a las alumnas (que se
    // enteren por el estudio, no en la puerta — el miedo nº1 de la propietaria).
    const { data: sust } = await admin
      .from('sustituciones').select('id, estado, sesion_id')
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!sust) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });

    // Cancelar manda un email a TODAS las alumnas: si la escritura falla, no se
    // puede seguir como si nada y avisarlas de una cancelación que no ha pasado.
    const canc = await admin.from('sesiones')
      .update({ cancelada: true }).eq('id', sust.sesion_id).eq('studio_id', sesion.studioId).select('id');
    if (canc.error) return errorInterno('sustituciones:cancelar_clase:cancelar-sesion', canc.error,
      'No se ha podido cancelar la clase. Recarga la página.');
    if (!canc.data || canc.data.length === 0) {
      return NextResponse.json({ error: 'No se pudo cancelar la clase. Recarga la página.' }, { status: 409 });
    }

    const marc = await admin.from('sustituciones')
      .update({ estado: 'sin_sustituta', resuelto_en: new Date().toISOString() })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).select('id');
    if (marc.error) return errorInterno('sustituciones:cancelar_clase:marcar-sustitucion', marc.error,
      'La clase se canceló, pero no se ha podido cerrar la sustitución. Recarga la página.');

    const alumnas = await avisarAlumnas(admin, {
      sesionId: sust.sesion_id as string, studioId: sesion.studioId, tipo: 'cancelada',
    });
    return NextResponse.json({ ok: true, alumnas });
  }

  if (body?.action === 'contactar') {
    const instructorId = typeof body?.instructorId === 'string' ? body.instructorId : null;
    if (!instructorId) return NextResponse.json({ error: 'Falta la candidata (instructorId)' }, { status: 400 });

    // Sustitución activa de este estudio + la clase.
    const { data: sust } = await admin
      .from('sustituciones')
      .select('id, estado, ranking, sesion_id, sesiones(inicio, tipo_clase_id)')
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!sust) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });
    if (!ESTADOS_EN_JUEGO.includes(sust.estado as string)) {
      return NextResponse.json({ error: 'Esta sustitución ya está resuelta' }, { status: 409 });
    }

    // Índice de la candidata dentro del ranking (0 si no aparece, p.ej. elección manual).
    const ranking = (Array.isArray(sust.ranking) ? sust.ranking : []) as RankingItem[];
    const idx = Math.max(0, ranking.findIndex(c => c.instructor_id === instructorId));
    const ses = (Array.isArray(sust.sesiones) ? sust.sesiones[0] : sust.sesiones) as
      { inicio: string; tipo_clase_id: string | null } | null;

    // Contacta (marca contactando + registra intento + email) vía helper compartido.
    const r = await contactarCandidata(admin, {
      sustitucionId, studioId: sesion.studioId, instructorId, idx, sesion: ses,
    });
    if (!r.ok && r.motivo === 'sin_email') {
      return NextResponse.json({ error: `${r.candidata ?? 'Esta candidata'} no tiene email. Añádeselo en Equipo para poder avisarla.` }, { status: 422 });
    }
    if (!r.ok) return NextResponse.json({ error: 'No se pudo avisar a la candidata' }, { status: 422 });

    // Arranca el escalado (recordatorio → WhatsApp → alerta/avance).
    await emitirEscalado({ sustitucionId, studioId: sesion.studioId, instructorId, idx });

    return NextResponse.json({
      ok: true,
      candidata: r.candidata,
      emailEnviado: r.emailEnviado,
      emailSkipped: r.emailSkipped,
    });
  }

  // "Volver a buscar": recalcula el ranking de una baja que ya existe. Hace
  // falta porque el ranking se congela al crearla: si el equipo no tenía la
  // disponibilidad cargada, la baja se quedaba en "ninguna candidata" para
  // siempre aunque después se arreglara.
  if (body?.action === 'recalcular') {
    const { data: sust } = await admin
      .from('sustituciones').select('id, estado, ranking, sesion_id')
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!sust) return NextResponse.json({ error: 'Sustitución no encontrada' }, { status: 404 });

    const rankingActual = (Array.isArray(sust.ranking) ? sust.ranking : []) as RankingItem[];
    const permiso = puedeRecalcular(sust.estado as string, rankingActual.length > 0);
    if (!permiso.ok) {
      return NextResponse.json({
        error: permiso.motivo === 'contactando'
          ? 'Ya estamos avisando a una candidata. Espera su respuesta antes de volver a buscar.'
          : 'Esta sustitución ya está resuelta.',
      }, { status: 409 });
    }

    const { data: nuevo, error: errRank } = await admin.rpc('rankear_candidatas', { p_sesion_id: sust.sesion_id });
    if (errRank) return errorInterno('sustituciones:recalcular:rankear', errRank,
      'No se ha podido recalcular las candidatas. Inténtalo de nuevo.');

    // Quien ya dijo que no puede para ESTA clase no vuelve a la lista: volver a
    // escribirle es la vía rápida a que ignore los avisos del sistema.
    const { data: rechazos } = await admin
      .from('sustitucion_contactos').select('instructor_id')
      .eq('sustitucion_id', sustitucionId).eq('estado', 'rechazado');
    const rechazadas = Array.from(new Set((rechazos ?? []).map(r => r.instructor_id as string)));

    const antes = rankingActual;
    const ranking = filtrarYaRechazadas(
      (Array.isArray(nuevo) ? nuevo : []) as RankingItem[],
      rechazadas,
    );
    const estado = estadoTrasRecalcular(sust.estado as string, ranking.length);

    const { data: act, error: errUpd } = await admin
      .from('sustituciones')
      .update({ ranking, estado, candidata_actual: 0 })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId)
      .eq('estado', sust.estado)   // compare-and-set: nadie ha tocado nada entretanto
      .select('id');
    if (errUpd) return errorInterno('sustituciones:recalcular:actualizar', errUpd,
      'No se ha podido guardar el nuevo ranking. Inténtalo de nuevo.');
    if (!act || act.length === 0) {
      return NextResponse.json({ error: 'La sustitución ha cambiado mientras buscábamos. Recarga la página.' }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      candidatas: ranking.length,
      resumen: resumenRecalculo(antes.length, ranking.length),
      omitidasPorRechazo: rechazadas.length,
    });
  }

  if (body?.action === 'descartar') {
    // `.select()` para saber CUÁNTAS filas ha tocado el compare-and-set. Sin él,
    // un update que no encaja con ninguna fila (sustitución ya resuelta, o de
    // otro estudio) devolvía `ok:true` y el panel daba por hecho que funcionó:
    // la tarjeta seguía ahí y no había forma de saber por qué.
    const { data, error } = await admin
      .from('sustituciones')
      .update({ estado: 'resuelta_fuera', resuelto_en: new Date().toISOString() })
      .eq('id', sustitucionId).eq('studio_id', sesion.studioId)
      .in('estado', ESTADOS_EN_JUEGO)
      .select('id');
    if (error) return errorInterno('sustituciones:descartar', error,
      'No se ha podido descartar la sustitución. Vuelve a intentarlo.');
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Esta sustitución ya está resuelta. Recarga la página.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}

/**
 * Instructoras activas del estudio que NO tienen ninguna franja de disponibilidad
 * cargada. Son las que `rankear_candidatas` descarta de entrada, así que nunca
 * aparecerán como candidatas y la propietaria no tendría forma de saber por qué.
 *
 * Best-effort: si esto falla, el panel se queda sin el aviso pero sigue
 * funcionando — es información de apoyo, no la herramienta.
 */
async function diagnosticarEquipo(
  admin: ReturnType<typeof getSupabaseAdmin> & {},
  studioId: string,
): Promise<{ total: number; sinDisponibilidad: { id: string; nombre: string }[] }> {
  try {
    const [{ data: activas }, { data: franjas }] = await Promise.all([
      admin.from('instructores').select('id, nombre').eq('studio_id', studioId).eq('activo', true),
      admin.from('instructora_disponibilidad').select('instructor_id').eq('studio_id', studioId),
    ]);

    const conDisponibilidad = new Set((franjas ?? []).map((f) => f.instructor_id as string));
    const lista = activas ?? [];
    return {
      total: lista.length,
      sinDisponibilidad: lista
        .filter((i) => !conDisponibilidad.has(i.id as string))
        .map((i) => ({ id: i.id as string, nombre: (i.nombre as string) ?? '' })),
    };
  } catch (e) {
    console.error('[sustituciones] no se pudo diagnosticar el equipo', e);
    return { total: 0, sinDisponibilidad: [] };
  }
}
