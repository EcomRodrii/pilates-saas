import { inngest, EVENTS } from './client';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllStudioData, dbUpsertAutomationLog, dbUpdateAutomationRule, dbUpdateAutomatizacion } from '@/lib/supabase-data';
import { computeAutomationCandidatos, type AutomationCandidato } from '@/lib/engines/automation-engine';
import { computeAutomatizacionMktCandidatos, type AutomatizacionMktCandidato } from '@/lib/engines/marketing-automation-engine';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { RECOMENDACION_SYSTEM_PROMPT, buildRecomendacionUserPrompt, type RecomendacionInput } from '@/lib/ai/recomendacion-prompt';
import { enviarMensajeTwilio, twilioConfigurado } from '@/lib/twilio';
import type { AutomationLog, ResultadoLog } from '@/lib/types';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

// ── Redacción con IA (movida tal cual desde el cron) ─────────────────────────
// Falla-suave: si la IA no responde o no parsea, cae al mensaje del motor.
async function redactarConIA(input: RecomendacionInput, fallback: string): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: RECOMENDACION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildRecomendacionUserPrompt(input) }],
    });
    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    const parsed = JSON.parse(raw);
    return parsed.mensaje || fallback;
  } catch {
    return fallback;
  }
}

// Id DETERMINISTA de log por candidato: mismo (estudio, regla, socia, día) →
// mismo id. Es lo que hace idempotente el upsert cuando un step se reintenta.
// El índice del candidato desempata dentro de la misma tanda.
function logIdCandidato(studioId: string, c: AutomationCandidato, index: number, nowISO: string): string {
  return `log-${studioId}-${c.rule.id}-${c.socio?.id ?? 'na'}-${index}-${nowISO.slice(0, 10)}`;
}

interface ProcesarOpts {
  studioId: string;
  studioNombre: string;
  index: number;
  nowISO: string;
  dry: boolean;
  resend: Resend | null;
}

// Procesa UN candidato: decide resultado, redacta con IA si aplica, manda el
// email (con Idempotency-Key = id del log, para que un reintento no reenvíe) y
// persiste el log idempotente. Devuelve el log resultante. Es el cuerpo que va
// dentro de un step.run() por candidato: durable y reintentable en aislamiento.
export async function procesarCandidato(c: AutomationCandidato, opts: ProcesarOpts): Promise<AutomationLog> {
  const { studioId, studioNombre, index, nowISO, dry, resend } = opts;
  const base = {
    id: logIdCandidato(studioId, c, index, nowISO),
    studioId,
    ruleId: c.rule.id,
    automatizacionId: null,
    ruleName: c.rule.nombre,
    socioId: c.socio?.id ?? null,
    socioNombre: c.socio ? `${c.socio.nombre} ${c.socio.apellidos}` : null,
    pasoIndex: 0,
    accion: c.accion,
    ejecutadoEn: nowISO,
    proximaAccionEn: c.proximaAccionEn,
    reciboId: c.reciboId ?? null,
  };

  let log: AutomationLog;
  // COBRAR_RECIBO y OFRECER_DESCUENTO nunca se ejecutan aquí — quedan
  // PENDIENTE_ADMIN a la espera de aprobación. NOTIFICAR_ADMIN es un insight.
  if (c.accion === 'COBRAR_RECIBO') {
    log = { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle: c.mensaje };
  } else if (c.accion === 'OFRECER_DESCUENTO' && c.contextoIA) {
    const detalle = await redactarConIA(
      { tipo: 'REACTIVACION', nombre: String(c.contextoIA.nombre), diasSinVenir: Number(c.contextoIA.diasSinVenir), descuentoPct: Number(c.contextoIA.descuentoPct) },
      c.mensaje
    );
    log = { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle };
  } else if (c.accion === 'NOTIFICAR_ADMIN' && c.contextoIA) {
    const detalle = await redactarConIA(
      { tipo: 'CLASE_LLENA', tipoClase: String(c.contextoIA.tipoClase), diaSemana: String(c.contextoIA.diaSemana), hora: String(c.contextoIA.hora), semanas: Number(c.contextoIA.semanas) },
      c.mensaje
    );
    log = { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle };
  } else if (!c.socio) {
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'Acción sin socia asociada' };
  } else if (dry) {
    log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `[DRY RUN] ${c.titulo} → ${c.socio.email}` };
  } else if (!c.socio.email) {
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'La socia no tiene email registrado' };
  } else {
    const html = await render(AutomatizacionEmail({
      socioNombre: c.socio.nombre,
      titulo: c.titulo,
      mensaje: c.mensaje,
      estudioNombre: studioNombre,
    }));
    const { error } = await resend!.emails.send(
      {
        from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
        to: [c.socio.email],
        subject: c.titulo,
        html,
      },
      // Idempotency-Key: si el step se reintenta tras enviar pero antes de
      // memoizar, Resend reconoce la clave y NO reenvía el email.
      { idempotencyKey: base.id }
    );
    if (error) {
      log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: error.message };
    } else {
      log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `Email enviado a ${c.socio.email}: "${c.titulo}"` };
    }
  }

  if (!dry) await dbUpsertAutomationLog(log);
  return log;
}

