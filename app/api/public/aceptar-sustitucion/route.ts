import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { sesionYaEmpezada, MENSAJE_CLASE_YA_EMPEZADA } from '@/lib/calendario-estado';
import { ultimaRespuestaDe, type ContactoFila } from '@/lib/sustituciones/traza';
import { avisarAlumnas } from '@/lib/sustituciones/avisos';
import { escalacionVigente, contactarDesde, alertarPropietaria, modoAutonomiaEfectivo } from '@/lib/sustituciones/contacto';
import { inngest, EVENTS } from '@/lib/inngest/client';

// Endpoint PÚBLICO (sin login): la candidata responde al deep link del email.
// 'aceptar' → confirmación atómica (RPC confirmar_sustitucion) + reasigna la clase.
// 'rechazar' → marca el contacto y devuelve la sustitución al panel de la dueña.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-aceptar-sustitucion', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { token?: string; accion?: string } | null;
  const claim = verificarTokenInstructora(body?.token, 'aceptar_sustitucion');
  if (!claim || !claim.ref) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sustitucionId = claim.ref;

  if (body?.accion === 'aceptar') {
    // Auditoría de producto (P0-3): `confirmar_sustitucion` autoriza a
    // CUALQUIER instructor_id que llegue con un token válido para esta
    // sustitución — no comprueba que sea la candidata a la que el motor le
    // preguntó por última vez. Esta comprobación existía SOLO en la página
    // SSR (app/aceptar-sustitucion/[token]/page.tsx, para pintar "ya nos
    // contestaste" en vez del formulario), nunca en el endpoint que de
    // verdad muta datos — así que reenviar/reabrir la petición POST tras
    // haber rechazado explícitamente podía confirmar la clase igual,
    // arrebatándosela a quien el motor ya movió como candidata actual, sin
    // ningún error visible. Mismo criterio que ya usa la SSR: `null` = nunca
    // respondió, sigue siendo legítimo aceptar.
    const { data: contactos } = await admin
      .from('sustitucion_contactos')
      .select('instructor_id, canal, estado, enviado_en, respondido_en')
      .eq('sustitucion_id', sustitucionId).eq('studio_id', claim.studioId).eq('instructor_id', claim.instructorId);
    const yaRespondio = ultimaRespuestaDe((contactos ?? []) as ContactoFila[]);
    if (yaRespondio) {
      return NextResponse.json({ ok: false, motivo: yaRespondio === 'rechazado' ? 'ya_rechazaste' : 'ya_aceptaste' }, { status: 409 });
    }

    // La RPC `confirmar_sustitucion` NO comprueba si la clase ya empezó (solo
    // revalida el solape de horario), y el token del email dura 3 h — justo la
    // ventana de una baja de última hora. Sin este guardia, aceptar a las 20:10
    // una clase de las 20:00 reasignaba `sesiones.instructor_id` de una clase ya
    // dada, la marcaba confirmada y disparaba `avisarAlumnas(..., 'cubierta')`
    // ("tu clase sigue en pie") a posteriori: un estado imposible, porque la
    // clase la dio otra persona. El camino de panel ya lo comprueba
    // (app/api/sustituciones/route.ts, action 'confirmar'); este no. Mismo
    // guardia, mismo mensaje, mismo 409.
    const { data: sust } = await admin
      .from('sustituciones').select('sesion_id').eq('id', sustitucionId).eq('studio_id', claim.studioId).maybeSingle();
    if (sust?.sesion_id) {
      const { data: ses } = await admin.from('sesiones').select('inicio').eq('id', sust.sesion_id).maybeSingle();
      if (ses && sesionYaEmpezada(ses.inicio as string)) {
        return NextResponse.json({ ok: false, motivo: 'clase_ya_empezada', error: MENSAJE_CLASE_YA_EMPEZADA }, { status: 409 });
      }
    }

    const { data, error } = await admin.rpc('confirmar_sustitucion', {
      p_sustitucion_id: sustitucionId,
      p_instructor_id: claim.instructorId,
      p_studio_id: claim.studioId,
      p_aprobada_por: null,
    });
    if (error) return errorInterno('public:aceptar-sustitucion', error,
      'No se ha podido registrar tu respuesta. Vuelve a abrir el enlace del email en unos segundos; si sigue fallando, avisa al estudio.');
    const r = (data ?? {}) as { ok?: boolean; motivo?: string; sesion_id?: string };
    if (!r.ok) {
      // Otra persona la cubrió antes (o se canceló) → 'ya_resuelta'. Si en el
      // hueco entre el email y este tap le surgió otra clase → 'conflicto_horario'
      // (0048): el token llega tarde igual, pero por un motivo distinto.
      return NextResponse.json({ ok: false, motivo: r.motivo ?? 'ya_resuelta' }, { status: 409 });
    }
    // Marca este contacto como aceptado.
    await admin.from('sustitucion_contactos')
      .update({ estado: 'aceptado', respondido_en: new Date().toISOString() })
      .eq('token', body?.token ?? '');

    // Avisa a las alumnas (si el estudio lo tiene activado): "tu clase sigue en pie".
    if (r.sesion_id) {
      const { data: cand } = await admin.from('instructores').select('nombre').eq('id', claim.instructorId).maybeSingle();
      await avisarAlumnas(admin, { sesionId: r.sesion_id, studioId: claim.studioId, tipo: 'cubierta', sustituta: cand?.nombre });
      // Notification Engine: in-app a la instructora que cubre ("nueva clase asignada").
      const { emitirSustitucionAceptada } = await import('@/lib/notifications/emit');
      await emitirSustitucionAceptada(admin, { studioId: claim.studioId, sesionId: r.sesion_id, instructorId: claim.instructorId });
    }
    return NextResponse.json({ ok: true });
  }

  if (body?.accion === 'rechazar') {
    await admin.from('sustitucion_contactos')
      .update({ estado: 'rechazado', respondido_en: new Date().toISOString() })
      .eq('token', body?.token ?? '');

    // El "no puedo" tiene que llegar a la propietaria SIEMPRE, no solo en modo
    // asistido: en autónomo el motor avanzaba a la siguiente candidata en
    // silencio absoluto y en el panel no aparecía absolutamente nada, así que
    // la propietaria no tenía forma de saber que su instructora había
    // contestado. Es aviso de campana (`canales: []` en el catálogo), no push:
    // en autónomo no hay nada que ella tenga que hacer — se le está contando,
    // no se le está pidiendo. Qué frase cierra el aviso lo decide cada camino.
    const { data: sus } = await admin.from('sustituciones')
      .select('sesion_id').eq('id', sustitucionId).eq('studio_id', claim.studioId).maybeSingle();
    const sesionId = (sus?.sesion_id as string | null) ?? null;
    const avisarRechazo = async (siguiente: string) => {
      if (!sesionId) return;
      const { emitirSustitucionRechazada } = await import('@/lib/notifications/emit');
      await emitirSustitucionRechazada(admin, {
        studioId: claim.studioId, sesionId, instructorId: claim.instructorId, sustitucionId, siguiente,
      });
    };

    // En modo AUTÓNOMO, un rechazo explícito debe AVANZAR al siguiente del ranking,
    // igual que el auto-avance por no responder. Antes se ponía SIEMPRE
    // pendiente_aprobacion: en autónomo el escalado se apagaba (exige 'contactando') y
    // nadie re-barría las pendiente_aprobacion → la clase se quedaba sin cubrir.
    // Paradoja: ignorar el email avanzaba; decir "no" explícito estancaba.
    const modo = await modoAutonomiaEfectivo(admin, claim.studioId);
    if (modo === 'autonomo' || modo === 'vacaciones') {
      const v = await escalacionVigente(admin, sustitucionId, claim.instructorId);
      // Solo si quien rechaza sigue siendo la candidata vigente (si el escalado ya
      // avanzó por su cuenta, no interferir).
      if (v.vigente) {
        const avance = await contactarDesde(admin, {
          sustitucionId, studioId: claim.studioId, sesion: v.sesion, ranking: v.ranking, desde: v.candidataIdx + 1,
        });
        if (avance.contactada) {
          // Nueva instancia de escalado para la siguiente candidata (igual que el worker).
          await inngest.send({
            name: EVENTS.SUSTITUCION_CONTACTADA,
            data: { sustitucionId, studioId: claim.studioId, instructorId: avance.instructorId, idx: avance.idx },
          });
          const { data: sig } = await admin.from('instructores')
            .select('nombre').eq('id', avance.instructorId).eq('studio_id', claim.studioId).maybeSingle();
          await avisarRechazo(sig?.nombre
            ? `Ya se lo hemos preguntado a ${sig.nombre}.`
            : 'Ya se lo hemos preguntado a la siguiente de la lista.');
          return NextResponse.json({ ok: true, rechazado: true, avanzada: true });
        }
        // Ranking agotado: marca 'agotada' (compare-and-set) y alerta a la dueña.
        await admin.from('sustituciones')
          .update({ estado: 'agotada' })
          .eq('id', sustitucionId).eq('studio_id', claim.studioId).eq('estado', 'contactando');
        // Las dos cosas, no una: `alertarPropietaria` sale por email/WhatsApp y
        // el aviso de campana no existe hasta aquí — no son el mismo canal.
        await avisarRechazo('No queda nadie más a quien preguntar.');
        await alertarPropietaria(admin, { studioId: claim.studioId, sesion: v.sesion, tipo: 'agotada' });
        return NextResponse.json({ ok: true, rechazado: true, agotada: true });
      }
      // El escalado ya había avanzado por su cuenta antes de este tap.
      await avisarRechazo('Ya estábamos preguntando a otra persona.');
      return NextResponse.json({ ok: true, rechazado: true });
    }

    // Asistido: devuelve la sustitución al panel para que la dueña elija a otra.
    await admin.from('sustituciones')
      .update({ estado: 'pendiente_aprobacion' })
      .eq('id', sustitucionId).eq('studio_id', claim.studioId).eq('estado', 'contactando');
    // Notification Engine: la dueña debe elegir a otra candidata.
    await avisarRechazo('Busca otra opción.');
    return NextResponse.json({ ok: true, rechazado: true });
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
}
