import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarEmailAvisoAlumna } from './email';
import type { AvisoAlumna } from '@/lib/emails/sustitucion-template';
import { fechaLargaEstudio, horaEstudio } from '@/lib/utils';

// Avisa a las alumnas apuntadas a una clase — SOLO si el estudio lo tiene
// activado (studios.avisar_alumnas). Regla del producto: la propietaria SIEMPRE
// se entera antes o a la vez; por eso esto se llama DESPUÉS de confirmar/cancelar.
// Reutiliza la función alumnas_apuntadas (0037) → contactos reales del sistema
// de reservas existente. Degrada limpio si Resend no está configurado.

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  return `${fechaLargaEstudio(d)} · ${horaEstudio(d)}`;
}

export async function avisarAlumnas(
  admin: SupabaseClient,
  // 'reprogramada': la clase se salva moviéndola — `cuandoAntes` es el horario
  // ORIGINAL ya formateado (la sesión, en ese momento, ya tiene el nuevo).
  params: { sesionId: string; studioId: string; tipo: 'cubierta' | 'cancelada' | 'reprogramada'; sustituta?: string; cuandoAntes?: string },
): Promise<{ avisadas: number; total: number; skipped: boolean; desactivado: boolean }> {
  const { data: estudio } = await admin
    .from('studios').select('nombre, slug, avisar_alumnas, color_primario, logo_url, email').eq('id', params.studioId).maybeSingle();
  if (!estudio?.avisar_alumnas) return { avisadas: 0, total: 0, skipped: false, desactivado: true };

  const { data: ses } = await admin
    .from('sesiones').select('inicio, tipo_clase_id, sala_id').eq('id', params.sesionId).maybeSingle();
  const { data: tc } = await admin
    .from('tipos_clase').select('nombre').eq('id', ses?.tipo_clase_id ?? '').maybeSingle();
  const claseNombre = tc?.nombre ?? 'Clase';
  const cuando = ses?.inicio ? cuandoTexto(ses.inicio) : '';
  const estudioNombre = estudio.nombre ?? 'Tu estudio';

  // Notification Engine: el aviso llega también al centro de la socia (in-app y
  // push), además del email. Respeta el toggle avisar_alumnas (ya filtrado
  // arriba). El motor resuelve las socias apuntadas de la sesión.
  //
  // Los TRES casos publican, y eso antes no era así: solo 'cancelada' llegaba al
  // portal; 'cubierta' y 'reprogramada' se mandaban SOLO por email. O sea que la
  // mala noticia ("tu clase se cae") tenía dos canales y las que salvan la clase
  // ("sigue en pie, la da Aina" / "se mueve a las 10:00") solo el más frágil. Si
  // la alumna no abre el correo se presenta a la hora que no es, o no se presenta
  // porque cree que se ha caído. Los avisos que evitan el plantón eran justo los
  // que peor viajaban.
  if (params.tipo === 'cancelada') {
    const { publish } = await import('@/lib/notifications/engine');
    const { EVENTOS } = await import('@/lib/notifications/catalog');
    await publish({
      type: EVENTOS.CLASE_CANCELADA, studioId: params.studioId,
      // sesionId DEBE ir en data: resolverDestinatarios lo lee de ahí, no de
      // resource.id. Sin él, la audiencia socias-e-instructora-de-la-sesion
      // resolvía 0 destinatarios y el aviso in-app/push se perdía (igual que el
      // bug que #361 arregló en su gemelo emit.ts:emitirClaseCancelada).
      data: { clase: claseNombre, cuando, slug: (estudio.slug as string | null) ?? '', sesionId: params.sesionId },
      resource: { type: 'sesion', id: params.sesionId },
      dedupKey: `clase-cancelada:${params.sesionId}`,
    });
  } else if (params.tipo === 'reprogramada') {
    // Mover una clase es modificarla: `clase.modificada` ya existe con la
    // audiencia y la plantilla correctas, y `emitirClaseModificada` ya sabe
    // formatearla. No hacía falta evento nuevo — hacía falta llamarlo.
    const { emitirClaseModificada } = await import('@/lib/notifications/emit');
    const { data: sala } = await admin
      .from('salas').select('nombre').eq('id', ses?.sala_id ?? '').maybeSingle();
    await emitirClaseModificada(admin, {
      studioId: params.studioId,
      sesionId: params.sesionId,
      clase: claseNombre,
      cuando,                                  // aquí `cuando` ya es el horario NUEVO
      sala: (sala?.nombre as string | null) ?? '',
      // La instructora no cambia al reprogramar; nombrarla haría pensar que sí.
    });
  } else {
    // Cubrir NO es mover. Con `clase.modificada` el aviso decía "tu clase pasa a:
    // <la misma hora de siempre>", que se lee como un cambio de horario: la
    // alumna abre el móvil, cree que ya no le encaja y se plantea cancelar una
    // clase que sigue exactamente donde estaba. De ahí su propio evento.
    const { publish } = await import('@/lib/notifications/engine');
    const { EVENTOS } = await import('@/lib/notifications/catalog');
    await publish({
      type: EVENTOS.CLASE_SUSTITUTA, studioId: params.studioId,
      data: {
        clase: claseNombre, cuando, slug: (estudio.slug as string | null) ?? '',
        sesionId: params.sesionId,
        // Con nombre y todo: "la da otra persona" es justo lo que no tranquiliza.
        sustituta: params.sustituta ?? 'otra instructora',
      },
      resource: { type: 'sesion', id: params.sesionId },
      dedupKey: `clase-cubierta:${params.sesionId}:${params.sustituta ?? ''}`,
    });
  }

  const { data: alumnas } = await admin.rpc('alumnas_apuntadas', { p_sesion_id: params.sesionId });
  const lista = (alumnas ?? []) as { nombre: string; email: string | null }[];

  // El desenlace es el mismo para toda la lista, así que se resuelve una vez y
  // no una por alumna. En 'reprogramada' el `cuando` del correo es el horario
  // ORIGINAL —la sesión ya tiene el nuevo guardado— y el nuevo viaja aparte.
  const aviso: AvisoAlumna = params.tipo === 'cubierta'
    ? { tipo: 'cubierta', sustituta: params.sustituta ?? 'otra instructora' }
    : params.tipo === 'reprogramada'
      ? { tipo: 'reprogramada', cuandoNuevo: cuando }
      : { tipo: 'cancelada' };
  const cuandoAviso = params.tipo === 'reprogramada' ? (params.cuandoAntes ?? cuando) : cuando;
  // `replyTo`: el email del estudio, para que responder al aviso le llegue a
  // ELLOS y no se pierda en el buzón de la plataforma.
  const marca = { colorPrimario: estudio.color_primario, logoUrl: estudio.logo_url, replyTo: estudio.email };

  let avisadas = 0, skipped = false;
  for (const a of lista) {
    if (!a.email) continue;
    const r = await enviarEmailAvisoAlumna({
      to: a.email, toName: a.nombre, estudioNombre, ...marca, claseNombre, cuando: cuandoAviso, aviso,
    });
    if ('ok' in r && r.ok) avisadas++;
    if ('skipped' in r) skipped = true;
  }
  return { avisadas, total: lista.length, skipped, desactivado: false };
}
