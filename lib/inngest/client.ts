import { Inngest } from 'inngest';

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
  // Notification Engine — un ÚNICO evento por el que pasan todas las
  // notificaciones del producto. Los módulos publican aquí (vía
  // NotificationEngine.publish); el worker resuelve destinatarios, preferencias,
  // plantillas y canales. Nadie envía notificaciones directamente.
  NOTIFICATION_EMIT: 'notification/emit',
  // Automatizaciones del motor: los dispatchers cron hacen fan-out de un evento
  // por estudio; el worker detecta la condición (recordatorios, bono a punto de
  // caducar, clienta inactiva) y publica los eventos de notificación.
  NOTIF_AUTOMACION_ESTUDIO: 'notification/automacion.estudio',
  // Backups (P0-36) — barrido diario de copias de seguridad, un evento por
  // estudio (fan-out del dispatcher cron). Reemplaza el route de Vercel Cron que
  // iteraba todos los estudios en serie dentro de una sola invocación acotada.
  BACKUPS_ESTUDIO: 'backups/studio.sweep',
} as const;
