import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { errorInterno } from '@/lib/errores-servidor';
import { verificarSesionStaff } from '@/lib/auth-server';
import { esTipoEditable } from '@/lib/emails/plantillas-server';
import { renderPlantillaMuestra, resolverContextoEstudio } from '@/lib/emails/plantillas-preview';

// P2-11. Envío de PRUEBA de una plantilla: manda el email de verdad, con los
// mismos datos de muestra que la vista previa, pero SIEMPRE al email de quien
// lo pide — nunca a un destinatario del body. Es la única manera de comprobar
// cómo llega de verdad a una bandeja de entrada (asunto en la lista, remitente,
// cómo lo pinta Gmail) sin arriesgarse a que lo reciba una clienta real.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!sesion.email) return NextResponse.json({ error: 'Tu cuenta no tiene un email asociado' }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    return NextResponse.json({ error: 'Resend no configurado. Añade RESEND_API_KEY en .env.local' }, { status: 503 });
  }

  const body = await req.json() as { tipo?: string; asunto?: string | null; intro?: string | null };
  if (!body.tipo || !esTipoEditable(body.tipo)) {
    return NextResponse.json({ error: 'Tipo de plantilla desconocido' }, { status: 400 });
  }

  const { nombre, marca } = await resolverContextoEstudio(sesion.studioId);
  const { html, subject } = await renderPlantillaMuestra(body.tipo, { asunto: body.asunto, intro: body.intro }, marca, nombre);

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
    to: [sesion.email],
    subject: `[PRUEBA] ${subject}`,
    html,
  });
  if (error) {
    return errorInterno('plantillas-email:prueba', error,
      'No se ha podido enviar la prueba. Inténtalo de nuevo.');
  }

  return NextResponse.json({ ok: true, enviadoA: sesion.email });
}
