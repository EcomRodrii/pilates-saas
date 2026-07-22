// Pipeline Inngest del Decision OS (DECISION-OS-ARQUITECTURA.md §6). Clona el
// patrón dispatcher→fan-out→steps idempotentes de lib/inngest/automatizaciones.ts.
// El cliente se importa desde './client' (mismo orden que ese archivo, nota OTel).
import { inngest, EVENTS } from './client';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { tieneFeature } from '@/lib/billing/entitlements';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { uid } from '@/lib/utils';
import { construirSnapshot } from '@/lib/decision/snapshot';
import { ejecutarAnalisis } from '@/lib/decision/motor';
import { redactar, type ItemARedactar, type ItemRedactado } from '@/lib/decision/redaccion';
import { ventanaDiasDe, medirOutcome, type SenalMedicion } from '@/lib/decision/outcomes';
import { resolverNivelAutonomiaPorTipo } from '@/lib/decision/confianza';
import { mensajeParaSocia } from '@/lib/decision/mensajes-socia';
import { personalizarMensajeSocia } from '@/lib/decision/personalizacion';
import { generarCodigoReactivacion } from '@/lib/codigos-descuento';
import { enviarMensajeTwilio, twilioConfigurado } from '@/lib/twilio';
import { ALGORITHM_VERSION } from '@/lib/decision/version';
import {
  dbInsertDecisionSession, dbFinalizarDecisionSession, dbUpsertRecomendacion, dbTransicionarRecomendacion,
  dbListPendientes, dbListResueltas90d, dbListMemoriaRows, construirMapaMemoria, dbUpsertResumenDiario, dbUpsertHechoMemoria,
  dbInsertOutcome, dbActualizarOutcome, dbGetRecomendacion, dbGetOutcomePorRecomendacion, construirRecomendacion,
  dbLogActividadReciente, dbGetAutonomiaConfig, dbCountAutonomasHoy,
} from '@/lib/decision/db';
import { seleccionarAutonomas } from '@/lib/decision/autonomia';
import type { Recomendacion } from '@/lib/decision/tipos';
import type { CandidataPriorizada } from '@/lib/decision/prioridad';

const MS_DIA = 86400000;

