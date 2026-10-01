import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { enviarRecordatorioAlta } from '@/lib/emails/embudo-alta-server';
import { correoAltaSinTerminar } from '@/lib/emails/tentare/embudo-alta';
import { LEGAL } from '@/lib/legal-info';
import {
  altaDesdeFila,
  claveIdempotenciaRecordatorio,
  contenidoRecordatorio,
  decidirRecordatorio,
  MAX_INTENTOS_RECORDATORIO,
} from './abandono.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El recordatorio de las 24 h a quien dejó el alta de estudio a medias. Lo
// dispara pg_cron cada hora (app/api/cron/altas-sin-terminar).
//
// UN correo por persona, aunque el cron corra dos veces a la vez o muera a
// mitad:
//   1. `decidirRecordatorio` (pura) descarta a quien ya lo tiene, ya terminó,
//      es del equipo de un estudio o está fuera de plazo.
//   2. Compare-and-set sobre `recordatorio_reclamado_en`: solo la pasada que
//      consigue poner la marca (de NULL a ahora) envía. La otra ve 0 filas.
//   3. Resend con clave de idempotencia por persona: si el envío salió y la
//      escritura de `enviado_en` no, la repetición no manda un segundo correo.
// Un envío fallido suelta el cerrojo para la pasada siguiente, hasta 3 veces.
// Si el proceso muere entre reclamar y apuntar, la fila se queda reclamada y no
// se reintenta: preferimos un correo de menos que uno repetido.
//
// Sustituye al barrido diario que colgaba de reviewBoostDispatcher (Inngest):
// quien ya recibió aquel aviso (`embudo_alta_avisado_en`) no recibe este.
// ─────────────────────────────────────────────────────────────────────────────

const POR_PASADA = 50;

export interface ResumenRecordatorios {
  revisadas: number;
  enviados: number;
  descartadas: number;
  fallidos: number;
  esperando: number;
}

export async function enviarRecordatoriosAltas(admin: SupabaseClient, ahoraMs = Date.now()): Promise<ResumenRecordatorios> {
  const { data, error } = await admin.rpc('altas_estudio_detalle', { p_solo_pendientes: true, p_limite: POR_PASADA });
  if (error) throw new Error(`altas_estudio_detalle: ${error.message}`);

  const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
  const resumen: ResumenRecordatorios = { revisadas: 0, enviados: 0, descartadas: 0, fallidos: 0, esperando: 0 };

  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    resumen.revisadas += 1;
    const alta = altaDesdeFila(fila);
    const decision = decidirRecordatorio(alta, ahoraMs);

    if (!decision.enviar) {
      if (!decision.definitivo) { resumen.esperando += 1; continue; }
      await admin.from('altas_estudio')
        .update({ recordatorio_descartado: decision.motivo, actualizado_en: new Date().toISOString() })
        .eq('auth_user_id', alta.authUserId)
        .is('recordatorio_descartado', null)
        .is('recordatorio_enviado_en', null);
      resumen.descartadas += 1;
      continue;
    }

    // El cerrojo. Sin filas de vuelta = otra pasada se la ha quedado.
    const reclamadoEn = new Date().toISOString();
    const { data: reclamada, error: errReclamo } = await admin.from('altas_estudio')
      .update({ recordatorio_reclamado_en: reclamadoEn, actualizado_en: reclamadoEn })
      .eq('auth_user_id', alta.authUserId)
      .is('recordatorio_reclamado_en', null)
      .is('recordatorio_enviado_en', null)
      .is('recordatorio_descartado', null)
      .select('auth_user_id');
    if (errReclamo || !reclamada?.length) continue;

    const contenido = contenidoRecordatorio(decision.paso, alta, base);
    const res = await enviarRecordatorioAlta({
      to: alta.email!,
      asunto: contenido.asunto,
      html: correoAltaSinTerminar(contenido),
      idempotencyKey: claveIdempotenciaRecordatorio(alta.authUserId),
    });

    if (res.ok) {
      const { error: errApunte } = await admin.from('altas_estudio')
        .update({
          recordatorio_enviado_en: new Date().toISOString(),
          recordatorio_paso: decision.paso,
          recordatorio_error: null,
          actualizado_en: new Date().toISOString(),
        })
        .eq('auth_user_id', alta.authUserId);
      // El correo YA salió: la fila se queda reclamada, así que no se repite
      // aunque esta escritura falle. Solo se pierde la fecha exacta en /interno.
      if (errApunte) Sentry.captureMessage('[altas-sin-terminar] enviado pero sin apuntar', { level: 'warning' });
      resumen.enviados += 1;
      continue;
    }

    // Resend sin configurar (preview, local): nada salió, se suelta sin gastar intento.
    if (res.skipped) {
      await soltar(admin, alta.authUserId, alta.recordatorioIntentos, null, null);
      resumen.esperando += 1;
      continue;
    }

    const intentos = alta.recordatorioIntentos + 1;
    const definitivo = res.permanente || intentos >= MAX_INTENTOS_RECORDATORIO;
    await soltar(admin, alta.authUserId, intentos, res.error, definitivo ? 'envio_fallido' : null);
    resumen.fallidos += 1;
  }

  return resumen;
}

async function soltar(
  admin: SupabaseClient, authUserId: string, intentos: number, error: string | null, descartado: string | null,
) {
  await admin.from('altas_estudio')
    .update({
      recordatorio_reclamado_en: null,
      recordatorio_intentos: intentos,
      recordatorio_error: error ? error.slice(0, 80) : null,
      recordatorio_descartado: descartado,
      actualizado_en: new Date().toISOString(),
    })
    .eq('auth_user_id', authUserId)
    .is('recordatorio_enviado_en', null);
}
