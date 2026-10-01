import { Resend } from 'resend';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { conReintentoResend } from '@/lib/emails/resend-reintentos';

// El recordatorio de las altas sin terminar (lib/alta/recordatorio-servidor.ts).
// Fuera del Notification Engine por lo mismo que antes: quien lo recibe aún no
// tiene estudio, y `publish()` exige un studioId.
//
// `permanente` = reintentarlo no cambiará nada (dirección de ejemplo, Resend
// rechaza el destinatario): el cron lo descarta en vez de volver cada hora.
export async function enviarRecordatorioAlta(params: {
  to: string;
  asunto: string;
  html: string;
  idempotencyKey: string;
}): Promise<{ ok: true; id: string | null } | { ok: false; skipped?: boolean; permanente?: boolean; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true, error: 'Resend sin configurar' };
  if (!params.to) return { ok: false, permanente: true, error: 'sin_destinatario' };
  if (esDominioReservado(params.to)) return { ok: false, permanente: true, error: 'dominio_de_ejemplo' };

  try {
    const resend = new Resend(apiKey);
    // La clave de idempotencia es por PERSONA: si una pasada llega a enviar y
    // muere antes de apuntarlo, la siguiente repite la llamada y Resend
    // devuelve el mismo envío en vez de mandar otro (ventana de 24 h).
    const { data, error } = await conReintentoResend(() => resend.emails.send(
      {
        from: remitentePorMarca('Tentare'),
        to: [params.to],
        subject: params.asunto,
        html: params.html,
      },
      { idempotencyKey: params.idempotencyKey },
    ));
    if (error) {
      // `validation_error` es el destinatario o el contenido: no se arregla solo.
      return { ok: false, permanente: error.name === 'validation_error', error: error.name || 'error_resend' };
    }
    return { ok: true, id: (data as { id?: string } | null)?.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.name : 'error_envio' };
  }
}
