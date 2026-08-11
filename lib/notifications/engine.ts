// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — API pública (server, pero SIN canales).
//
// Los módulos de negocio SOLO llaman a publish(evento) — normalmente a través
// de los emisores de emit.ts, que reúnen las variables de plantilla.
//
// publish() hace DOS cosas, en este orden y con esta garantía:
//   1. Escribe la notificación IN-APP en el acto (INSERT síncrono). NO depende de
//      la cola: si Inngest está caído o mal configurado, la campana igual se
//      entera. Esto es a propósito — una cola invisible que falla en silencio nos
//      dejó sin ninguna notificación en producción.
//   2. Entrega los canales EXTERNOS (push/email/WhatsApp/SMS) llamando a la ruta
//      interna /api/notifications/deliver. Tampoco pasa por la cola. Best-effort
//      y con timeout: si tarda o falla, la in-app ya está escrita.
//
// El PROCESAMIENTO de canales vive en process.ts (importa web-push → módulos de
// Node) y solo lo carga esa ruta; este módulo es alcanzable desde el bundle de
// cliente vía import dinámico, así que aquí NO se tocan los canales: el salto es
// un fetch a una URL, sin ningún import que arrastre Node al bundle.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { LEGAL } from '../legal-info.ts';
import { REGLAS } from './catalog.ts';
import { crearInApp, type NotificacionCreada } from './inapp.ts';
import type { NotificationEvent } from './types.ts';

// Publica un evento. Nunca propaga errores: una notificación no puede tumbar una
// reserva ni un cobro.
//
// Devuelve QUÉ se creó realmente (lista vacía si no se creó nada). Casi todas las
// llamadas lo ignoran —son fuego y olvido—, pero cuando la dueña pulsa "Sí,
// avisar" hay que poder decirle a cuántas personas ha avisado de verdad en vez de
// dar por hecho que fueron las que el panel creía ver.
export async function publish(event: NotificationEvent): Promise<NotificacionCreada[]> {
  if (!REGLAS[event.type]) {
    console.warn('[notifications] evento sin regla, ignorado:', event.type);
    return [];
  }

  // 1) In-app SÍNCRONO (garantizado).
  let creadas: NotificacionCreada[] = [];
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      console.error('[notifications] sin service-role: no se puede crear la notificación');
      return [];
    }
    ({ creadas } = await crearInApp(admin, event));
  } catch (e) {
    console.error('[notifications] crear in-app falló:', e instanceof Error ? e.message : e);
    return [];
  }

  // 2) Canales externos (best-effort). Sin nada que entregar no se llama: la
  //    mayoría de eventos son solo in-app.
  const paraEntregar = creadas.filter(c => c.canalesExtra.length > 0).map(c => c.id);
  if (paraEntregar.length > 0) await entregarExternos(paraEntregar);
  return creadas;
}

// Salto HTTP interno a la ruta que sí puede cargar web-push. Con timeout, para
// que un push lento jamás alargue una reserva o un cobro.
async function entregarExternos(notificationIds: string[]): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[notifications] CRON_SECRET ausente: no se entregan canales externos');
    return;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
  try {
    const res = await fetch(`${base}/api/notifications/deliver`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-notif-secret': secret },
      body: JSON.stringify({ notificationIds }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error('[notifications] entrega externa devolvió', res.status);
  } catch (e) {
    console.error('[notifications] entrega externa falló:', e instanceof Error ? e.message : e);
  }
}

// ── Acciones sobre notificaciones ya creadas ────────────────────────────────
//
// Aquí vivían `marcarLeida`/`marcarNoLeida`/`marcarTodasLeidas`/`archivar` y el
// objeto `NotificationEngine` que las agrupaba. Borradas: nunca tuvieron un solo
// llamador —el único camino real es el PATCH de app/api/notifications/route.ts,
// que hace sus propias queries— y se habían convertido en una trampa que ya
// había mordido dos veces.
//
// La primera: su comentario afirmaba que "la RLS garantiza que solo toca lo
// suyo", y era falso — `notification_update` autorizaba el UPDATE también por
// `studio_id = current_studio_id()`, así que cualquier staff del estudio podía
// archivar el aviso de otra persona. Se arregló acotando por `userId`.
//
// La segunda: `recipient_user_id` a secas tampoco basta. Una persona puede ser
// staff Y socia del mismo estudio con la misma cuenta (en prod hay una), así
// que estas cuatro cruzaban las dos bandejas — justo lo que
// `lib/notifications/ambito.ts` vino a separar.
//
// Arreglarlas por tercera vez era añadir un parámetro de ámbito a código que
// nadie ejecuta, y dejarlas era garantizar una tercera mordida. Si algún día
// hace falta una acción de notificación fuera de la ruta, se escribe entonces —
// con el ámbito desde el primer día, y con quien la use delante.
