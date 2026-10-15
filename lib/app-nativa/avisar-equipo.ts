// Aviso por correo al equipo de Tentare (soporte@tentare.app) de lo que pasa con las apps de
// estudio: una petición nueva, lo que hace la automatización solo y lo que necesita a una persona.
// Mismo camino que los demás avisos internos (Resend). Nunca rompe a quien lo llama: si no se
// puede mandar, se dice en el log y la cola de /interno sigue enseñándolo todo.

import { Resend } from 'resend';
import { escaparHtml } from '@/lib/emails/html';
import { LEGAL } from '@/lib/legal-info';

export async function avisarEquipoApps(asunto: string, texto: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return;
  try {
    const { error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: ['soporte@tentare.app'],
      subject: `[Apps de estudio] ${asunto}`.slice(0, 200),
      html: `<p>${escaparHtml(texto)}</p><p><a href="${LEGAL.url}/interno/apps-estudio">Abrir la cola en /interno</a></p>`,
    });
    if (error) console.error('[apps-estudio] aviso al equipo:', error.message);
  } catch (e) {
    console.error('[apps-estudio] aviso al equipo:', e instanceof Error ? e.message : e);
  }
}
