import { inngest, EVENTS, enviarFanOutEnLotes } from './client';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows, fetchAllStudioData, dbUpdateAutomationRule, dbUpdateAutomatizacion } from '@/lib/supabase-data';
import { dbUpsertAutomationLog } from '@/lib/db/supabase-data-admin';
import { computeAutomationCandidatos, type AutomationCandidato } from '@/lib/engines/automation-engine';
import { computeAutomatizacionMktCandidatos, type AutomatizacionMktCandidato } from '@/lib/engines/marketing-automation-engine';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { RECOMENDACION_SYSTEM_PROMPT, buildRecomendacionUserPrompt, type RecomendacionInput } from '@/lib/ai/recomendacion-prompt';
import { twilioConfigurado } from '@/lib/twilio';
import { MARCA_INACTIVIDAD } from '@/lib/engines/senales-inactividad';
import { resendEmailProvider } from '@/lib/marketing/providers/email-resend';
import { twilioSmsProvider } from '@/lib/marketing/providers/sms-twilio';
import { firmarBajaMarketing } from '@/lib/marketing/unsubscribe-token';
import { textoConsentimientoMarketing } from '@/lib/legal-textos';
import { appUrl } from '@/lib/emails/plantillas-server';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import type { AutomationLog, ResultadoLog } from '@/lib/types';
import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/nextjs';

const anthropic = new Anthropic();

// ── Redacción con IA (movida tal cual desde el cron) ─────────────────────────
// Falla-suave: si la IA no responde o no parsea, cae a `fallback`. CONTRATO
// DE SEGURIDAD: `fallback` debe ser SIEMPRE un texto ya apto para el
// destinatario final de este `input.tipo` (REACTIVACION → apto para la
// clienta; CLASE_LLENA → apto para la propietaria, nunca sale de aquí).
// Nunca pasar la nota interna de un candidato (AutomationCandidato.notaInterna)
// como fallback de un tipo que pueda acabar en un email a una clienta — eso
// fue exactamente el bug que mandaba la nota interna tal cual a la socia.
async function redactarConIA(input: RecomendacionInput, fallback: string): Promise<string> {
  // Sin clave no hay llamada que hacer: el SDK no lanza al construirse (deja
  // apiKey a null) y reventaba en cada `create` con "Could not resolve
  // authentication method", indistinguible de un rate limit por culpa del
  // `catch {}` de abajo. Un fallo de configuración merece su propio aviso.
  if (!process.env.ANTHROPIC_API_KEY) {
    Sentry.captureMessage('[redactarConIA] falta ANTHROPIC_API_KEY — se usa el texto por defecto', {
      level: 'error',
      tags: { fn: 'redactarConIA', tipo: input.tipo },
    });
    return fallback;
  }
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
  } catch (e) {
    // Antes era un `catch {}` que ni ligaba el error: la degradación al texto
    // genérico era invisible en Sentry y en los logs de Inngest, que reportan
    // la run como correcta porque el fallback la deja terminar bien.
    Sentry.captureException(e, { tags: { fn: 'redactarConIA', tipo: input.tipo } });
    return fallback;
  }
}

// Fallback fijo para REACTIVACION (OFRECER_DESCUENTO) cuando la IA falla o no
// responde. Debe seguir siendo válido para enviarse tal cual a la clienta —
// NUNCA la nota interna del candidato (ver contrato de redactarConIA arriba).
function fallbackReactivacion(nombre: string, descuentoPct: number, studioNombre: string): string {
  return `Hola ${nombre}, hace unos días que no te vemos por el estudio y nos encantaría que volvieras. Como agradecimiento por formar parte de ${studioNombre}, te ofrecemos un ${descuentoPct}% de descuento en tu próxima renovación. Nos encantaría verte en clase pronto — un abrazo, el equipo de ${studioNombre}.`;
}

