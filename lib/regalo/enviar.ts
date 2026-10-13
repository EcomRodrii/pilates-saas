// Tarjeta regalo — envío de los correos. Va DESPUÉS de crear la tarjeta (el dinero ya
// entró y la tarjeta existe): si el correo falla, `correo_enviado_en` queda a null, el
// panel lo enseña y «Reenviar» lo repite. Nunca un error de envío deshace una venta.
// El código viaja en el correo y en ningún log.
import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { correoRegaloDestinataria, correoRegaloJustificante } from '@/lib/emails/estudio/regalo';
import { marcaCorreoDesde, urlAppSocia } from '@/lib/emails/estudio/marca-correo';
import { resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { formatearEuros } from './reglas';

const fechaEs = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

export async function enviarCorreosRegalo(
  admin: SupabaseClient, studioId: string, tarjetaId: string,
  opciones: { soloDestinataria?: boolean } = {},
): Promise<{ ok: boolean; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  try {
    const { data: t } = await admin.from('tarjetas_regalo')
      .select('codigo, importe_inicial, caduca_en, comprador_nombre, comprador_email, destinatario_nombre, destinatario_email, mensaje, estado')
      .eq('id', tarjetaId).eq('studio_id', studioId).maybeSingle();
    if (!t || t.estado === 'ANULADA' || !t.destinatario_email) return { ok: false };
    const [marcaBase, { data: ajustes }] = await Promise.all([
      resolverMarcaEstudio(studioId),
      admin.from('regalo_ajustes').select('terminos').eq('studio_id', studioId).maybeSingle(),
    ]);
    const nombre = marcaBase.nombre || 'Tu estudio';
    const marca = marcaCorreoDesde(marcaBase, nombre);
    const datos = {
      marca, codigo: String(t.codigo), importeTexto: formatearEuros(Number(t.importe_inicial)),
      caducaTexto: fechaEs(String(t.caduca_en)), compradorNombre: String(t.comprador_nombre ?? 'Alguien'),
      destinatarioNombre: String(t.destinatario_nombre ?? ''), mensaje: (t.mensaje as string | null) ?? null,
      urlCanje: urlAppSocia(marcaBase.slug), terminos: (ajustes?.terminos as string | null) ?? null,
    };
    const resend = new Resend(apiKey);
    const from = remitentePorMarca(nombre);
    const replyTo = marcaBase.replyTo ? { replyTo: marcaBase.replyTo } : {};
    const envios = [
      resend.emails.send({
        from, to: [String(t.destinatario_email)], ...replyTo,
        subject: `${datos.compradorNombre} te regala una tarjeta de ${nombre}`, html: correoRegaloDestinataria(datos),
      }),
    ];
    if (!opciones.soloDestinataria && t.comprador_email) {
      envios.push(resend.emails.send({
        from, to: [String(t.comprador_email)], ...replyTo,
        subject: `Tu regalo para ${datos.destinatarioNombre} está en camino`,
        html: correoRegaloJustificante({ ...datos, destinatarioEmail: String(t.destinatario_email) }),
      }));
    }
    const resultados = await Promise.all(envios);
    // El mensaje de Resend puede llevar direcciones: al log, solo el nombre del error.
    if (resultados[0].error) { console.error('[regalo/enviar]', resultados[0].error.name); return { ok: false }; }
    await admin.from('tarjetas_regalo').update({ correo_enviado_en: new Date().toISOString() }).eq('id', tarjetaId).eq('studio_id', studioId);
    return { ok: true };
  } catch (err) {
    console.error('[regalo/enviar]', err instanceof Error ? err.name : 'error');
    return { ok: false };
  }
}
