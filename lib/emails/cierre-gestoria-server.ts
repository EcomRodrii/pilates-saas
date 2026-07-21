import { Resend } from 'resend';
import { render } from '@react-email/render';
import { CierreGestoriaEmail } from '@/lib/emails/cierre-gestoria-template';
import { serializeCsv } from '@/lib/csv';
import { cierreLibroCsvData, type CierreAnual } from '@/lib/fiscal/cierre-engine';

// Envía a la gestoría el paquete del Cierre de año: resumen HTML + el libro de
// facturas emitidas como adjunto CSV. `replyTo` = email del estudio, para que
// la gestoría le responda directamente. Best-effort: si Resend no está
// configurado, devuelve { skipped } sin romper (mismo patrón que el resto).
export async function enviarCierreAGestoria(params: {
  to: string;
  estudioNombre: string;
  estudioEmail?: string | null;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  anio: number;
  cierre: CierreAnual;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  const { to, estudioNombre, estudioEmail, logoUrl, colorPrimario, anio, cierre } = params;
  const nombreAdjunto = `cierre-${anio}-libro-facturas.csv`;

  try {
    const { headers, rows } = cierreLibroCsvData(cierre);
    const csv = '﻿' + serializeCsv(headers, rows); // BOM para Excel
    const contentBase64 = Buffer.from(csv, 'utf-8').toString('base64');

    const html = await render(
      CierreGestoriaEmail({
        estudioNombre, logoUrl, colorPrimario, anio, remitente: estudioNombre,
        totales: cierre.totales,
        trimestres: cierre.trimestres,
        nombreAdjunto,
      }),
    );

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [to],
      ...(estudioEmail ? { replyTo: estudioEmail } : {}),
      subject: `Cierre de año ${anio} — ${estudioNombre}`,
      html,
      attachments: [{ filename: nombreAdjunto, content: contentBase64 }],
    });
    if (error) { console.error('[cierre-gestoria-server]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[cierre-gestoria-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