// Fallback fijo para CROSS_SELL (PROPONER_PLAN) — mismo contrato que arriba.
function fallbackCrossSell(nombre: string, planSugerido: string, precioSugerido: number, studioNombre: string): string {
  return `Hola ${nombre}, hemos visto que sueles agotar tu bono cada mes — ¡nos encanta verte tan constante! Con tu ritmo actual, el plan ${planSugerido} (${precioSugerido}€/mes) puede salirte más a cuenta que seguir comprando bonos sueltos. ¿Te lo explicamos sin compromiso? Un abrazo, el equipo de ${studioNombre}.`;
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
  studioColor?: string | null;
  studioLogo?: string | null;
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
  const { studioId, studioNombre, studioColor, studioLogo, index, nowISO, dry, resend } = opts;
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
  //
  // `detalle` = SIEMPRE nota interna (para la propietaria). `mensajeCliente` =
  // SIEMPRE el texto que recibiría la clienta si se envía, o null si no aplica
  // — nunca el mismo campo para las dos cosas (ese solapamiento era el bug).
  if (c.accion === 'COBRAR_RECIBO') {
    log = { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle: c.notaInterna ?? '', mensajeCliente: null };
  } else if (c.accion === 'OFRECER_DESCUENTO' && c.contextoIA) {
    const nombre = String(c.contextoIA.nombre);
    const descuentoPct = Number(c.contextoIA.descuentoPct);
    // Fallback SIEMPRE apto para la clienta — nunca c.notaInterna (esa es la
    // frase "¿le enviamos una oferta...?" dirigida a la propietaria).
    const mensajeCliente = await redactarConIA(
      { tipo: 'REACTIVACION', nombre, diasSinVenir: Number(c.contextoIA.diasSinVenir), descuentoPct },
      fallbackReactivacion(nombre, descuentoPct, studioNombre)
    );
    log = { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle: c.notaInterna ?? '', mensajeCliente };
  } else if (c.accion === 'PROPONER_PLAN' && c.contextoIA) {
    const nombre = String(c.contextoIA.nombre);
    const planSugerido = String(c.contextoIA.planSugerido);
    const precioSugerido = Number(c.contextoIA.precioSugerido);
    // Fallback SIEMPRE apto para la clienta — nunca c.notaInterna.
    const mensajeCliente = await redactarConIA(
      { tipo: 'CROSS_SELL', nombre, planActual: String(c.contextoIA.planActual), planSugerido, precioSugerido },
      fallbackCrossSell(nombre, planSugerido, precioSugerido, studioNombre)
    );
    log = { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle: c.notaInterna ?? '', mensajeCliente };
  } else if (c.accion === 'NOTIFICAR_ADMIN') {
    // La condición era `NOTIFICAR_ADMIN && c.contextoIA`, y sólo un candidato de
    // los tres que emite el motor lleva contextoIA (CLASE_LLENA_RECURRENTE). Los
    // otros dos — "Pago pendiente sin resolver" (automation-engine.ts:225) y
    // "Socia nueva sin actividad" (:420) — caían por toda la cascada hasta el
    // guard de email y morían con FALLIDO "Falta el mensaje para la clienta":
    // un aviso dirigido a la propietaria rechazado por no traer texto para la
    // clienta. Nunca llegaban, y son justo los dos avisos de "llámala tú".
    // NOTIFICAR_ADMIN no tiene camino de envío a la clienta (mensajeCliente
    // siempre null, sin botón de enviar en la UI), así que su notaInterna basta:
    // la IA sólo aporta redacción cuando hay contexto para ella.
    const detalle = c.contextoIA
      ? await redactarConIA(
          { tipo: 'CLASE_LLENA', tipoClase: String(c.contextoIA.tipoClase), diaSemana: String(c.contextoIA.diaSemana), hora: String(c.contextoIA.hora), semanas: Number(c.contextoIA.semanas) },
          c.notaInterna ?? c.titulo
        )
      : (c.notaInterna ?? c.titulo);
    log = { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle, mensajeCliente: null };
  } else if (!c.socio) {
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'Acción sin socia asociada', mensajeCliente: null };
  } else if (dry) {
    const destino = c.accion === 'ENVIAR_WHATSAPP' ? c.socio.telefono : c.socio.email;
    log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `[DRY RUN] ${c.titulo} → ${destino}`, mensajeCliente: c.mensajeCliente ?? null };
  } else if (c.accion === 'ENVIAR_WHATSAPP') {
    if (!c.mensajeCliente) {
      log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'Falta el mensaje para la clienta', mensajeCliente: null };
    } else if (!c.socio.telefono || !twilioConfigurado('WHATSAPP')) {
      // Sin teléfono o sin Twilio configurado: no hay forma de mandarlo por
      // WhatsApp. El motor solo elige este canal cuando SÍ hay teléfono (ver
      // automation-engine.ts), así que llegar aquí sin poder enviar es un
      // fallo real, no algo que debamos disfrazar reintentando por email.
      log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'WhatsApp no disponible (sin teléfono o sin Twilio configurado)', mensajeCliente: c.mensajeCliente };
    } else {
      const r = await twilioSmsProvider.enviar({ canal: 'WHATSAPP', to: c.socio.telefono, cuerpo: c.mensajeCliente });
      log = r.ok
        ? { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `WhatsApp enviado a ${c.socio.telefono}.`, mensajeCliente: c.mensajeCliente }
        : { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: r.error ?? 'Error al enviar por Twilio', mensajeCliente: c.mensajeCliente };
    }
  } else if (!c.socio.email) {
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'La socia no tiene email registrado', mensajeCliente: null };
  } else if (esDominioReservado(c.socio.email)) {
    // Los dominios de ejemplo (RFC 2606) los rechaza Resend con "Invalid `to`
    // field. Please use our testing email address instead of domains like
    // example.com" — un error suyo, en inglés, que a la propietaria no le dice
    // nada. Cortamos antes: nos ahorramos la llamada y le decimos qué arreglar.
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, mensajeCliente: c.mensajeCliente ?? null,
      detalle: `${c.socio.nombre} tiene un email de ejemplo (${c.socio.email}), no una dirección real. Corrígelo en su ficha para que reciba los avisos.` };
  } else if (!c.mensajeCliente) {
    // ENVIAR_EMAIL sin mensajeCliente sería exactamente el patrón del bug si
    // se intentara enviar otra cosa por defecto — mejor fallar explícito.
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'Falta el mensaje para la clienta', mensajeCliente: null };
  } else {
    const email = c.socio.email;
    const html = await render(AutomatizacionEmail({
      socioNombre: c.socio.nombre,
      titulo: c.titulo,
      mensaje: c.mensajeCliente,
      estudioNombre: studioNombre,
      colorPrimario: studioColor,
      logoUrl: studioLogo,
    }));
    // Un 429 (u otro fallo transitorio de Resend) no debe perderse como
    // FALLIDO permanente — ver lib/emails/resend-reintentos.ts (dentro de
    // resendEmailProvider).
    const r = await resendEmailProvider(resend!).enviar({
      to: email,
      subject: c.titulo,
      html,
      studioNombre,
      // Idempotency-Key: si el step se reintenta tras enviar pero antes de
      // memoizar, Resend reconoce la clave y NO reenvía el email.
      idempotencyKey: base.id,
    });
    if (!r.ok) {
      log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: r.error ?? 'Error al enviar por Resend', mensajeCliente: c.mensajeCliente };
    } else {
      log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `Email enviado a ${c.socio.email}: "${c.titulo}"`, mensajeCliente: c.mensajeCliente };
    }
  }

  // Marca el log como parte de la señal "socia inactiva" para que el motor de
  // marketing (INACTIVIDAD_30D) pueda deduplicar en cruz — ver
  // docs/marketing-solape-motores-diseno.md §2 y senales-inactividad.ts.
  if (c.marcaInactividad) log = { ...log, detalle: `${MARCA_INACTIVIDAD} ${log.detalle}` };

  if (!dry) await dbUpsertAutomationLog(log);
  return log;
}

