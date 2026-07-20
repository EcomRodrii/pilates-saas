import { Resend } from 'resend';
import { render } from '@react-email/render';
import { PromocionEsperaEmail } from '@/lib/emails/promocion-espera-template';
import { CancelacionClaseEmail } from '@/lib/emails/cancelacion-clase-template';
import { RecordatorioEmail } from '@/lib/emails/recordatorio-template';
import { ReservaEmail } from '@/lib/emails/reserva-template';
import { resolverPlantilla, interpolar, type PlantillaOverride } from '@/lib/emails/plantillas-server';

// ─────────────────────────────────────────────────────────────────────────────
// Envío de emails transaccionales desde CÓDIGO DE SERVIDOR (no una ruta staff):
// lo usan el proxy público (promoción de lista de espera) y los crons
// (recordatorios). A diferencia de /api/emails/send —que exige sesión de staff—
// aquí el disparador es un evento del sistema, así que se envía directo con
// Resend. Si Resend no está configurado, no falla: devuelve { skipped }.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatosClaseEmail {
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  estudioNombre?: string;
  bonoConsumido?: boolean;
  bonoDevuelto?: boolean;
}

export type TipoEmailTransaccional = 'promocion' | 'cancelacion' | 'recordatorio' | 'reserva';

type Resultado =
  | { ok: true; id?: string }
  | { ok: false; skipped: true }
  | { ok: false; error: string };

async function renderPorTipo(
  tipo: TipoEmailTransaccional,
  toName: string,
  d: DatosClaseEmail,
  plantilla: PlantillaOverride,
): Promise<{ html: string; subject: string }> {
  const vars = { nombre: toName, estudio: d.estudioNombre, clase: d.claseNombre };
  const intro = plantilla.intro ? interpolar(plantilla.intro, vars) : undefined;
  const asunto = plantilla.asunto ? interpolar(plantilla.asunto, vars) : undefined;
  const base = { socioNombre: toName, intro, ...d };
  switch (tipo) {
    case 'promocion':
      return { html: await render(PromocionEsperaEmail(base)), subject: asunto ?? `Se ha liberado tu plaza — ${d.claseNombre}` };
    case 'cancelacion':
      return { html: await render(CancelacionClaseEmail(base)), subject: asunto ?? `Clase cancelada — ${d.claseNombre}` };
    case 'recordatorio':
      return { html: await render(RecordatorioEmail(base)), subject: asunto ?? `Recordatorio — ${d.claseNombre}` };
    case 'reserva':
      return { html: await render(ReservaEmail(base)), subject: asunto ?? `Reserva confirmada — ${d.claseNombre}` };
  }
}

export async function enviarEmailTransaccional(params: {
  tipo: TipoEmailTransaccional;
  to: string;
  toName: string;
  data: DatosClaseEmail;
  // Opcional: si se pasa, aplica el override de plantilla del estudio (asunto +
  // intro). Los crons/proxy que tienen el studioId a mano lo envían.
  studioId?: string;
  // Opcional pero MUY recomendable en crons y jobs: Resend deduplica los envíos
  // con la misma clave durante 24 h. Sin ella, un cron que expira a medio camino
  // reenvía a todas las socias ya avisadas en cada reintento. Debe ser
  // determinista a partir del hecho que se notifica (no un uid()).
  idempotencyKey?: string;
}): Promise<Resultado> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  try {
    const plantilla = await resolverPlantilla(params.studioId, params.tipo);
    const { html, subject } = await renderPorTipo(params.tipo, params.toName, params.data, plantilla);
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        // Remitente configurable por env (RESEND_FROM). Sin dominio verificado, el
        // sandbox de Resend solo entrega al email de la cuenta.
        from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
        to: [params.to],
        subject,
        html,
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
    );
    if (error) {
      console.error('[send-server]', error);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[send-server]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar el email' };
  }
}
