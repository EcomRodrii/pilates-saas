import type { SupabaseClient } from '@supabase/supabase-js';
import { sesionYaEmpezada, MENSAJE_CLASE_YA_EMPEZADA } from '@/lib/calendario-estado';
import { ultimaRespuestaDe, type ContactoFila } from '@/lib/sustituciones/traza';
import { avisarAlumnas } from '@/lib/sustituciones/avisos';
import { escalacionVigente, contactarDesde, alertarPropietaria, modoAutonomiaEfectivo } from '@/lib/sustituciones/contacto';
import { inngest, EVENTS } from '@/lib/inngest/client';

// «La cubro» / «No puedo» a una sustitución. Un solo núcleo para las dos puertas
// por las que llega la respuesta:
//   - el enlace del email (`app/api/public/aceptar-sustitucion`), sin login: el
//     token firmado prueba quién es y que se le preguntó;
//   - la app del estudio (`app/api/portal/instructora/ofertas`), con sesión: la
//     sesión prueba quién es, y que se le preguntó lo prueba ser la candidata a
//     la que el motor le está preguntando AHORA (`escalacionVigente`).
//
// Se extrajo tal cual de la ruta pública para que la app no fuera una segunda
// copia de la parte delicada —el avance al siguiente del ranking, el aviso a la
// propietaria, el guardia de clase ya empezada—, que es justo donde las copias
// divergen.

export type ContactoQueResponde =
  /** El token del enlace señala SU fila de contacto (la traza solo guarda el hash). */
  | { via: 'enlace'; tokenHash: string }
  /** Sesión de la app: no hay token, se contesta a su último aviso. */
  | { via: 'app' };

export interface RespuestaSustitucion {
  sustitucionId: string;
  studioId: string;
  instructorId: string;
  accion: 'aceptar' | 'rechazar';
  contacto: ContactoQueResponde;
}

export type ResultadoRespuesta =
  | { ok: true; rechazado?: true; avanzada?: true; agotada?: true }
  | { ok: false; motivo: string; error?: string };

/**
 * Registra la respuesta. Devuelve `ok:false` con un `motivo` cuando la respuesta
 * llega tarde o no vale (quien llama lo traduce a su 409); LANZA si falla la
 * confirmación en BD (quien llama lo traduce a su 500, con su propio mensaje).
 */
export async function responderSustitucion(admin: SupabaseClient, p: RespuestaSustitucion): Promise<ResultadoRespuesta> {
  const enApp = p.contacto.via === 'app';

  const { data: sust } = await admin
    .from('sustituciones').select('sesion_id').eq('id', p.sustitucionId).eq('studio_id', p.studioId).maybeSingle();
  // `escalacionVigente` no filtra por estudio: en la app, la sustitución tiene
  // que ser de la sede de su sesión antes de mirar nada más.
  if (enApp && !sust) return { ok: false, motivo: 'no_encontrada' };
  const sesionId = (sust?.sesion_id as string | null | undefined) ?? null;

  if (p.accion === 'aceptar' || enApp) {
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
    // En la app vale también para «No puedo»: un segundo toque DESPUÉS del
    // primero no avisa dos veces a la propietaria ni avanza dos puestos. Dos
    // peticiones a la vez sí podrían (no hay compare-and-set sobre
    // `candidata_actual`); es la misma carrera que ya tenía el enlace.
    const { data: contactos } = await admin
      .from('sustitucion_contactos')
      .select('instructor_id, canal, estado, enviado_en, respondido_en')
      .eq('sustitucion_id', p.sustitucionId).eq('studio_id', p.studioId).eq('instructor_id', p.instructorId);
    const yaRespondio = ultimaRespuestaDe((contactos ?? []) as ContactoFila[]);
    if (yaRespondio) return { ok: false, motivo: yaRespondio === 'rechazado' ? 'ya_rechazaste' : 'ya_aceptaste' };
  }

  if (enApp) {
    // Sin token, lo único que prueba que se le preguntó es ser la candidata a la
    // que el motor está preguntando ahora. Más restrictivo que el enlace (que
    // sigue valiendo 3 h aunque el escalado haya avanzado) a propósito: la app
    // solo enseña lo que el motor le pide en este momento.
    const v = await escalacionVigente(admin, p.sustitucionId, p.instructorId);
    if (!v.vigente) return { ok: false, motivo: 'ya_no_te_toca' };
  }

  return p.accion === 'aceptar' ? aceptar(admin, p, sesionId) : rechazar(admin, p, sesionId);
}

