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
  // Decision OS (DECISION-OS-ARQUITECTURA.md §6) — additivo, no toca los de arriba.
  DECISION_ANALYZE: 'decision/studio.analyze',
  DECISION_APPROVED: 'decision/recommendation.approved',
  DECISION_MEASURE: 'decision/outcome.measure',
} as const;
