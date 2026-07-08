import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { ReciboEmail } from '@/lib/emails/recibo-template';
import { BienvenidaEmail } from '@/lib/emails/bienvenida-template';
import { ReservaEmail } from '@/lib/emails/reserva-template';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { verificarSesionStaff } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  // SEGURIDAD: solo staff autenticado. Evita que cualquiera use la cuenta de
  // Resend del estudio para enviar correos (spam / phishing).
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    return NextResponse.json({ error: 'Resend no configurado. Añade RESEND_API_KEY en .env.local' }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  const body = await req.json() as {
    tipo: 'recibo' | 'bienvenida' | 'reserva' | 'automatizacion';
    to: string;
    toName: string;
    data: Record<string, unknown>;
  };

  let html: string;
  let subject: string;

  if (body.tipo === 'recibo') {
    const d = body.data as {
      concepto: string; importe: number; fechaCobro: string;
      numeroFactura?: string; estudioNombre?: string;
    };
    html = await render(ReciboEmail({ socioNombre: body.toName, ...d }));
    subject = `Pago confirmado — ${d.concepto}`;
  } else if (body.tipo === 'bienvenida') {
    const d = body.data as { planNombre?: string; estudioNombre?: string };
    html = await render(BienvenidaEmail({ socioNombre: body.toName, ...d }));
    subject = `¡Bienvenida a ${d.estudioNombre ?? 'Tentare'}!`;
  } else if (body.tipo === 'reserva') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string;
    };
    html = await render(ReservaEmail({ socioNombre: body.toName, ...d }));
    subject = `Reserva confirmada — ${d.claseNombre}`;
  } else if (body.tipo === 'automatizacion') {
    const d = body.data as { titulo: string; mensaje: string; estudioNombre?: string };
    html = await render(AutomatizacionEmail({ socioNombre: body.toName, ...d }));
    subject = d.titulo;
  } else {
    return NextResponse.json({ error: 'Tipo de email desconocido' }, { status: 400 });
  }

  const { data, error } = await resend.emails.send({
    // Dominio de pruebas de Resend: hasta que se compre y verifique un
    // dominio propio (ver tentare.es), solo se puede enviar de verdad al
    // email con el que se creó la cuenta de Resend.
    from: 'Tentare <onboarding@resend.dev>',
    to: [body.to],
    subject,
    html,
  });

  if (error) {
    console.error('[Resend error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.id });
}
