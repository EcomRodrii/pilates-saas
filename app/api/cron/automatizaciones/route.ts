import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { supabase } from '@/lib/supabase';
import { fetchAllStudioData, dbInsertAutomationLog, dbUpdateAutomationRule } from '@/lib/supabase-data';
import { computeAutomationCandidatos } from '@/lib/automation-engine';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { RECOMENDACION_SYSTEM_PROMPT, buildRecomendacionUserPrompt, type RecomendacionInput } from '@/lib/ai/recomendacion-prompt';
import type { AutomationLog, ResultadoLog } from '@/lib/types';
import { uid } from '@/lib/utils';
import * as Sentry from '@sentry/nextjs';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

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

export const dynamic = 'force-dynamic';

// P0-37: parche hasta la cola (P0-36). Recorre todos los estudios y llama a la
// IA por candidato, así que es el cron más lento; 300s (Vercel Pro) evita que se
// corte a mitad hasta que cada estudio sea un job independiente.
export const maxDuration = 300;

// Ejecuta el motor de automatizaciones para todos los estudios, sin depender
// de que nadie tenga el dashboard abierto. Lo dispara Vercel Cron (ver
// vercel.json) contra esta ruta con el CRON_SECRET como autenticación.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const DRY_RUN = req.nextUrl.searchParams.get('dry') === '1';

  const apiKey = process.env.RESEND_API_KEY;
  if (!DRY_RUN && (!apiKey || apiKey.startsWith('re_XXXX'))) {
    return NextResponse.json({ error: 'Resend no configurado' }, { status: 503 });
  }
  const resend = apiKey ? new Resend(apiKey) : null;

  const { data: studios, error: studiosError } = await supabase.from('studios').select('id, nombre');
  if (studiosError) {
    return NextResponse.json({ error: studiosError.message }, { status: 500 });
  }

  const now = new Date();
  const resumen: { studioId: string; emailsEnviados: number; fallidos: number; cobrosPropuestos: number }[] = [];

  for (const studio of studios ?? []) {
    // P0-8: studioId explícito, sin depender del STUDIO_ID global mutable. Los
    // writes del bucle (dbInsertAutomationLog) ya llevan el studioId en el objeto,
    // así que este bucle puede paralelizarse sin mezclar datos entre tenants.
    const data = await fetchAllStudioData(studio.id);

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

    let emailsEnviados = 0;
    let fallidos = 0;
    let cobrosPropuestos = 0;
    const ejecutadaVecesPorRegla = new Map(data.automationRules.map(r => [r.id, r.ejecutadaVeces]));

    for (const c of candidatos) {
      const base = {
        id: `log-${uid()}`,
        studioId: studio.id,
        ruleId: c.rule.id,
        ruleName: c.rule.nombre,
        socioId: c.socio?.id ?? null,
        socioNombre: c.socio ? `${c.socio.nombre} ${c.socio.apellidos}` : null,
        pasoIndex: 0,
        accion: c.accion,
        ejecutadoEn: now.toISOString(),
        proximaAccionEn: c.proximaAccionEn,
        reciboId: c.reciboId ?? null,
      };

      let log: AutomationLog;
      // COBRAR_RECIBO y OFRECER_DESCUENTO nunca se ejecutan aquí — quedan
      // como PENDIENTE_ADMIN a la espera de aprobación de un toque desde
      // Automatizaciones. NOTIFICAR_ADMIN es un insight, no requiere acción.
      if (c.accion === 'COBRAR_RECIBO') {
        cobrosPropuestos++;
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
        fallidos++;
        log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'Acción sin socia asociada' };
      } else if (DRY_RUN) {
        emailsEnviados++;
        log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `[DRY RUN] ${c.titulo} → ${c.socio.email}` };
      } else if (!c.socio.email) {
        fallidos++;
        log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: 'La socia no tiene email registrado' };
      } else {
        try {
          const html = await render(AutomatizacionEmail({
            socioNombre: c.socio.nombre,
            titulo: c.titulo,
            mensaje: c.mensaje,
            estudioNombre: studio.nombre,
          }));
          const { error } = await resend!.emails.send({
            // Remitente configurable por env (ver RESEND_FROM). Sin dominio
            // verificado, el sandbox de Resend solo entrega al email de la cuenta.
            from: process.env.RESEND_FROM ?? 'Tentare <onboarding@resend.dev>',
            to: [c.socio.email],
            subject: c.titulo,
            html,
          });
          if (error) {
            fallidos++;
            log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: error.message };
          } else {
            emailsEnviados++;
            log = { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `Email enviado a ${c.socio.email}: "${c.titulo}"` };
          }
        } catch (err) {
          // Excepción inesperada al renderizar/enviar (no el error de entrega de
          // Resend, que ya queda en el log). Lo reportamos: puede ser una plantilla
          // rota o Resend caído, y afectaría a todos los emails de la tanda.
          Sentry.captureException(err, { tags: { cron: 'automatizaciones' }, extra: { studioId: studio.id, ruleId: c.rule.id } });
          fallidos++;
          log = { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: err instanceof Error ? err.message : 'Error al enviar el email' };
        }
      }

      if (!DRY_RUN) {
        await dbInsertAutomationLog(log);
        const nuevasVeces = (ejecutadaVecesPorRegla.get(c.rule.id) ?? 0) + 1;
        ejecutadaVecesPorRegla.set(c.rule.id, nuevasVeces);
        await dbUpdateAutomationRule(c.rule.id, {
          ejecutadaVeces: nuevasVeces,
          ultimaEjecucion: now.toISOString(),
        });
      }
    }

    resumen.push({ studioId: studio.id, emailsEnviados, fallidos, cobrosPropuestos });
  }

  return NextResponse.json({ ejecutadoEn: now.toISOString(), estudios: resumen });
}
