import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { ReciboEmail } from '@/lib/emails/recibo-template';
import { BienvenidaEmail } from '@/lib/emails/bienvenida-template';
import { ReservaEmail } from '@/lib/emails/reserva-template';

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    return NextResponse.json({ error: 'Resend no configurado. Añade RESEND_API_KEY en .env.local' }, { status: 503 });
  }

  const resend = new Resend(apiKey);
  const body = await req.json() as {
    tipo: 'recibo' | 'bienvenida' | 'reserva';
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
  } else {
    return NextResponse.json({ error: 'Tipo de email desconocido' }, { status: 400 });
  }

  const { data, error } = await resend.emails.send({
    from: 'Tentare <no-reply@tentare.es>',
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