async function nombrePropietarioDe(studioId: string): Promise<{ nombrePropietario: string; nombreEstudio: string; ownerAuthUserId: string | null }> {
  const { data: studio } = await requireSupabaseAdmin().from('studios').select('nombre, owner_auth_user_id').eq('id', studioId).single();
  return { nombrePropietario: studio?.nombre ?? 'tu estudio', nombreEstudio: studio?.nombre ?? '', ownerAuthUserId: studio?.owner_auth_user_id ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
// F1 · DISPATCHER (cron) — 06:30 y 14:30 UTC, desplazado del de
// automatizaciones (07:00) para no competir por la concurrency del plan free.
// ═══════════════════════════════════════════════════════════════════════════
export const decisionDispatcher = inngest.createFunction(
  { id: 'decision-dispatcher', triggers: [{ cron: '30 6,14 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());

    const estudios = await step.run('list-estudios-elegibles', async () => {
      const { data, error } = await requireSupabaseAdmin().from('studios').select('id, nombre, plan, subscription_status');
      if (error) throw new Error(error.message);
      const conPlan = (data ?? []).filter(s => tieneFeature({ plan: s.plan, subscriptionStatus: s.subscription_status }, 'decisiones'));
      if (conPlan.length === 0) return [];

      // El flag DECISIONES es un KILL-SWITCH, no un opt-in. Antes el cron exigía
      // flag `activo=true`, pero NADA lo activa nunca (dbSetFeatureFlag no tiene
      // callers) → la lista salía vacía y el análisis diario NO corría para NINGÚN
      // estudio; solo se poblaba con "Analizar ahora" manual. Ahora se analizan
      // todos los estudios con el plan, salvo los explícitamente DESACTIVADOS con
      // un flag activo=false. Coherente con GET /api/decisiones y /analizar, que
      // solo gatean por plan.
      const ids = conPlan.map(s => s.id);
      const { data: flags } = await requireSupabaseAdmin()
        .from('decision_feature_flags').select('studio_id, activo').eq('flag', 'DECISIONES').in('studio_id', ids);
      const desactivados = new Set((flags ?? []).filter(f => f.activo === false).map(f => f.studio_id as string));
      return conPlan.filter(s => !desactivados.has(s.id)).map(s => ({ id: s.id }));
    });

    if (estudios.length > 0) {
      await step.sendEvent('fan-out-estudios', estudios.map((e: { id: string }) => ({
        name: EVENTS.DECISION_ANALYZE,
        data: { studioId: e.id, disparadoPor: 'CRON' as const, nowISO },
      })));
    }

    return { estudios: estudios.length, ejecutadoEn: nowISO };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// F2 · ANALIZAR ESTUDIO — un run por estudio. concurrency 3 (comparte el
// límite de cuenta del plan free con automatizaciones, Arquitectura §11).
// ═══════════════════════════════════════════════════════════════════════════
export const analizarEstudio = inngest.createFunction(
  { id: 'decision-analizar-estudio', triggers: [{ event: EVENTS.DECISION_ANALYZE }], concurrency: { limit: 3 }, retries: 3 },
  async ({ event, step }) => {
    const { studioId, disparadoPor, nowISO } = event.data as { studioId: string; disparadoPor: 'CRON' | 'MANUAL' | 'REACTIVO'; nowISO: string };
    const now = new Date(nowISO);

    const sessionId = await step.run('crear-sesion', () =>
      dbInsertDecisionSession({ studioId, disparadoPor, algorithmVersion: ALGORITHM_VERSION, iniciadoEn: nowISO })
    );

    const [snapshot, memoriaRows, pendientesActuales, resueltas90d, { nombrePropietario, nombreEstudio }] = await Promise.all([
      step.run('snapshot', () => construirSnapshot(studioId, now)),
      step.run('memoria', () => dbListMemoriaRows(studioId)),
      step.run('pendientes', () => dbListPendientes(studioId)),
      step.run('resueltas', () => dbListResueltas90d(studioId, now)),
      step.run('propietario', () => nombrePropietarioDe(studioId)),
    ]);
    // Se reconstruye FUERA del step: un Map no sobrevive la serialización a
    // JSON que Inngest hace entre steps (ver lib/decision/db.ts).
    const memoria = construirMapaMemoria(memoriaRows);

    // Puro y determinista: se recomputa igual en cada replay del handler.
    const resultado = ejecutarAnalisis({
      snapshot, memoria, pendientesActuales, resueltas90d, nombrePropietario,
      ventanaMientrasDormiasDesde: new Date(now.getTime() - 17 * 3600000), // ~21:00 del día anterior
      now,
    });

    // Candidatas → Recomendacion con id + contexto de sesión (ID de negocio,
    // fuera del núcleo puro — Fase A no genera ids).
    const nowISOStr = now.toISOString();
    const recomendaciones: Recomendacion[] = resultado.candidatasFinales.map((c: CandidataPriorizada) =>
      construirRecomendacion(c, {
        id: uid(), studioId, decisionSessionId: sessionId, algorithmVersion: ALGORITHM_VERSION,
        nivelAutonomia: resolverNivelAutonomiaPorTipo(c.tipo, c.confianza),
        expiraEn: new Date(now.getTime() + c.expiraEnDias * MS_DIA).toISOString(),
        creadoEn: nowISOStr,
      })
    );

    // Redacción: lote único con las ≤10 de mayor score (Especialistas §8.3).
    const fallbackPorId = new Map<string, ItemRedactado>(recomendaciones.map(r => [r.id, { titulo: r.titulo, motivo: r.motivo }]));
    const paraRedactar: ItemARedactar[] = [...recomendaciones]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(r => ({ id: r.id, especialista: r.especialista, tipo: r.tipo, datosUsados: r.datosUsados }));

    const redaccion = await step.run('redactar', () =>
      redactar({ nombrePropietario, nombreEstudio, saludoBase: resultado.resumenDiario.saludo, items: paraRedactar }, fallbackPorId)
    );
    const redaccionPorId = new Map(redaccion.items.map(it => [it.id, it]));

    const recomendacionesRedactadas = recomendaciones.map(r => {
      const texto = redaccionPorId.get(r.id);
      return texto ? { ...r, titulo: texto.titulo, motivo: texto.motivo } : r;
    });

    // Persistencia: un step por recomendación (durable, replay-safe — patrón
    // "candidato-i" de automatizacionesDispatcher).
    for (let i = 0; i < recomendacionesRedactadas.length; i++) {
      const r = recomendacionesRedactadas[i];
      await step.run(`persistir-${i}-${r.dedupeKey}`, () => dbUpsertRecomendacion(r));
    }

    for (const exp of resultado.expiraciones) {
      await step.run(`expirar-${exp.id}`, () => dbTransicionarRecomendacion(exp.id, studioId, 'PENDIENTE', 'EXPIRADA'));
    }

    // ── Piloto automático (0047) ──────────────────────────────────────────────
    // Si el estudio lo activó, las recomendaciones PENDIENTE de ALTA confianza +
    // autonomía ≥2 cuyo tipo esté en su allowlist se APRUEBAN y ejecutan solas,
    // hasta el tope diario. La ejecución reutiliza F3 (DECISION_APPROVED); quedan
    // marcadas con resuelto_por='AUTONOMIA' y con traza en el feed de actividad.
    const autonomas = await step.run('seleccionar-autonomas', async () => {
      const config = await dbGetAutonomiaConfig(studioId);
      if (!config.activa) return [] as { id: string }[];
      const yaHoy = await dbCountAutonomasHoy(studioId, now);
      // Se releen las PENDIENTE reales (estado + id ya persistidos), no el objeto en memoria.
      const pendientes = await dbListPendientes(studioId);
      return seleccionarAutonomas(pendientes, config, yaHoy).map(r => ({ id: r.id }));
    });

    for (const a of autonomas) {
      const aprobada = await step.run(`autonomia-aprobar-${a.id}`, () =>
        dbTransicionarRecomendacion(a.id, studioId, 'PENDIENTE', 'APROBADA', { resueltoPor: 'AUTONOMIA', resueltoEn: new Date().toISOString() })
      );
      // Solo se emite el evento de ejecución si la transición realmente ocurrió
      // (evita ejecutar dos veces ante un replay del handler).
      if (aprobada.ok) {
        await step.sendEvent(`autonomia-ejecutar-${a.id}`, { name: EVENTS.DECISION_APPROVED, data: { recomendacionId: a.id } });
      }
    }

    if (resultado.nuevosHechosMemoria.length > 0) {
      await step.run('memoria-automatica', async () => {
        for (const h of resultado.nuevosHechosMemoria) await dbUpsertHechoMemoria(h);
      });
    }

    const resumenFinal = { ...resultado.resumenDiario, studioId, saludo: redaccion.saludo };
    const resumenDiarioId = await step.run('resumen-diario', () => dbUpsertResumenDiario(resumenFinal));

    await step.run('finalizar-sesion', () => dbFinalizarDecisionSession(sessionId, {
      finalizadoEn: new Date().toISOString(),
      snapshotStats: { socios: snapshot.socios.length, sesiones: snapshot.sesiones.length, recibosPendientes: snapshot.recibos.filter(r => r.estado === 'PENDIENTE').length },
      nCandidatasGeneradas: resultado.estadisticas.nCandidatasGeneradas,
      nCandidatasDescartadas: resultado.estadisticas.nCandidatasDescartadas,
      nRecomendacionesPersistidas: resultado.estadisticas.nRecomendacionesPersistidas,
      resumenDiarioId, errores: null, estado: 'COMPLETADA',
    }));

    return { studioId, sessionId, recomendaciones: recomendacionesRedactadas.length, prioridades: resultado.prioridadesHome.length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// F3 · EJECUTAR RECOMENDACIÓN — al aprobar, un step por recibo cuando el lote
// tiene varios (Arquitectura §6 F3).
// ═══════════════════════════════════════════════════════════════════════════
// Next-best-offer: crea un código de descuento REAL y canjeable para la socia
// (antes el `descuentoPct` era solo texto en el email: prometíamos algo que el
// sistema no sabía canjear). Determinista por recomendación → reintentar el envío
// no crea códigos nuevos. Un solo uso y caduca en 30 días.
const DIAS_VIGENCIA_CODIGO = 30;

async function crearCodigoReactivacion(r: Recomendacion): Promise<string | null> {
  const pct = typeof r.datosUsados.descuentoPct === 'number' ? r.datosUsados.descuentoPct : 0;
  if (pct <= 0) return null;

  const codigo = generarCodigoReactivacion(r.id);
  const admin = requireSupabaseAdmin();

  // Idempotencia: si ya existe ese código en el estudio, se reutiliza.
  const { data: existente } = await admin
    .from('codigos_descuento').select('id').eq('studio_id', r.studioId).eq('codigo', codigo).maybeSingle();
  if (existente) return codigo;

  const nombre = typeof r.datosUsados.nombre === 'string' ? r.datosUsados.nombre : 'socia';
  const expira = new Date(Date.now() + DIAS_VIGENCIA_CODIGO * MS_DIA).toISOString().slice(0, 10);
  const { error } = await admin.from('codigos_descuento').insert({
    id: uid(), studio_id: r.studioId, codigo,
    descripcion: `Reactivación de ${nombre} (Centro de Control)`,
    tipo: 'PORCENTAJE', valor: pct, usos: 0, usos_max: 1,
    expira, activo: true, creado_en: new Date().toISOString(),
  });
  if (error) return null; // sin código el mensaje sigue siendo correcto (sin prometerlo)
  return codigo;
}

// El `titulo`/`motivo` de una recomendación está redactado para el PROPIETARIO
// ("¿Le ofrecemos una vuelta con descuento a Marta?"). Enviárselo tal cual a la
// socia era un fallo real —y el piloto automático lo mandaría solo—, así que aquí
// SIEMPRE se manda el mensaje orientado a ella (mensajeParaSocia), reescrito con
// IA para que suene personal (falla-suave al determinista).
async function ejecutarEnvioEmail(r: Recomendacion): Promise<{ ok: boolean; detalle: string }> {
  if (!r.socioId) return { ok: false, detalle: 'Sin socia asociada' };
  const [{ data: socio }, { data: studio }] = await Promise.all([
    requireSupabaseAdmin().from('socios').select('nombre, email').eq('id', r.socioId).single(),
    requireSupabaseAdmin().from('studios').select('nombre, color_primario, logo_url').eq('id', r.studioId).single(),
  ]);
  if (!socio?.email) return { ok: false, detalle: 'La socia no tiene email registrado' };

  const estudioNombre = studio?.nombre ?? '';

  // Next-best-offer: si la recomendación lleva descuento, se crea el código real
  // ANTES de redactar, para que el mensaje lo incluya y sea canjeable en el POS.
  const codigoDescuento = r.tipo === 'ENVIAR_REACTIVACION' ? await crearCodigoReactivacion(r) : null;
  const datos = codigoDescuento ? { ...r.datosUsados, codigoDescuento } : r.datosUsados;

  const base = mensajeParaSocia(r.tipo, datos, estudioNombre);
  // Sin mensaje para la socia NO se envía nada: antes caía al texto del
  // propietario, que es justo lo que no debe recibir.
  if (!base) return { ok: false, detalle: 'Sin mensaje para la socia para este tipo de recomendación' };

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;
  if (!resend) return { ok: false, detalle: 'Resend no configurado (RESEND_API_KEY)' };

  const mensaje = await personalizarMensajeSocia(base, {
    nombreEstudio: estudioNombre, tipo: r.tipo, datosUsados: datos,
    // El código debe sobrevivir intacto a la reescritura de la IA.
    literalesObligatorios: codigoDescuento ? [codigoDescuento] : [],
  });

  const html = await render(AutomatizacionEmail({
    socioNombre: socio.nombre, titulo: mensaje.asunto, mensaje: mensaje.cuerpo, estudioNombre,
    colorPrimario: studio?.color_primario, logoUrl: studio?.logo_url,
  }));
  const { error } = await resend.emails.send(
    { from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>', to: [socio.email], subject: mensaje.asunto, html },
    { idempotencyKey: r.id }
  );
  if (error) return { ok: false, detalle: error.message };
  // El código va en el detalle para que quede visible en el feed "Actividad" del
  // Centro de Control: el propietario tiene que poder ver qué se prometió.
  return {
    ok: true,
    detalle: codigoDescuento
      ? `Email enviado a ${socio.email} · código ${codigoDescuento}`
      : `Email enviado a ${socio.email}`,
  };
}

// Al aprobar una recomendación de CONTACTO_MANUAL: se envía a la socia el mensaje
// orientado a ELLA (no el motivo del propietario) por email. El propietario tiene
// además el botón de WhatsApp en la tarjeta. Sin socia/email/mensaje → se marca
// gestionada sin fallar (la acción real la hace el propietario por WhatsApp).
async function ejecutarContactoSocia(r: Recomendacion): Promise<{ ok: boolean; detalle: string }> {
  if (!r.socioId) return { ok: true, detalle: 'Recomendación sin socia — marcada como gestionada.' };
  const [{ data: socio }, { data: studio }] = await Promise.all([
    requireSupabaseAdmin().from('socios').select('nombre, email, telefono').eq('id', r.socioId).single(),
    requireSupabaseAdmin().from('studios').select('nombre, color_primario, logo_url').eq('id', r.studioId).single(),
  ]);
  const base = mensajeParaSocia(r.tipo, r.datosUsados, studio?.nombre ?? '');
  if (!base) return { ok: true, detalle: 'Sin mensaje automático para este tipo — marcada como gestionada.' };
  // Mismo mensaje, reescrito con IA para que suene personal (falla-suave).
  const mensaje = await personalizarMensajeSocia(base, { nombreEstudio: studio?.nombre ?? '', tipo: r.tipo, datosUsados: r.datosUsados });

  // Si la recomendación es de canal WhatsApp y hay Twilio + teléfono, se envía el
  // WhatsApp de VERDAD al aprobar (antes era siempre un clic manual del propietario).
  // Si Twilio falla o no está, cae al email; y si tampoco hay email, queda el botón
  // manual de WhatsApp en la tarjeta.
  const canalRec = r.accion.tipo === 'CONTACTO_MANUAL' ? r.accion.canal : null;
  if (canalRec === 'WHATSAPP' && socio?.telefono && twilioConfigurado('WHATSAPP')) {
    const rw = await enviarMensajeTwilio({ canal: 'WHATSAPP', to: socio.telefono, cuerpo: mensaje.cuerpo });
    if (rw.ok) return { ok: true, detalle: `WhatsApp enviado a ${socio.telefono}` };
    // no-ok → sigue al respaldo por email
  }

  if (!socio?.email) return { ok: true, detalle: 'La socia no tiene email — contáctala por WhatsApp desde la tarjeta.' };

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;
  if (!resend) return { ok: true, detalle: 'Email no configurado — contáctala por WhatsApp desde la tarjeta.' };

  const html = await render(AutomatizacionEmail({
    socioNombre: socio.nombre, titulo: mensaje.asunto, mensaje: mensaje.cuerpo, estudioNombre: studio?.nombre ?? '',
    colorPrimario: studio?.color_primario, logoUrl: studio?.logo_url,
  }));
  const { error } = await resend.emails.send(
    { from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>', to: [socio.email], subject: mensaje.asunto, html },
    { idempotencyKey: r.id }
  );
  if (error) return { ok: false, detalle: error.message };
  return { ok: true, detalle: `Mensaje enviado por email a ${socio.email}` };
}

export const ejecutarRecomendacion = inngest.createFunction(
  { id: 'decision-ejecutar-recomendacion', triggers: [{ event: EVENTS.DECISION_APPROVED }], retries: 3 },
  async ({ event, step }) => {
    const { recomendacionId } = event.data as { recomendacionId: string };

    const recomendacion = await step.run('fetch', () => dbGetRecomendacion(recomendacionId));
    if (!recomendacion) return { ok: false, motivo: 'Recomendación no encontrada' };
    if (recomendacion.estado !== 'APROBADA') return { ok: false, motivo: `Estado inesperado: ${recomendacion.estado}` };

    let resultado: { ok: boolean; detalle: string };

    if (recomendacion.accion.tipo === 'ENVIAR_EMAIL') {
      resultado = await step.run('enviar-email', () => ejecutarEnvioEmail(recomendacion));
    } else if (recomendacion.accion.tipo === 'COBRAR_RECIBOS') {
      const reciboIds = recomendacion.accion.reciboIds;
      const recibosInfo = await step.run('recibos-info', async () => {
        const { data } = await requireSupabaseAdmin().from('recibos').select('id, socio_id').in('id', reciboIds);
        return (data ?? []) as Array<{ id: string; socio_id: string | null }>;
      });
      let cobrados = 0;
      const detalles: string[] = [];
      for (const info of recibosInfo) {
        if (!info.socio_id) { detalles.push(`${info.id}: sin socia asociada`); continue; }
        // A-10: sin idempotencyKey explícita — cobrarReciboOffSession la deriva del
        // reciboId, de modo que este ejecutor y la aprobación manual comparten la
        // misma clave y Stripe no duplica el cargo del mismo recibo.
        const r = await step.run(`cobrar-${info.id}`, () =>
          cobrarReciboOffSession({ reciboId: info.id, socioId: info.socio_id!, studioId: recomendacion.studioId })
        );
        if (r.ok) cobrados++; else detalles.push(`${info.id}: ${r.error ?? 'fallo'}`);
      }
      resultado = {
        ok: cobrados > 0,
        detalle: cobrados === recibosInfo.length ? `${cobrados} recibos cobrados.` : `${cobrados}/${recibosInfo.length} recibos cobrados. ${detalles.join('; ')}`,
      };
    } else if (recomendacion.accion.tipo === 'CONTACTO_MANUAL') {
      // Aprobar una recomendación de contacto → enviar el mensaje a la socia.
      resultado = await step.run('contactar-socia', () => ejecutarContactoSocia(recomendacion));
    } else {
      // MARCAR_GESTIONADO (avisos de horario, etc.): informativo, sin efecto externo.
      resultado = { ok: true, detalle: 'Marcada como gestionada.' };
    }

    const resueltoEn = await step.run('now', async () => new Date().toISOString());

    if (resultado.ok) {
      // A-17: el insert del outcome y la programación de la medición van GATEADOS
      // por la transición real APROBADA→EJECUTADA. Sin esto, un segundo run del
      // ejecutor sobre la misma recomendación (doble aprobación / reintento no
      // memoizado) insertaba OTRA fila outcome 'EJECUTADA' —sin unicidad en la
      // tabla—, y luego dbGetOutcomePorRecomendacion (maybeSingle) fallaba con >1
      // fila: la medición no actualizaba nada y el outcome quedaba PENDIENTE para
      // siempre. Con el guard, solo el run que efectivamente transiciona escribe.
      const trans = await step.run('marcar-ejecutada', () => dbTransicionarRecomendacion(recomendacionId, recomendacion.studioId, 'APROBADA', 'EJECUTADA', { resueltoEn }));
      if (trans.ok) {
        await step.run('outcome-ejecutada', () => dbInsertOutcome({
          studioId: recomendacion.studioId, recomendacionId, evento: 'EJECUTADA', outcome: 'PENDIENTE',
          senalObservada: null, ventanaDias: ventanaDiasDe(recomendacion.tipo), medidoEn: null,
        }));
        await step.sendEvent('programar-medicion', { name: EVENTS.DECISION_MEASURE, data: { recomendacionId } });
        // Traza visible en el feed "Actividad" del Centro (antes aprobar no dejaba
        // rastro alguno). El detalle ya dice qué pasó (email enviado / gestionada).
        const nombreSocia = typeof recomendacion.datosUsados.nombre === 'string' ? recomendacion.datosUsados.nombre : null;
        const textoAct = nombreSocia ? `${nombreSocia}: ${resultado.detalle}` : `Gestionada: ${recomendacion.titulo}`;
        await step.run('log-actividad', () => dbLogActividadReciente({ studioId: recomendacion.studioId, tipo: 'DECISION_GESTIONADA', texto: textoAct, socioId: recomendacion.socioId }));
      }
    } else {
      await step.run('marcar-fallida', () => dbTransicionarRecomendacion(recomendacionId, recomendacion.studioId, 'APROBADA', 'FALLIDA', { resueltoEn }));
      await step.run('log-actividad-fallo', () => dbLogActividadReciente({ studioId: recomendacion.studioId, tipo: 'DECISION_GESTIONADA', texto: `No se pudo completar: ${recomendacion.titulo} — ${resultado.detalle}`, socioId: recomendacion.socioId }));
    }

    return resultado;
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// F4 · MEDIR OUTCOME — un run por recomendación ejecutada, con sleepUntil
// durable (Arquitectura §6 F4): no consume cómputo mientras espera.
// ═══════════════════════════════════════════════════════════════════════════
async function construirSenalMedicion(r: Recomendacion): Promise<SenalMedicion> {
  if (r.tipo === 'RECUPERAR_PAGOS' && r.accion.tipo === 'COBRAR_RECIBOS') {
    const { data: recibos } = await requireSupabaseAdmin().from('recibos').select('estado').in('id', r.accion.reciboIds);
    const total = recibos?.length ?? 0;
    const cobrados = (recibos ?? []).filter((x: { estado: string }) => x.estado === 'COBRADO').length;
    return { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: cobrados, recibosTotal: total };
  }

  // COBRAR_PENDIENTE (reclamo manual, sin reciboIds): antes caía a la rama de
  // socioId con recibos=0 → medirOutcome lo daba SIEMPRE por NEGATIVO aunque la
  // socia pagara. Se miran sus recibos ya vencidos al reclamar y cuántos están
  // ya COBRADO tras la ventana de medición.
  if (r.tipo === 'COBRAR_PENDIENTE' && r.socioId) {
    const { data: recibos } = await requireSupabaseAdmin()
      .from('recibos').select('estado, fecha_vencimiento').eq('socio_id', r.socioId);
    const corte = new Date(r.resueltoEn ?? 0).getTime();
    const relevantes = (recibos ?? []).filter((x: { fecha_vencimiento: string }) => new Date(x.fecha_vencimiento).getTime() <= corte);
    const total = relevantes.length;
    const cobrados = relevantes.filter((x: { estado: string }) => x.estado === 'COBRADO').length;
    return { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: cobrados, recibosTotal: total };
  }

  if (!r.socioId) return { reservaAsistidaPosterior: false, suscripcionCancelada: false, suscripcionRenovada: false, recibosCobrados: 0, recibosTotal: 0 };

  const resueltoEnISO = r.resueltoEn ?? new Date(0).toISOString();
  const [{ data: reservas }, { data: suscripciones }] = await Promise.all([
    requireSupabaseAdmin().from('reservas').select('creado_en').eq('socio_id', r.socioId).eq('estado', 'ASISTIDA').gt('creado_en', resueltoEnISO),
    requireSupabaseAdmin().from('suscripciones').select('estado, fecha_inicio').eq('socio_id', r.socioId),
  ]);

  const reservaAsistidaPosterior = (reservas ?? []).length > 0;
  const suscripcionCancelada = (suscripciones ?? []).some((s: { estado: string }) => s.estado === 'CANCELADA');
  const suscripcionRenovada = (suscripciones ?? []).some((s: { estado: string; fecha_inicio: string }) =>
    s.estado === 'ACTIVA' && new Date(s.fecha_inicio).getTime() >= new Date(resueltoEnISO).getTime()
  );

  return { reservaAsistidaPosterior, suscripcionCancelada, suscripcionRenovada, recibosCobrados: 0, recibosTotal: 0 };
}

export const medirOutcomeFn = inngest.createFunction(
  { id: 'decision-medir-outcome', triggers: [{ event: EVENTS.DECISION_MEASURE }], retries: 3 },
  async ({ event, step }) => {
    const { recomendacionId } = event.data as { recomendacionId: string };

    const recomendacion = await step.run('fetch', () => dbGetRecomendacion(recomendacionId));
    if (!recomendacion || recomendacion.estado !== 'EJECUTADA' || !recomendacion.resueltoEn) {
      return { ok: false, motivo: 'No ejecutada o sin fecha de resolución' };
    }

    const ventanaDias = ventanaDiasDe(recomendacion.tipo);
    const fechaMedicion = new Date(new Date(recomendacion.resueltoEn).getTime() + ventanaDias * MS_DIA);
    await step.sleepUntil('esperar-ventana', fechaMedicion);

    const senal = await step.run('construir-senal', () => construirSenalMedicion(recomendacion));
    const { outcome, senalObservada } = medirOutcome(recomendacion.tipo, senal);

    await step.run('actualizar-outcome', async () => {
      const outcomeRow = await dbGetOutcomePorRecomendacion(recomendacionId, 'EJECUTADA');
      if (outcomeRow) await dbActualizarOutcome(outcomeRow.id, { outcome, senalObservada, medidoEn: new Date().toISOString() });
    });

    return { outcome, senalObservada };
  }
);
