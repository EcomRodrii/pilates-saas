import { Resend } from 'resend';
import { correoCodigoAcceso } from '@/lib/emails/tentare/cuenta';
import { correoCodigoAccesoEstudio } from '@/lib/emails/estudio/cuenta';
import { marcaCorreoDesde } from '@/lib/emails/estudio/marca-correo';
import { resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { MINUTOS_CODIGO_CORREO } from '@/lib/auth/codigo-correo-reglas';

// El código del segundo paso (lib/auth/codigo-correo.ts). A diferencia del
// resto de envíos, NO es best-effort: si no sale, la pantalla tiene que saberlo
// para no decir «te lo hemos enviado» y pasar a la app.
//
// Dos caras: desde el panel firma «Tentare» (la marca paraguas del login: el
// rol aún no importa); desde la app de un estudio (`studioId`, ya comprobado
// por quien llama que la cuenta es alumna o instructora suya) va con SU marca y
// su nombre de remitente — la app es marca blanca y la alumna no conoce Tentare.
export async function enviarEmailCodigoAcceso(params: {
  to: string; codigo: string; studioId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  try {
    let correo: { from: string; subject: string; html: string; replyTo?: string };
    if (params.studioId) {
      const marca = await resolverMarcaEstudio(params.studioId);
      const nombre = marca.nombre || 'Tu estudio';
      correo = {
        from: remitentePorMarca(nombre),
        subject: `Tu código para entrar en ${nombre}`,
        html: correoCodigoAccesoEstudio({ codigo: params.codigo, minutos: MINUTOS_CODIGO_CORREO, marca: marcaCorreoDesde(marca, nombre) }),
        ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
      };
    } else {
      correo = {
        from: remitentePorMarca('Tentare'),
        subject: 'Tu código para entrar a Tentare',
        html: correoCodigoAcceso({ codigo: params.codigo, minutos: MINUTOS_CODIGO_CORREO }),
      };
    }
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ ...correo, to: [params.to] });
    // El mensaje de Resend puede llevar la dirección: al log, sin ella.
    if (error) { console.error('[codigo-acceso-server]', error.name); return { ok: false }; }
    return { ok: true };
  } catch (err) {
    console.error('[codigo-acceso-server]', err instanceof Error ? err.name : 'error');
    return { ok: false };
  }
}
