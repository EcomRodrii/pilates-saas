import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { ReciboEmail } from '@/lib/emails/recibo-template';
import { resolverMarcaEstudio, appUrl } from '@/lib/emails/plantillas-server';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from './remitente.ts';
import { registrarComunicacion } from '@/lib/db/supabase-data-admin';

// ─────────────────────────────────────────────────────────────────────────────
// Confirmación de pago por email, disparada DESDE EL WEBHOOK de Stripe — nunca
// desde `/api/emails/send` (esa ruta exige `verificarSesionStaff`, y aquí no hay
// sesión de staff, solo el admin client de service-role que ya tiene el
// webhook). Es la versión "sin sesión" del mismo camino que ya recorre esa
// ruta para tipo 'recibo': render → Resend → registrarComunicacion.
//
// Best-effort de punta a punta (mismo criterio que emitirPagoRealizado, la
// notificación in-app con la que se dispara siempre junto a esta función): un
// fallo aquí NO debe tumbar el webhook ni el registro del cobro, que ya quedó
// persistido antes de llegar aquí. Por eso todo el cuerpo va en un único
// try/catch y la función no lanza nunca.
// ─────────────────────────────────────────────────────────────────────────────
export async function enviarEmailReciboWebhook(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || apiKey.startsWith('re_XXXX')) return;

    const { data: recibo } = await admin.from('recibos')
      .select('concepto, importe, socio_id, fecha_cobro')
      .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
    if (!recibo?.socio_id) return;

    const { data: socio } = await admin.from('socios')
      .select('email, nombre').eq('id', recibo.socio_id).eq('studio_id', p.studioId).maybeSingle();
    const email = (socio?.email as string | null) ?? null;
    // Igual guarda que /api/emails/send: nunca intentar enviar a un email de
    // ejemplo (RFC 2606), y sin email no hay a quién escribir.
    if (!email || esDominioReservado(email)) return;

    // `resolverMarcaEstudio` ya trae el nombre del estudio (`marca.nombre`),
    // así que la segunda consulta a `studios` por el MISMO id era redundante.
    const [marca, { data: factura }] = await Promise.all([
      resolverMarcaEstudio(p.studioId),
      // Puede no existir todavía: la factura se sella aparte (Veri*Factu), no
      // en el momento del cobro. El email sale igual, solo sin número.
      admin.from('facturas').select('numero_completo').eq('recibo_id', p.reciboId).maybeSingle(),
    ]);

    const resend = new Resend(apiKey);
    const concepto = (recibo.concepto as string | null) ?? 'tu cuota';
    const html = await render(ReciboEmail({
      socioNombre: (socio?.nombre as string | null) ?? 'Socia',
      concepto,
      importe: Number(recibo.importe),
      fechaCobro: (recibo.fecha_cobro as string | null) ?? new Date().toISOString(),
      numeroFactura: (factura?.numero_completo as string | null) ?? undefined,
      estudioNombre: marca.estudioNombre ?? 'Tentare',
      logoUrl: marca.logoUrl,
      colorPrimario: marca.colorPrimario,
      // Enlace a "Mis compras" del portal, donde ya se muestra la factura a la
      // socia (badge "· Factura", lib/factura-pdf.ts). Sin slug (estudio raro
      // sin portal resuelto), el email sale igual, sin el botón.
      url: marca.slug ? `${appUrl()}/portal/${marca.slug}/compras` : undefined,
    }));
    const subject = `Pago confirmado — ${concepto}`;

    const { data, error } = await resend.emails.send({
      from: remitentePorMarca(marca.nombre ?? 'Tentare'),
      // Reply-To del estudio: un justificante de pago es de los correos que
      // más se contestan ("no reconozco este cargo"), y esa respuesta tiene
      // que llegarle al estudio, no al buzón de la plataforma.
      ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
      to: [email],
      subject,
      html,
    });

    // Historial auditable, igual que /api/emails/send: best-effort, nunca
    // convierte un envío correcto (o un fallo ya logeado) en un error nuevo.
    await registrarComunicacion({
      studioId: p.studioId,
      socioId: recibo.socio_id as string,
      tipo: 'recibo',
      asunto: subject,
      estado: error ? 'FALLIDO' : 'ENVIADO',
      error: error?.message ?? null,
      resendId: data?.id ?? null,
      creadoPor: null,
      creadoPorNombre: null,
    });
  } catch (e) {
    console.error('[emails] enviarEmailReciboWebhook:', e instanceof Error ? e.message : e);
  }
}
