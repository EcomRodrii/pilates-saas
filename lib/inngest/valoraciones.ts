// Valoraciones — barrido que, tras cada clase, pide a las alumnas que ASISTIERON
// que la valoren. Mismo patrón durable que dunning (dispatcher cron → fan-out por
// estudio → un step.run por clase). Idempotente: `sesiones.valoracion_pedida_en`
// se fija con compare-and-set ANTES de enviar, así una clase solo dispara una vez
// aunque el barrido se solape o reintente.
import { inngest, EVENTS, enviarFanOutEnLotes } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { firmarTokenValoracion } from '@/lib/valoraciones/token';
import { destinatariasValoracion } from '@/lib/valoraciones/destinatarias';
import { enviarEmailPedirValoracion } from '@/lib/valoraciones/email';
import { resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
import { marcaCorreoDesde } from '@/lib/emails/estudio/marca-correo';
import { emitirValorarClase } from '@/lib/notifications/emit';
import { fechaLargaEstudio, horaEstudio } from '@/lib/utils';
import { appUrl } from '@/lib/app-url';
import { limitesDeBarrido } from '@/lib/valoraciones/momento';
import { sociasQueYaRecibenElAviso } from '@/lib/valoraciones/sin-correo';
import { EVENTOS } from '@/lib/notifications/eventos';
import { estudiosConValoracionesPendientes } from '@/lib/valoraciones/estudios-pendientes';

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = fechaLargaEstudio(d);
  const hora = horaEstudio(d);
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

// Dispatcher: cada 12 h, ahora solo RED DE SEGURIDAD. La petición normal sale unos
// 20-30 min tras la clase por `/api/cron/valoraciones` (pg_cron cada 10 min, migración
// 20261122004106). Si ese cron falla o se retrasa, este barrido recoge las clases de
// las últimas 48 h; lo que ya se pidió está marcado (`valoracion_pedida_en`) y no se
// repite. (00:15 y 12:15 UTC para no chocar con dunning 08:30 / decision 06:30·14:30 /
// automatizaciones 07:00.)
export const valoracionesDispatcher = inngest.createFunction(
  { id: 'valoraciones-dispatcher', triggers: [{ cron: '15 */12 * * *' }] },
  async ({ step }) => {
    // La hora va dentro del step de la lista (un step menos por tic). Id nuevo a
    // propósito: devuelve otra forma, y con el id viejo una ejecución a medias
    // durante un despliegue recuperaría el array guardado y el fan-out fallaría.
    const { nowISO, studios } = await step.run('list-studios-con-hora', async () => {
      const nowISO = new Date().toISOString();
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      return { nowISO, studios: await estudiosConValoracionesPendientes(admin, nowISO) };
    });

    await enviarFanOutEnLotes(step, 'fan-out-valoraciones', EVENTS.VALORACIONES_ESTUDIO, studios, (s: { id: string }) => ({ studioId: s.id, nowISO }));
    return { estudios: studios.length, ejecutadoEn: nowISO };
  },
);

// Worker: un run por estudio. Clases terminadas en las últimas 48 h sin petición
// enviada → una petición por alumna apuntada. Cada clase es idempotente.
export const procesarValoracionesEstudio = inngest.createFunction(
  {
    id: 'valoraciones-estudio',
    triggers: [{ event: EVENTS.VALORACIONES_ESTUDIO }],
    concurrency: { limit: 3 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };
    // Las clases que ya toca pedir: terminadas hace más de 20 min y menos de 48 h.
    const { desdeISO, hastaISO } = limitesDeBarrido(Date.parse(nowISO));

    const clases = await step.run('clases-terminadas', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      const { data, error } = await admin
        .from('sesiones')
        .select('id, inicio, tipo_clase_id, instructor_id')
        .eq('studio_id', studioId)
        .eq('cancelada', false)
        .not('instructor_id', 'is', null)
        .is('valoracion_pedida_en', null)
        .lt('fin', hastaISO)
        .gt('fin', desdeISO)
        .limit(200);
      if (error) throw new Error(error.message);
      const sesiones = data ?? [];
      if (sesiones.length === 0) return [];

      // Solo las clases con alguna alumna ASISTIDA. Una clase sin nadie marcado
      // (sin reservas, o sin lista pasada todavía) gastaba su step `pedir-…` en
      // cada barrido de las 48 h para volver con la lista vacía. El step sigue
      // comprobándolo, así que una clase que pase lista más tarde se recoge en el
      // siguiente barrido igual que antes. En trozos de 100: `.in()` con 200 ids
      // no cabe en la URL de PostgREST.
      const conAsistencia = new Set<string>();
      for (let i = 0; i < sesiones.length; i += 100) {
        const ids = sesiones.slice(i, i + 100).map(s => s.id as string);
        const { data: filas, error: errRes } = await fetchAllRows<{ sesion_id: string }>(
          studioId, 'reservas',
          (from, to) => admin.from('reservas').select('sesion_id')
            .eq('studio_id', studioId).eq('estado', 'ASISTIDA').in('sesion_id', ids)
            .order('id').range(from, to),
        );
        if (errRes) throw new Error(errRes.message);
        for (const f of filas) conAsistencia.add(f.sesion_id);
      }
      return sesiones.filter(s => conAsistencia.has(s.id as string));
    });

    let clasesPedidas = 0, emailsEnviados = 0;

    for (const c of clases as { id: string; inicio: string; tipo_clase_id: string | null; instructor_id: string }[]) {
      // I-2 (auditoría 2026-07-29): antes, marcar la clase como "pedida" y
      // mandar el email a CADA alumna vivían en el mismo step.run.
      // enviarEmailPedirValoracion nunca lanza (siempre resuelve {ok:false} en
      // vez de rechazar), así que un fallo de envío no hacía fallar el step:
      // Inngest lo memoizaba como éxito para siempre y esa alumna nunca
      // recibía la petición ni había reintento posible. Ahora el marcado +
      // recopilar destinatarias sigue en un único step (compare-and-set), pero
      // cada envío es SU PROPIO step con clave por alumna: si una falla de
      // verdad, Inngest reintenta SOLO esa, sin volver a mandar a las que ya
      // salieron bien.
      const pedida = await step.run(`pedir-${c.id}`, async () => {
        const admin = getSupabaseAdmin();
        if (!admin) throw new Error('Service role no configurada');

        // A quién: SOLO a quien ASISTIÓ (regla de producto, la misma que aplica
        // la app en /api/public/valorar-clase). Antes se usaba
        // `alumnas_apuntadas`, que devuelve CONFIRMADAS: en cuanto el estudio
        // pasaba lista, las que fueron salían de la invitación y las que no
        // aparecieron seguían dentro. Se mira ANTES del compare-and-set: si aún
        // nadie está marcada como asistida (el estudio pasa lista más tarde),
        // la clase NO se marca como pedida y el siguiente barrido la vuelve a
        // mirar, mientras siga dentro de la ventana de 48 h.
        const { data: reservasRaw } = await admin
          .from('reservas').select('id, socio_id, estado')
          .eq('studio_id', studioId).eq('sesion_id', c.id).eq('estado', 'ASISTIDA');
        // Las reservas de ClassPass/USC no tienen socia: no se les pide valoración
        // (no es clienta del estudio) y un `null` dentro de `.in()` rompe la consulta.
        const idsSocias = Array.from(new Set((reservasRaw ?? []).map((r) => r.socio_id).filter((id): id is string => !!id)));
        const { data: sociosRaw } = idsSocias.length
          ? await admin.from('socios').select('id, nombre, apellidos, email, borrado_en, auth_user_id').in('id', idsSocias)
          : { data: [] as { id: string; nombre: string; apellidos: string | null; email: string | null; borrado_en: string | null; auth_user_id: string | null }[] };
        const lista = destinatariasValoracion(reservasRaw ?? [], sociosRaw ?? []);
        if (lista.length === 0) return { pedida: false, lista: [], datos: null };

        // Compare-and-set: marca pedida ANTES de enviar. Si otra ejecución llegó
        // antes (0 filas), no reenvía.
        const { data: marcada } = await admin
          .from('sesiones')
          .update({ valoracion_pedida_en: nowISO })
          .eq('id', c.id).eq('studio_id', studioId).is('valoracion_pedida_en', null)
          .select('id');
        if (!marcada || marcada.length === 0) return { pedida: false, lista: [], datos: null };

        const [{ data: tipo }, { data: instructora }, estudio] = await Promise.all([
          admin.from('tipos_clase').select('nombre').eq('id', c.tipo_clase_id ?? '').maybeSingle(),
          admin.from('instructores').select('nombre').eq('id', c.instructor_id).maybeSingle(),
          // Antes esto era un `select('nombre, color_primario, logo_url')` a
          // mano. La marca del correo la resuelve un solo sitio
          // (`resolverMarcaEstudio`) para que el pie, el lema y los canales del
          // estudio salgan igual aquí que en la confirmación de reserva.
          resolverMarcaEstudio(studioId),
        ]);

        return {
          pedida: true, lista,
          datos: {
            claseNombre: tipo?.nombre ?? 'tu clase',
            instructorNombre: instructora?.nombre ?? '',
            marca: marcaCorreoDesde(estudio, 'Tu estudio'),
            replyTo: estudio.replyTo,
          },
        };
      });

      let enviados = 0;
      if (pedida.pedida && pedida.datos) {
        const datos = pedida.datos;
        // Aviso in-app/push (motor de notificaciones) para TODA la clase en UN
        // step, antes de los emails: `emitirValorarClase` es best-effort (nunca
        // lanza) y `publish` deduplica por `valorar:<sesión>:<socia>`, así que
        // re-ejecutar el step es seguro y N steps por alumna solo sumarían
        // coste en Inngest sin dar reintentos. Solo a quien tiene cuenta
        // reclamada: sin `auth_user_id` no hay bandeja ni push que ver.
        const inapp = await step.run(`valorar-inapp-${c.id}`, async () => {
          const admin = getSupabaseAdmin();
          if (!admin) return { creadas: 0, conAviso: [] as string[] };
          let creadas = 0;
          for (const a of pedida.lista) {
            if (!a.conCuenta) continue;
            creadas += await emitirValorarClase(admin, { studioId, sesionId: c.id, socioId: a.socio_id, reservaId: a.reserva_id, instructora: datos.instructorNombre });
          }
          // A quien le va a llegar al móvil no se le manda además el correo (cuota de correo).
          // Si algo no se puede leer, la lista queda vacía y el correo sale como siempre.
          const userIds = pedida.lista.map(a => a.authUserId).filter((id): id is string => !!id);
          if (userIds.length === 0) return { creadas, conAviso: [] as string[] };
          const [subs, prefs, estudio] = await Promise.all([
            admin.from('push_subscription').select('user_id').eq('studio_id', studioId).in('user_id', userIds),
            admin.from('notification_preference').select('user_id, push, push_eventos').eq('category', 'reservas').in('user_id', userIds),
            admin.from('studios').select('avisos_push_apagados').eq('id', studioId).maybeSingle(),
          ]);
          if (subs.error || prefs.error || estudio.error) return { creadas, conAviso: [] as string[] };
          return {
            creadas,
            conAviso: sociasQueYaRecibenElAviso({
              destinatarias: pedida.lista,
              conDispositivo: (subs.data ?? []).map(f => f.user_id as string),
              preferencias: (prefs.data ?? []) as { user_id: string; push: boolean; push_eventos: unknown }[],
              apagadosPorElEstudio: (estudio.data?.avisos_push_apagados as string[] | null) ?? [],
              evento: EVENTOS.VALORAR_CLASE,
            }),
          };
        });
        // `?.`: una ejecución a medias puede traer el resultado antiguo del paso (un número).
        const conAviso = new Set((inapp as { conAviso?: string[] })?.conAviso ?? []);
        for (const a of pedida.lista) {
          if (!a.email || conAviso.has(a.socio_id)) continue;
          const enviado = await step.run(`valorar-${c.id}-${a.socio_id}`, async () => {
            const token = firmarTokenValoracion(studioId, a.socio_id, c.id);
            const r = await enviarEmailPedirValoracion({
              to: a.email as string,
              toName: a.nombre,
              marca: datos.marca,
              replyTo: datos.replyTo,
              claseNombre: datos.claseNombre,
              cuando: cuandoTexto(c.inicio),
              instructorNombre: datos.instructorNombre,
              url: `${appUrl()}/valorar/${token}`,
            });
            if ('ok' in r && r.ok) return true;
            // `skipped` (Resend sin configurar) no se reintenta; un `error`
            // real sí, lanzando para que Inngest reintente solo este step.
            if ('skipped' in r && r.skipped) return false;
            throw new Error(`enviarEmailPedirValoracion: ${'error' in r ? r.error : 'fallo desconocido'}`);
          });
          if (enviado) enviados++;
        }
      }
      const res = { pedida: pedida.pedida, enviados };
      if (res.pedida) clasesPedidas++;
      emailsEnviados += res.enviados;
    }

    return { studioId, clases: clases.length, clasesPedidas, emailsEnviados };
  },
);
