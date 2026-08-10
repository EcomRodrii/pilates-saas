import { Resend } from 'resend';
import { render } from '@react-email/render';
import { CambioClaseEmail } from '@/lib/emails/cambio-clase-template';
import { resolverPlantilla, interpolar, resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
import { validarDatosEmail } from '@/lib/emails/validar-datos';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from './remitente.ts';

// Envío server-side del email de "cambio de clase" (instructora y/o
// hora/sala) a un lote de socias ya resueltas por el servidor (sociasDeSesion,
// no un snapshot de cliente). Va aparte de /api/emails/send: ese endpoint
// manda UN destinatario por llamada, y aquí resolvemos plantilla/marca una
// sola vez para todo el lote en vez de N veces (antes eran N POST idénticos
// desde el panel a /api/emails/send, tanto para el cambio de instructora como
// para el de hora/sala).
export async function enviarEmailesCambioClase(
  studioId: string,
  destinatarias: { email: string; nombre: string }[],
  datos: {
    claseNombre: string; fecha: string; hora: string; sala: string; instructor: string;
    instructorAnterior?: string; cambioHora?: boolean; cambioSala?: boolean;
  },
): Promise<{ enviados: number; sinEmail: number }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { enviados: 0, sinEmail: 0 };

  const errorDatos = validarDatosEmail('cambio', datos);
  if (errorDatos) {
    console.error('[emails] cambio-clase:', errorDatos);
    return { enviados: 0, sinEmail: 0 };
  }

  // Mismo motivo que /api/emails/send: sin este filtro, Resend rechaza cada
  // dirección de ejemplo con su propio error en inglés.
  const validas = destinatarias.filter(d => !esDominioReservado(d.email));
  const sinEmail = destinatarias.length - validas.length;
  if (validas.length === 0) return { enviados: 0, sinEmail };

  const resend = new Resend(apiKey);
  const [plantilla, marca] = await Promise.all([
    resolverPlantilla(studioId, 'cambio'),
    resolverMarcaEstudio(studioId),
  ]);

  // Asunto según qué cambió de verdad — mismo criterio que /api/emails/send.
  const motivoAsunto = datos.cambioHora || datos.cambioSala ? 'Cambio de horario' : 'Cambio de instructora';

  const resultados = await Promise.allSettled(validas.map(async d => {
    const varsPlantilla = { nombre: d.nombre, clase: datos.claseNombre };
    const intro = plantilla.intro ? interpolar(plantilla.intro, varsPlantilla) : undefined;
    const subject = plantilla.asunto
      ? interpolar(plantilla.asunto, varsPlantilla)
      : `${motivoAsunto} — ${datos.claseNombre}`;
    const html = await render(CambioClaseEmail({
      socioNombre: d.nombre, intro, ...marca,
      claseNombre: datos.claseNombre, fecha: datos.fecha, hora: datos.hora,
      sala: datos.sala, instructor: datos.instructor, instructorAnterior: datos.instructorAnterior,
      cambioHora: datos.cambioHora, cambioSala: datos.cambioSala,
    }));
    const { error } = await resend.emails.send({
      from: remitentePorMarca(marca.nombre || 'Tentare'),
      to: [d.email],
      subject,
      html,
    });
    if (error) throw error;
  }));

  const enviados = resultados.filter(r => r.status === 'fulfilled').length;
  return { enviados, sinEmail };
}