async function aceptar(admin: SupabaseClient, p: RespuestaSustitucion, sesionId: string | null): Promise<ResultadoRespuesta> {
  // La RPC `confirmar_sustitucion` NO comprueba si la clase ya empezó (solo
  // revalida el solape de horario), y el token del email dura 3 h — justo la
  // ventana de una baja de última hora. Sin este guardia, aceptar a las 20:10
  // una clase de las 20:00 reasignaba `sesiones.instructor_id` de una clase ya
  // dada, la marcaba confirmada y disparaba `avisarAlumnas(..., 'cubierta')`
  // ("tu clase sigue en pie") a posteriori: un estado imposible, porque la
  // clase la dio otra persona. El camino de panel ya lo comprueba
  // (app/api/sustituciones/route.ts, action 'confirmar'). Mismo guardia, mismo
  // mensaje, mismo 409.
  if (sesionId) {
    const { data: ses } = await admin.from('sesiones').select('inicio').eq('id', sesionId).maybeSingle();
    if (ses && sesionYaEmpezada(ses.inicio as string)) {
      return { ok: false, motivo: 'clase_ya_empezada', error: MENSAJE_CLASE_YA_EMPEZADA };
    }
  }

  const { data, error } = await admin.rpc('confirmar_sustitucion', {
    p_sustitucion_id: p.sustitucionId,
    p_instructor_id: p.instructorId,
    p_studio_id: p.studioId,
    p_aprobada_por: null,
  });
  if (error) throw error;
  const r = (data ?? {}) as { ok?: boolean; motivo?: string; sesion_id?: string };
  if (!r.ok) {
    // Otra persona la cubrió antes (o se canceló) → 'ya_resuelta'. Si en el
    // hueco entre el aviso y este tap le surgió otra clase → 'conflicto_horario'
    // (0048): llega tarde igual, pero por un motivo distinto.
    return { ok: false, motivo: r.motivo ?? 'ya_resuelta' };
  }
  await marcarContacto(admin, p, 'aceptado');

  // Avisa a las alumnas (si el estudio lo tiene activado): "tu clase sigue en pie".
  if (r.sesion_id) {
    const { data: cand } = await admin.from('instructores').select('nombre').eq('id', p.instructorId).maybeSingle();
    await avisarAlumnas(admin, { sesionId: r.sesion_id, studioId: p.studioId, tipo: 'cubierta', sustituta: cand?.nombre });
    // Notification Engine: in-app a la instructora que cubre ("nueva clase asignada").
    const { emitirSustitucionAceptada } = await import('@/lib/notifications/emit');
    await emitirSustitucionAceptada(admin, { studioId: p.studioId, sesionId: r.sesion_id, instructorId: p.instructorId });
  }
  return { ok: true };
}

