import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { errorInterno } from '@/lib/errores-servidor';
import { render } from '@react-email/render';
import { ReciboEmail } from '@/lib/emails/recibo-template';
import { BienvenidaEmail } from '@/lib/emails/bienvenida-template';
import { ReservaEmail } from '@/lib/emails/reserva-template';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { PromocionEsperaEmail } from '@/lib/emails/promocion-espera-template';
import { CancelacionClaseEmail } from '@/lib/emails/cancelacion-clase-template';
import { RecordatorioEmail } from '@/lib/emails/recordatorio-template';
import { verificarSesionStaff } from '@/lib/auth-server';
import { resolverPlantilla, interpolar, resolverMarcaEstudio } from '@/lib/emails/plantillas-server';

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
    tipo: 'recibo' | 'bienvenida' | 'reserva' | 'automatizacion' | 'promocion' | 'cancelacion' | 'recordatorio';
    to: string;
    toName: string;
    data: Record<string, unknown>;
  };

  let html: string;
  let subject: string;

  // Override de plantilla del estudio (asunto + intro). El studioId sale de la
  // sesión de staff, no del body — así ningún emisor tiene que pasarlo. Para los
  // tipos no editables (recibo, automatizacion) devuelve {} y todo sigue igual.
  const plantilla = await resolverPlantilla(sesion.studioId, body.tipo);
  // Marca del estudio (logo + color): una sola resolución aquí, en vez de que
  // cada caller de /api/emails/send tenga que acordarse de pasarla.
  const marca = await resolverMarcaEstudio(sesion.studioId);
  const dv = body.data as { estudioNombre?: string; claseNombre?: string };
  const varsPlantilla = { nombre: body.toName, estudio: dv.estudioNombre, clase: dv.claseNombre };
  const introCustom = plantilla.intro ? interpolar(plantilla.intro, varsPlantilla) : undefined;
  const asuntoCustom = plantilla.asunto ? interpolar(plantilla.asunto, varsPlantilla) : undefined;

  if (body.tipo === 'recibo') {
    const d = body.data as {
      concepto: string; importe: number; fechaCobro: string;
      numeroFactura?: string; estudioNombre?: string;
    };
    html = await render(ReciboEmail({ socioNombre: body.toName, ...marca, ...d }));
    subject = `Pago confirmado — ${d.concepto}`;
  } else if (body.tipo === 'bienvenida') {
    const d = body.data as { planNombre?: string; estudioNombre?: string };
    html = await render(BienvenidaEmail({ socioNombre: body.toName, intro: introCustom, ...marca, ...d }));
    subject = asuntoCustom ?? `¡Bienvenida a ${d.estudioNombre ?? 'Tentare'}!`;
  } else if (body.tipo === 'reserva') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string;
    };
    html = await render(ReservaEmail({ socioNombre: body.toName, intro: introCustom, ...marca, ...d }));
    subject = asuntoCustom ?? `Reserva confirmada — ${d.claseNombre}`;
  } else if (body.tipo === 'automatizacion') {
    const d = body.data as { titulo: string; mensaje: string; estudioNombre?: string };
    html = await render(AutomatizacionEmail({ socioNombre: body.toName, ...marca, ...d }));
    subject = d.titulo;
  } else if (body.tipo === 'promocion') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string; bonoConsumido?: boolean;
    };
    html = await render(PromocionEsperaEmail({ socioNombre: body.toName, intro: introCustom, ...marca, ...d }));
    subject = asuntoCustom ?? `Se ha liberado tu plaza — ${d.claseNombre}`;
  } else if (body.tipo === 'cancelacion') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string; bonoDevuelto?: boolean;
    };
    html = await render(CancelacionClaseEmail({ socioNombre: body.toName, intro: introCustom, ...marca, ...d }));
    subject = asuntoCustom ?? `Clase cancelada — ${d.claseNombre}`;
  } else if (body.tipo === 'recordatorio') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string;
    };
    html = await render(RecordatorioEmail({ socioNombre: body.toName, intro: introCustom, ...marca, ...d }));
    subject = asuntoCustom ?? `Recordatorio — ${d.claseNombre}`;
  } else {
    return NextResponse.json({ error: 'Tipo de email desconocido' }, { status: 400 });
  }

  const { data, error } = await resend.emails.send({
    // Remitente configurable por env: una vez verificado el dominio propio en
    // Resend, poner RESEND_FROM='Tentare <hola@tudominio.com>'. Sin verificar,
    // el sandbox de Resend solo entrega al email de la cuenta.
    from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
    to: [body.to],
    subject,
    html,
  });

  if (error) {
    return errorInterno('emails:send', error,
      'No se ha podido enviar el email. Comprueba que la dirección sea correcta e inténtalo de nuevo.');
  }

  return NextResponse.json({ id: data?.id });
}
