import { Resend } from 'resend';
import { render } from '@react-email/render';
import { PromocionEsperaEmail } from '@/lib/emails/promocion-espera-template';
import { CancelacionClaseEmail } from '@/lib/emails/cancelacion-clase-template';
import { RecordatorioEmail } from '@/lib/emails/recordatorio-template';
import { ReservaEmail } from '@/lib/emails/reserva-template';
import { resolverPlantilla, interpolar, interpolarPersonalizacion, resolverMarcaEstudio, type PlantillaOverride, type MarcaEstudio } from '@/lib/emails/plantillas-server';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from './remitente.ts';

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
  logoUrl?: string | null;
  colorPrimario?: string | null;
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
  marca: MarcaEstudio,
): Promise<{ html: string; subject: string }> {
  const vars = { nombre: toName, estudio: d.estudioNombre, clase: d.claseNombre };
  const intro = plantilla.intro ? interpolar(plantilla.intro, vars) : undefined;
  const asunto = plantilla.asunto ? interpolar(plantilla.asunto, vars) : undefined;
  const personalizacion = interpolarPersonalizacion(plantilla, vars);
  const base = { socioNombre: toName, intro, personalizacion, ...marca, ...d };
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
  // Direcciones de ejemplo (RFC 2606): ni se intentan. Por aquí pasan justo los
  // envíos automáticos —recordatorio de 24 h, cancelación, promoción de lista de
  // espera—, que son los que más veces se disparan sobre datos de demo. No se
  // llama a `avisarFalloEmail`: no es que el correo esté roto, es que esa ficha
  // tiene una dirección inventada, y avisar a la dueña cada día de eso es ruido.
  if (esDominioReservado(params.to)) {
    return { ok: false, error: `Email de ejemplo (${params.to}), no una dirección real` };
  }

  try {
    const [plantilla, marca] = await Promise.all([
      resolverPlantilla(params.studioId, params.tipo),
      resolverMarcaEstudio(params.studioId),
    ]);
    const { html, subject } = await renderPorTipo(params.tipo, params.toName, params.data, plantilla, marca);
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        // Remitente con el nombre del estudio (misma dirección verificada de
        // siempre, ver lib/emails/remitente.ts) — sin marca resuelta, cae a Tentare.
        from: remitentePorMarca(marca.nombre || params.data.estudioNombre || 'Tentare'),
        to: [params.to],
        subject,
        html,
      },
      params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
    );
    if (error) {
      console.error('[send-server]', error);
      await avisarFalloEmail(params.studioId, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[send-server]', err);
    const msg = err instanceof Error ? err.message : 'Error al enviar el email';
    await avisarFalloEmail(params.studioId, msg);
    return { ok: false, error: msg };
  }
}

// Notification Engine: avisa a la dueña de que los correos a sus clientas están
// fallando (UNO al día por estudio, ver dedupKey del emisor). Sin studioId no se
// sabe a quién avisar. Best-effort: nunca rompe el envío que ya falló.
async function avisarFalloEmail(studioId: string | undefined, mensaje: string): Promise<void> {
  if (!studioId) return;
  try {
    const { getSupabaseAdmin } = await import('@/lib/db/supabase-admin');
    const admin = getSupabaseAdmin();
    if (!admin) return;
    const { emitirEmailFallido } = await import('@/lib/notifications/emit');
    await emitirEmailFallido(admin, { studioId, error: mensaje });
  } catch { /* best-effort */ }
}