async function rechazar(admin: SupabaseClient, p: RespuestaSustitucion, sesionId: string | null): Promise<ResultadoRespuesta> {
  const { sustitucionId, studioId, instructorId } = p;
  await marcarContacto(admin, p, 'rechazado');

  // El "no puedo" tiene que llegar a la propietaria SIEMPRE, no solo en modo
  // asistido: en autónomo el motor avanzaba a la siguiente candidata en
  // silencio absoluto y en el panel no aparecía absolutamente nada, así que
  // la propietaria no tenía forma de saber que su instructora había
  // contestado. Es aviso de campana (`canales: []` en el catálogo), no push:
  // en autónomo no hay nada que ella tenga que hacer — se le está contando,
  // no se le está pidiendo. Qué frase cierra el aviso lo decide cada camino.
  const avisarRechazo = async (siguiente: string) => {
    if (!sesionId) return;
    const { emitirSustitucionRechazada } = await import('@/lib/notifications/emit');
    await emitirSustitucionRechazada(admin, { studioId, sesionId, instructorId, sustitucionId, siguiente });
  };

  // En modo AUTÓNOMO, un rechazo explícito debe AVANZAR al siguiente del ranking,
  // igual que el auto-avance por no responder. Antes se ponía SIEMPRE
  // pendiente_aprobacion: en autónomo el escalado se apagaba (exige 'contactando') y
  // nadie re-barría las pendiente_aprobacion → la clase se quedaba sin cubrir.
  // Paradoja: ignorar el email avanzaba; decir "no" explícito estancaba.
  const modo = await modoAutonomiaEfectivo(admin, studioId);
  if (modo === 'autonomo' || modo === 'vacaciones') {
    const v = await escalacionVigente(admin, sustitucionId, instructorId);
    // Solo si quien rechaza sigue siendo la candidata vigente (si el escalado ya
    // avanzó por su cuenta, no interferir).
    if (v.vigente) {
      const avance = await contactarDesde(admin, {
        sustitucionId, studioId, sesion: v.sesion, ranking: v.ranking, desde: v.candidataIdx + 1,
      });
      if (avance.contactada) {
        // Nueva instancia de escalado para la siguiente candidata (igual que el worker).
        await inngest.send({
          name: EVENTS.SUSTITUCION_CONTACTADA,
          data: { sustitucionId, studioId, instructorId: avance.instructorId, idx: avance.idx },
        });
        const { data: sig } = await admin.from('instructores')
          .select('nombre').eq('id', avance.instructorId).eq('studio_id', studioId).maybeSingle();
        await avisarRechazo(sig?.nombre
          ? `Ya se lo hemos preguntado a ${sig.nombre}.`
          : 'Ya se lo hemos preguntado a la siguiente de la lista.');
        return { ok: true, rechazado: true, avanzada: true };
      }
      // Ranking agotado: marca 'agotada' (compare-and-set) y alerta a la dueña.
      await admin.from('sustituciones')
        .update({ estado: 'agotada' })
        .eq('id', sustitucionId).eq('studio_id', studioId).eq('estado', 'contactando');
      // Las dos cosas, no una: `alertarPropietaria` sale por email/WhatsApp y
      // el aviso de campana no existe hasta aquí — no son el mismo canal.
      await avisarRechazo('No queda nadie más a quien preguntar.');
      await alertarPropietaria(admin, { studioId, sesion: v.sesion, tipo: 'agotada' });
      return { ok: true, rechazado: true, agotada: true };
    }
    // El escalado ya había avanzado por su cuenta antes de este tap.
    await avisarRechazo('Ya estábamos preguntando a otra persona.');
    return { ok: true, rechazado: true };
  }

  // Asistido: devuelve la sustitución al panel para que la dueña elija a otra.
  await admin.from('sustituciones')
    .update({ estado: 'pendiente_aprobacion' })
    .eq('id', sustitucionId).eq('studio_id', studioId).eq('estado', 'contactando');
  // Notification Engine: la dueña debe elegir a otra candidata.
  await avisarRechazo('Busca otra opción.');
  return { ok: true, rechazado: true };
}

async function marcarContacto(admin: SupabaseClient, p: RespuestaSustitucion, estado: 'aceptado' | 'rechazado'): Promise<void> {
  const cambio = { estado, respondido_en: new Date().toISOString() };
  if (p.contacto.via === 'enlace') {
    await admin.from('sustitucion_contactos').update(cambio)
      .eq('token_hash', p.contacto.tokenHash).eq('sustitucion_id', p.sustitucionId);
    return;
  }
  // En la app no hay token que señale una fila: se contesta a su último aviso.
  // Con una basta — `ultimaRespuestaDe` compara la última respuesta con el
  // último envío, así que el email y el WhatsApp de una misma ronda no hacen que
  // el enlace le vuelva a preguntar.
  // Se prefiere un aviso que llegó (`enviado`/`leido`); si todos fallaron, el
  // último igualmente, para que la traza no se quede sin su respuesta.
  const { data: avisos } = await admin.from('sustitucion_contactos').select('id, estado')
    .eq('sustitucion_id', p.sustitucionId).eq('studio_id', p.studioId).eq('instructor_id', p.instructorId)
    .order('enviado_en', { ascending: false }).limit(10);
  const filas = (avisos ?? []) as Array<{ id: string; estado: string }>;
  const destino = filas.find((f) => f.estado === 'enviado' || f.estado === 'leido') ?? filas[0];
  if (destino) await admin.from('sustitucion_contactos').update(cambio).eq('id', destino.id);
}
