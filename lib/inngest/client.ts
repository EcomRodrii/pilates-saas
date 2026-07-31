import { Inngest } from 'inngest';

// Auditoría CTO: los dispatchers cron (fan-out por estudio) mandaban TODOS los
// eventos en una sola llamada a step.sendEvent. Con pocos estudios no se nota,
// pero a la escala que se está preparando el producto (cientos de estudios) el
// tamaño del array de eventos crecería sin límite en una única invocación —
// Inngest recomienda no mandar lotes sin acotar. Trocear en lotes fijos
// mantiene el comportamiento actual (mismos eventos, mismo destino) y escala
// sin tocar nada más el día que haya 500 estudios en vez de 11.
const TAMANO_LOTE_FAN_OUT = 500;

export async function enviarFanOutEnLotes<T>(
  step: { sendEvent: (id: string, events: { name: string; data: Record<string, unknown> }[]) => Promise<unknown> },
  idBase: string,
  name: string,
  items: T[],
  aEvento: (item: T) => Record<string, unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += TAMANO_LOTE_FAN_OUT) {
    const lote = items.slice(i, i + TAMANO_LOTE_FAN_OUT);
    await step.sendEvent(`${idBase}-${i / TAMANO_LOTE_FAN_OUT}`, lote.map(item => ({ name, data: aEvento(item) })));
  }
}

// Cliente Inngest — la cola de trabajos en segundo plano (P0-4/36). Las keys
// (INNGEST_EVENT_KEY para enviar eventos, INNGEST_SIGNING_KEY para autenticar
// las llamadas que Inngest hace a /api/inngest) se leen solas de esas env vars;
// en local/dev, sin ellas, arranca en modo dev contra el Dev Server de Inngest.
//
// Se importa ANTES que nada en el route de serve (ver la nota de OTel del SDK).
export const inngest = new Inngest({ id: 'pilates-saas' });

// Nombres de eventos, centralizados para no escribir strings sueltos.
export const EVENTS = {
  AUTOMATIZACIONES_ESTUDIO: 'automatizaciones/studio.process',
  // Dunning (0041) — barrido diario de reintentos de cobro, un evento por estudio.
  DUNNING_ESTUDIO: 'dunning/studio.sweep',
  // Renovaciones de planes mensuales — genera en servidor el recibo de
  // renovación de las cuotas caducadas (antes lo hacía el navegador al abrir
  // el panel, sin proximo_reintento → nunca entraba al dunning).
  RENOVACIONES_ESTUDIO: 'renovaciones/studio.sweep',
  // Decision OS (DECISION-OS-ARQUITECTURA.md §6) — additivo, no toca los de arriba.
  DECISION_ANALYZE: 'decision/studio.analyze',
  DECISION_APPROVED: 'decision/recommendation.approved',
  DECISION_MEASURE: 'decision/outcome.measure',
  // Sustituciones — motor de escalado. Se emite cada vez que se contacta a una
  // candidata; la función de escalado espera, recuerda, sube de canal y (en modo
  // autónomo) avanza al siguiente del ranking o alerta a la propietaria.
  SUSTITUCION_CONTACTADA: 'sustitucion/contactada',
  // Valoraciones (0044) — barrido que, tras cada clase, pide valoración a las
  // alumnas apuntadas. Un evento por estudio (fan-out del dispatcher cron).
  VALORACIONES_ESTUDIO: 'valoraciones/studio.sweep',
  // Confirmación por riesgo de plantón (0059) — dos barridos, un evento por
  // estudio cada uno: pedir confirmación (víspera) y liberar si no responde
  // a tiempo (corte).
  CONFIRMACION_RIESGO_ASK_ESTUDIO: 'confirmacion-riesgo/studio.ask',
  CONFIRMACION_RIESGO_CORTE_ESTUDIO: 'confirmacion-riesgo/studio.corte',
  // Aquí vivían NOTIFICATION_EMIT y NOTIFICATION_DELIVER. El Notification
  // Engine YA NO pasa por la cola: `publish()` escribe la in-app de forma
  // síncrona y entrega los canales externos con un salto HTTP a
  // /api/notifications/deliver (ver lib/notifications/engine.ts). Fue una
  // decisión deliberada — "una cola invisible que falla en silencio nos dejó
  // sin ninguna notificación en producción"— pero el worker se quedó vivo y
  // registrado sin que nadie publicara sus eventos: quien abría el código veía
  // primero la ruta de Inngest, con reintentos y concurrencia, y creía que era
  // la que corre.
  // Automatizaciones del motor: los dispatchers cron hacen fan-out de un evento
  // por estudio; el worker detecta la condición (recordatorios, bono a punto de
  // caducar, clienta inactiva) y publica los eventos de notificación.
  NOTIF_AUTOMACION_ESTUDIO: 'notification/automacion.estudio',
  // Backups (P0-36) — barrido diario de copias de seguridad, un evento por
  // estudio (fan-out del dispatcher cron). Reemplaza el route de Vercel Cron que
  // iteraba todos los estudios en serie dentro de una sola invocación acotada.
  BACKUPS_ESTUDIO: 'backups/studio.sweep',
  // Recordatorios de clase (M-5, auditoría 2026-07-29) — mismo motivo que
  // backups: reemplaza el route de Vercel Cron que recorría las sesiones
  // próximas de TODOS los estudios en una sola invocación acotada.
  RECORDATORIOS_ESTUDIO: 'recordatorios/studio.sweep',
  // Recordatorios de revisión de ficha clínica (M-5, auditoría 2026-07-29) —
  // mismo motivo: reemplaza el route de Vercel Cron que recorría las
  // condiciones de salud de TODOS los estudios en una sola invocación.
  REVISIONES_SALUD_ESTUDIO: 'revisiones-salud/studio.sweep',
} as const;