// Envía una candidata de MARKETING (Automatizacion con asunto/mensaje del
// usuario) y persiste el log en automation_logs (ruleId = id de la
// automatización, para dedup y contador). Idempotency-Key por id de log.
export async function procesarCandidatoMkt(c: AutomatizacionMktCandidato, opts: ProcesarOpts): Promise<AutomationLog> {
  const { studioId, studioNombre, index, nowISO, dry, resend } = opts;
  const esWhatsApp = c.canal === 'WHATSAPP';
  const base = {
    id: `mkt-${studioId}-${c.automatizacion.id}-${c.socio.id}-${index}-${nowISO.slice(0, 10)}`,
    studioId,
    // S-2: va en su propia columna, no en ruleId. Antes se metía aquí el id de
    // la automatización (`auto-*`), que violaba la FK a automation_rules: el log
    // NO se persistía y el dedup de marketing se quedaba sin datos, reenviando
    // el mismo mensaje a la misma socia en cada ejecución del cron.
    ruleId: null,
    automatizacionId: c.automatizacion.id,
    ruleName: c.automatizacion.nombre,
    socioId: c.socio.id,
    socioNombre: `${c.socio.nombre} ${c.socio.apellidos}`,
    pasoIndex: 0,
    accion: (esWhatsApp ? 'ENVIAR_WHATSAPP' : 'ENVIAR_EMAIL') as AutomationLog['accion'],
    ejecutadoEn: nowISO,
    proximaAccionEn: null,
    reciboId: null,
  };

  let log: AutomationLog;
  if (dry) {
    const destino = esWhatsApp ? c.socio.telefono : c.socio.email;
    log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `[DRY RUN] ${c.asunto} → ${destino}` };
  } else if (esWhatsApp) {
    // WhatsApp vía Twilio. Sin idempotency-key nativo: la garantía anti-reenvío es
    // la memoización del step.run (Inngest no re-ejecuta un step ya completado) +
    // el dedup por automation_logs del motor. Gap residual (envío OK y caída antes
    // de memoizar) igual que cualquier side-effect sin clave; aceptable para MVP.
    if (!twilioConfigurado('WHATSAPP')) {
      log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'WhatsApp no configurado (faltan credenciales Twilio)' };
    } else {
      const r = await enviarMensajeTwilio({ canal: 'WHATSAPP', to: c.socio.telefono, cuerpo: `${c.asunto}\n\n${c.mensaje}` });
      log = r.ok
        ? { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `WhatsApp enviado a ${c.socio.telefono}: "${c.asunto}"` }
        : { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: r.error ?? 'Error al enviar por Twilio' };
    }
  } else if (!c.socio.email) {
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'La socia no tiene email registrado' };
  } else {
    const html = await render(AutomatizacionEmail({ socioNombre: c.socio.nombre, titulo: c.asunto, mensaje: c.mensaje, estudioNombre: studioNombre }));
    const { error } = await resend!.emails.send(
      { from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>', to: [c.socio.email], subject: c.asunto, html },
      { idempotencyKey: base.id },
    );
    log = error
      ? { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: error.message }
      : { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `Email enviado a ${c.socio.email}: "${c.asunto}"` };
  }

  if (!dry) await dbUpsertAutomationLog(log);
  return log;
}