// Envía una candidata de MARKETING (Automatizacion con asunto/mensaje del
// usuario) y persiste el log en automation_logs (ruleId = id de la
// automatización, para dedup y contador). Idempotency-Key por id de log.
export async function procesarCandidatoMkt(c: AutomatizacionMktCandidato, opts: ProcesarOpts): Promise<AutomationLog> {
  const { studioId, studioColor, studioLogo, index, nowISO, dry, resend } = opts;
  const accionLog: AutomationLog['accion'] =
    c.canal === 'WHATSAPP' ? 'ENVIAR_WHATSAPP' : c.canal === 'NOTIFICACION' ? 'NOTIFICAR_ADMIN' : 'ENVIAR_EMAIL';
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
    accion: accionLog,
    ejecutadoEn: nowISO,
    proximaAccionEn: null,
    reciboId: null,
  };

  let log: AutomationLog;
  if (dry) {
    const destino = c.canal === 'WHATSAPP' ? c.socio.telefono : c.canal === 'NOTIFICACION' ? 'equipo (interno)' : c.socio.email;
    log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `[DRY RUN] ${c.asunto} → ${destino}` };
  } else if (c.canal === 'NOTIFICACION') {
    // Aviso interno para el equipo: NUNCA se construye a partir de
    // asunto/mensaje de la automatización (esos están redactados en segunda
    // persona para la socia — reusarlos aquí tal cual sería el mismo tipo de
    // mezcla interno/cliente que el bug de OFRECER_DESCUENTO, solo que al
    // revés). Se genera un texto propio, siempre inequívocamente interno.
    // Migrado al Notification Engine: escribía en la tabla legacy
    // `notificaciones`, que ya no lee ninguna superficie (la campana y la bandeja
    // usan el motor) → estos avisos se perdían sin que nadie los viera.
    let error: { message: string } | null = null;
    try {
      const { publish } = await import('@/lib/notifications/engine');
      const { EVENTOS } = await import('@/lib/notifications/catalog');
      await publish({
        type: EVENTOS.AUTOMATIZACION_DISPARADA,
        studioId,
        data: {
          automatizacion: c.automatizacion.nombre,
          socia: `${c.socio.nombre} ${c.socio.apellidos}`.trim(),
          socioId: c.socio.id,
        },
        resource: { type: 'socio', id: c.socio.id },
        dedupKey: `automatizacion:${base.id}`,
      });
    } catch (e) {
      error = { message: e instanceof Error ? e.message : 'error al publicar el aviso' };
    }
    log = error
      ? { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: error.message }
      : { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `Aviso interno creado para el equipo sobre ${c.socio.nombre}.` };
  } else if (c.canal === 'WHATSAPP') {
    // WhatsApp vía Twilio. Sin idempotency-key nativo: la garantía anti-reenvío es
    // la memoización del step.run (Inngest no re-ejecuta un step ya completado) +
    // el dedup por automation_logs del motor. Gap residual (envío OK y caída antes
    // de memoizar) igual que cualquier side-effect sin clave; aceptable para MVP.
    if (!twilioConfigurado('WHATSAPP')) {
      log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'WhatsApp no configurado (faltan credenciales Twilio)' };
    } else {
      const r = await twilioSmsProvider.enviar({ canal: 'WHATSAPP', to: c.socio.telefono, cuerpo: `${c.asunto}\n\n${c.mensaje}` });
      log = r.ok
        ? { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `WhatsApp enviado a ${c.socio.telefono}: "${c.asunto}"` }
        : { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: r.error ?? 'Error al enviar por Twilio' };
    }
  } else if (!c.socio.email) {
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'La socia no tiene email registrado' };
  } else if (esDominioReservado(c.socio.email)) {
    // Mismo corte que procesarCandidato (arriba) — sin él, este camino
    // (marketing) dejaba pasar el email a Resend y devolvía crudo su error
    // en inglés ("Invalid `to` field...") a la propietaria.
    log = { ...base, resultado: 'FALLIDO' as ResultadoLog,
      detalle: `${c.socio.nombre} tiene un email de ejemplo (${c.socio.email}), no una dirección real. Corrígelo en su ficha para que reciba los avisos.` };
  } else {
    const html = await render(AutomatizacionEmail({
      socioNombre: c.socio.nombre, titulo: c.asunto, mensaje: c.mensaje, estudioNombre: opts.studioNombre,
      colorPrimario: studioColor, logoUrl: studioLogo,
      // LSSI: toda comunicación comercial lleva enlace de baja.
      unsubscribeUrl: `${appUrl()}/api/marketing/baja?token=${firmarBajaMarketing(opts.studioId, c.socio.id)}`,
    }));
    // Mismo reintento ante fallos transitorios que en procesarCandidato (ver
    // resendEmailProvider).
    const r = await resendEmailProvider(resend!).enviar({
      to: c.socio.email, subject: c.asunto, html, studioNombre: opts.studioNombre, idempotencyKey: base.id,
    });
    log = !r.ok
      ? { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: r.error ?? 'Error al enviar por Resend' }
      : { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `Email enviado a ${c.socio.email}: "${c.asunto}"` };
  }

  // Marca el log como parte de la señal "socia inactiva" para que el motor
  // clásico (AUSENCIA_DIAS) pueda deduplicar en cruz — ver
  // docs/marketing-solape-motores-diseno.md §2 y senales-inactividad.ts.
  if (c.marcaInactividad) log = { ...log, detalle: `${MARCA_INACTIVIDAD} ${log.detalle}` };

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
      // `suspendido_en`: un estudio suspendido por impago/abuso no debe seguir
      // recibiendo mensajes automáticos con IA a nombre del negocio.
      // Paginado: sin él, PostgREST corta a 1.000 en silencio y pasado ese
      // punto habría estudios que no reciben NINGUNA automatización, sin error.
      const { data, error } = await fetchAllRows<{ id: string; nombre: string; color_primario: string | null; logo_url: string | null }>(
        '(global)', 'studios',
        (from, to) => requireSupabaseAdmin().from('studios')
          .select('id, nombre, color_primario, logo_url').is('suspendido_en', null).range(from, to),
      );
      if (error) throw new Error(error.message);
      return data;
    });

    await enviarFanOutEnLotes(
      step, 'fan-out-estudios', EVENTS.AUTOMATIZACIONES_ESTUDIO, studios,
      (s: { id: string; nombre: string; color_primario: string | null; logo_url: string | null }) =>
        ({ studioId: s.id, studioNombre: s.nombre, studioColor: s.color_primario, studioLogo: s.logo_url, nowISO, dry: false }),
    );

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
    const { studioId, studioNombre, studioColor, studioLogo, nowISO, dry } = event.data as {
      studioId: string; studioNombre: string; studioColor: string | null; studioLogo: string | null; nowISO: string; dry: boolean;
    };
    const now = new Date(nowISO);

    const apiKey = process.env.RESEND_API_KEY;
    const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;
    if (!dry && !resend) {
      throw new Error('Resend no configurado (RESEND_API_KEY)');
    }

    // Lo que sale de un `step.run` se serializa ENTERO como estado de Inngest:
    // viaja a Inngest, se guarda, y se reconstruye en cada replay del handler.
    // `fetchAllStudioData` devuelve ~55 conjuntos (es el arranque completo del
    // panel) y este cron usa ONCE — los otros ~44 se serializaban, se
    // almacenaban y se volvían a deserializar en cada reintento sin que nadie
    // los leyera nunca.
    //
    // El recorte va DENTRO del step, no fuera: fuera no serviría de nada,
    // porque lo que se guarda es justo lo que el step devuelve.
    //
    // La lista es la unión exacta de lo que consumen las dos llamadas de abajo
    // (`computeAutomationCandidatos` y `computeAutomatizacionMktCandidatos`),
    // ambas con desestructurado explícito y sin spread — si alguna pide un
    // campo nuevo, `tsc` lo nombra aquí.
    //
    // No se toca `construirSnapshot` (Decision OS): ese YA devuelve un
    // SnapshotEstudio recortado, con ventanas temporales incluidas.
    const data = await step.run('fetch-data', async () => {
      const d = await fetchAllStudioData(studioId);
      return {
        automationRules: d.automationRules,
        automationLogs: d.automationLogs,
        automatizaciones: d.automatizaciones,
        socios: d.socios,
        reservas: d.reservas,
        recibos: d.recibos,
        sesiones: d.sesiones,
        citas: d.citas,
        tiposClase: d.tiposClase,
        suscripciones: d.suscripciones,
        planesTarifa: d.planesTarifa,
      };
    });

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
        suscripciones: data.suscripciones,
        planesTarifa: data.planesTarifa,
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
        procesarCandidato(c, { studioId, studioNombre, studioColor, studioLogo, index: i, nowISO, dry, resend })
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

    // Guard de consentimiento (art. 7.4 RGPD, docs/marketing-integrations-arquitectura.md
    // §7): select TARGETED con el texto completo — data.socios (arriba) NO lo
    // trae, mismo motivo que aceptacion_version (ver FilaSocioPanel). Filas
    // crudas, no un Map: lo que devuelve un step.run se serializa como estado
    // de Inngest y un Map se reconstruye como {} en el replay (mismo gotcha ya
    // documentado para dbGetFeatureFlags) — el Map se construye fuera del step.
    const filasConsentimiento = await step.run('fetch-consentimientos', async () => {
      const { data: rows } = await requireSupabaseAdmin()
        .from('socios').select('id, consentimiento_marketing_texto').eq('studio_id', studioId);
      return (rows ?? []) as { id: string; consentimiento_marketing_texto: string | null }[];
    });
    const consentimientosMarketing = new Map<string, string>();
    for (const row of filasConsentimiento) {
      if (row.consentimiento_marketing_texto) consentimientosMarketing.set(row.id, row.consentimiento_marketing_texto);
    }
    const textoConsentimientoVigente = textoConsentimientoMarketing({ nombre: studioNombre });

    // ── Automatizaciones de MARKETING (tipo Automatizacion, con triggers) ──────
    // Antes se creaban pero nada las ejecutaba. Mismo patrón: candidatas puras +
    // envío durable por candidata + contador `ejecutadas`. Comparte automation_logs
    // (ruleId = id de la automatización) para dedup.
    const mktCandidatos = computeAutomatizacionMktCandidatos(
      {
        automatizaciones: data.automatizaciones, automationLogs: data.automationLogs, socios: data.socios,
        suscripciones: data.suscripciones, reservas: data.reservas, citas: data.citas,
        consentimientosMarketing, textoConsentimientoVigente,
      },
      now,
    );
    let mktEnviados = 0, mktFallidos = 0;
    const firedPorAuto = new Map<string, number>();
    for (let i = 0; i < mktCandidatos.length; i++) {
      const c = mktCandidatos[i];
      const log = await step.run(`mkt-${i}-${c.automatizacion.id}-${c.socio.id}`, () =>
        procesarCandidatoMkt(c, { studioId, studioNombre, studioColor, studioLogo, index: i, nowISO, dry, resend }),
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