// ═══════════════════════════════════════════════════════════════════════════
// Función 1 · DISPATCHER (cron)
// Reemplaza el Vercel Cron de /api/cron/automatizaciones. Lista los estudios y
// hace fan-out: un evento por estudio. Así cada tenant se procesa aislado, con
// reintentos propios, y un estudio que peta no arrastra a los demás (P0-8).
// ═══════════════════════════════════════════════════════════════════════════
export const automatizacionesDispatcher = inngest.createFunction(
  // misma hora que el Vercel Cron anterior (UTC). En v4 los triggers van
  // dentro de las options, y el handler es el 2º argumento.
  { id: 'automatizaciones-dispatcher', triggers: [{ cron: '0 7 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());

    // Service-role, igual que decisionDispatcher: este código corre sin sesión,
    // así que con el cliente anónimo RLS devolvería CERO estudios y el cron
    // "completaría" sin procesar a nadie — en silencio y para todos los tenants.
    const studios = await step.run('list-studios', async () => {
      const { data, error } = await requireSupabaseAdmin().from('studios').select('id, nombre');
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (studios.length > 0) {
      await step.sendEvent(
        'fan-out-estudios',
        studios.map((s: { id: string; nombre: string }) => ({
          name: EVENTS.AUTOMATIZACIONES_ESTUDIO,
          data: { studioId: s.id, studioNombre: s.nombre, nowISO, dry: false },
        }))
      );
    }

    return { estudios: studios.length, ejecutadoEn: nowISO };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Función 2 · PROCESAR ESTUDIO (evento)
// Un run por estudio. Cada candidato es un step.run() durable e idempotente:
// si el run se cae a mitad (p.ej. estudio 30 de 50), al reintentar NO re-envía
// los emails ya mandados — retoma desde el candidato que faltaba.
// concurrency limita cuántos estudios se procesan a la vez (evita reventar
// Resend/Anthropic/PostgREST con 500k tenants a la vez).
// ═══════════════════════════════════════════════════════════════════════════
export const procesarEstudioAutomatizaciones = inngest.createFunction(
  {
    id: 'automatizaciones-estudio',
    triggers: [{ event: EVENTS.AUTOMATIZACIONES_ESTUDIO }],
    // Máximo del plan free de Inngest (5). Limita cuántos estudios se procesan
    // a la vez para no reventar Resend/Anthropic/PostgREST. Al subir de plan se
    // puede elevar.
    concurrency: { limit: 5 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, studioNombre, nowISO, dry } = event.data as {
      studioId: string; studioNombre: string; nowISO: string; dry: boolean;
    };
    const now = new Date(nowISO);

    const apiKey = process.env.RESEND_API_KEY;
    const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;
    if (!dry && !resend) {
      throw new Error('Resend no configurado (RESEND_API_KEY)');
    }

    const data = await step.run('fetch-data', () => fetchAllStudioData(studioId));

    // Puro y determinista: se recomputa igual en cada replay del handler.
    const candidatos = computeAutomationCandidatos(
      {
        automationRules: data.automationRules,
        automationLogs: data.automationLogs,
        socios: data.socios,
        reservas: data.reservas,
        recibos: data.recibos,
        sesiones: data.sesiones,
        tiposClase: data.tiposClase,
      },
      now
    );

    let emailsEnviados = 0, fallidos = 0, cobrosPropuestos = 0;
    const firedPorRegla = new Map<string, number>();

    for (let i = 0; i < candidatos.length; i++) {
      const c = candidatos[i];
      // id de step estable entre replays (índice + regla). Cada candidato es
      // un paso durable e independiente.
      const log = await step.run(`candidato-${i}-${c.rule.id}`, () =>
        procesarCandidato(c, { studioId, studioNombre, index: i, nowISO, dry, resend })
      );

      if (c.accion === 'COBRAR_RECIBO') cobrosPropuestos++;
      else if (log.resultado === 'EJECUTADO') emailsEnviados++;
      else if (log.resultado === 'FALLIDO') fallidos++;

      firedPorRegla.set(c.rule.id, (firedPorRegla.get(c.rule.id) ?? 0) + 1);
    }

    // Actualiza el contador de cada regla UNA vez, de forma determinista
    // (base fetcheado + nº de disparos de esta tanda). Idempotente en replay.
    if (!dry && firedPorRegla.size > 0) {
      await step.run('actualizar-reglas', async () => {
        for (const [ruleId, count] of firedPorRegla) {
          const base = data.automationRules.find(r => r.id === ruleId)?.ejecutadaVeces ?? 0;
          await dbUpdateAutomationRule(ruleId, studioId, { ejecutadaVeces: base + count, ultimaEjecucion: nowISO });
        }
      });
    }

    // ── Automatizaciones de MARKETING (tipo Automatizacion, con triggers) ──────
    // Antes se creaban pero nada las ejecutaba. Mismo patrón: candidatas puras +
    // envío durable por candidata + contador `ejecutadas`. Comparte automation_logs
    // (ruleId = id de la automatización) para dedup.
    const mktCandidatos = computeAutomatizacionMktCandidatos(
      { automatizaciones: data.automatizaciones, automationLogs: data.automationLogs, socios: data.socios, suscripciones: data.suscripciones, reservas: data.reservas, citas: data.citas },
      now,
    );
    let mktEnviados = 0, mktFallidos = 0;
    const firedPorAuto = new Map<string, number>();
    for (let i = 0; i < mktCandidatos.length; i++) {
      const c = mktCandidatos[i];
      const log = await step.run(`mkt-${i}-${c.automatizacion.id}-${c.socio.id}`, () =>
        procesarCandidatoMkt(c, { studioId, studioNombre, index: i, nowISO, dry, resend }),
      );
      if (log.resultado === 'EJECUTADO') mktEnviados++; else if (log.resultado === 'FALLIDO') mktFallidos++;
      firedPorAuto.set(c.automatizacion.id, (firedPorAuto.get(c.automatizacion.id) ?? 0) + 1);
    }
    if (!dry && firedPorAuto.size > 0) {
      await step.run('actualizar-automatizaciones', async () => {
        for (const [autoId, count] of firedPorAuto) {
          const base = data.automatizaciones.find(a => a.id === autoId)?.ejecutadas ?? 0;
          await dbUpdateAutomatizacion(autoId, studioId, { ejecutadas: base + count });
        }
      });
    }

    return { studioId, emailsEnviados, fallidos, cobrosPropuestos, mktEnviados, mktFallidos };
  }
);
