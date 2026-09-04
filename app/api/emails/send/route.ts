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
import { CambioClaseEmail } from '@/lib/emails/cambio-clase-template';
import { RecordatorioEmail } from '@/lib/emails/recordatorio-template';
import { verificarSesionStaff } from '@/lib/auth-server';
import { resolverPlantilla, interpolar, interpolarPersonalizacion, resolverMarcaEstudio, generarEnlaceAccesoSocia } from '@/lib/emails/plantillas-server';
import { validarDatosEmail } from '@/lib/emails/validar-datos';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { registrarComunicacion } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { escaparLike } from '@/lib/escapar-like';
import { rateLimit } from '@/lib/rate-limit';
import { tooManyRequestsResponse, retryAfterSeconds } from '@/lib/rate-limit-core';

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
    tipo: 'recibo' | 'bienvenida' | 'reserva' | 'automatizacion' | 'promocion' | 'cancelacion' | 'cambio' | 'recordatorio';
    to: string;
    toName: string;
    data: Record<string, unknown>;
    socioId?: string;
  };

  // Direcciones de ejemplo (RFC 2606): se cortan ANTES de llamar a Resend, igual
  // que en el motor de automatizaciones. Hasta ahora la guarda sólo vivía allí, así
  // que todo lo que dispara la dueña a mano desde el panel —recibo, bienvenida,
  // cancelación, cambio de instructora, campaña— salía sin filtrar. Resend las
  // rechaza de todas formas, pero con un error suyo en inglés; aquí le decimos qué
  // arreglar y nos ahorramos la llamada. Ver lib/emails/dominios-reservados.ts.
  if (esDominioReservado(body.to)) {
    return NextResponse.json({
      error: `${body.toName || body.to} tiene un email de ejemplo (${body.to}), no una dirección real. Corrígelo en su ficha para que reciba los avisos.`,
    }, { status: 400 });
  }

  // Auditoría 23ª pasada (4-sep-2026), P-4. Hasta aquí solo se comprobaba que
  // hubiera SESIÓN de staff — cualquier rol (incluida INSTRUCTOR) podía mandar
  // asunto y cuerpo arbitrarios a CUALQUIER dirección, en volumen ilimitado,
  // firmados desde el dominio verificado que comparten TODOS los estudios. El
  // radio de explosión no era el estudio de quien llamaba: era la reputación
  // de envío del SaaS entero.
  //
  // Los ocho tipos de este endpoint son comunicaciones de NEGOCIO a una socia
  // (recibo, bienvenida, reserva, cancelación...) — ninguno es un envío libre a
  // una dirección externa. Todos los llamantes reales (lib/api-client.ts,
  // mensajería, automatizaciones) ya sacan `to`/`toName` de una fila de
  // `socios` cargada del propio estudio, así que exigirlo en servidor no
  // rompe ningún camino legítimo, solo cierra el que nadie usa.
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const { data: socia } = await admin
    .from('socios').select('id')
    .eq('studio_id', sesion.studioId)
    .ilike('email', escaparLike(body.to.trim()))
    .limit(1).maybeSingle();
  if (!socia) {
    return NextResponse.json({ error: 'Ese destinatario no es una clienta de tu estudio.' }, { status: 403 });
  }

  // Red de seguridad de volumen: generoso a propósito (la mensajería masiva ya
  // manda a "todas" las socias de un estudio en una sola campaña) — no está
  // pensado para acotar el uso normal, solo para que una sesión comprometida
  // no pueda convertir esto en un cañón de spam sin límite.
  const porEstudio = await rateLimit(`emails-send:${sesion.studioId}`, { max: 500, windowSeconds: 3600 });
  if (!porEstudio.allowed) {
    return tooManyRequestsResponse(retryAfterSeconds(porEstudio.resetAt, 3600));
  }

  // `body.data` llega con un `as` que TypeScript no comprueba en runtime. Se
  // valida ANTES de renderizar: los campos que van en template literals (asunto,
  // `preview`) sacan "undefined" a la vista de la clienta, y los que reciben un
  // método (importe.toFixed, new Date(fechaCobro)) revientan sin try/catch en un
  // 500 opaco. Sólo lo que rompe el email de verdad — ver lib/emails/validar-datos.
  const errorDatos = validarDatosEmail(body.tipo, body.data);
  if (errorDatos) return NextResponse.json({ error: errorDatos }, { status: 400 });

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
  // `{estudio}` en una plantilla personalizada sale del nombre REAL del estudio
  // (sesión → studios.nombre), no de lo que mande el cliente: ningún emisor de
  // lib/api-client.ts pone `estudioNombre` en el body, así que la variable se
  // interpolaba a cadena vacía y la propietaria veía "Bienvenida a  " en su
  // propio asunto. Mismo motivo que el default 'Tentare' del encabezado.
  const nombreEstudio = marca.nombre || dv.estudioNombre;
  const varsPlantilla = { nombre: body.toName, estudio: nombreEstudio, clase: dv.claseNombre };
  const introCustom = plantilla.intro ? interpolar(plantilla.intro, varsPlantilla) : undefined;
  const asuntoCustom = plantilla.asunto ? interpolar(plantilla.asunto, varsPlantilla) : undefined;
  // Personalización total (cuerpo libre, marca y pie por plantilla). Para los
  // tipos no editables viene vacía y no cambia nada.
  const personalizacion = interpolarPersonalizacion(plantilla, varsPlantilla);

  if (body.tipo === 'recibo') {
    const d = body.data as {
      concepto: string; importe: number; fechaCobro: string;
      numeroFactura?: string; estudioNombre?: string;
    };
    html = await render(ReciboEmail({ socioNombre: body.toName, ...d, ...marca }));
    subject = `Pago confirmado — ${d.concepto}`;
  } else if (body.tipo === 'bienvenida') {
    const d = body.data as { planNombre?: string; estudioNombre?: string };
    // Enlace de acceso directo al portal: antes la bienvenida no decía cómo
    // entrar y la socia se quedaba sin saber que existía /portal/{slug}. Es el
    // mismo magic link que ya usa el login sin contraseña del portal, solo que
    // lo dispara el staff en vez de esperar a que la socia lo pida ella misma.
    // Fallo suave: si algo falla, la bienvenida sale igual, sin el botón.
    const urlAcceso = marca.slug ? await generarEnlaceAccesoSocia(marca.slug, body.to) : null;
    html = await render(BienvenidaEmail({ socioNombre: body.toName, intro: introCustom, personalizacion, url: urlAcceso ?? undefined, ...d, ...marca }));
    subject = asuntoCustom ?? `¡Bienvenida a ${nombreEstudio ?? 'tu estudio'}!`;
  } else if (body.tipo === 'reserva') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string;
    };
    html = await render(ReservaEmail({ socioNombre: body.toName, intro: introCustom, personalizacion, ...d, ...marca }));
    subject = asuntoCustom ?? `Reserva confirmada — ${d.claseNombre}`;
  } else if (body.tipo === 'automatizacion') {
    const d = body.data as { titulo: string; mensaje: string; estudioNombre?: string };
    html = await render(AutomatizacionEmail({ socioNombre: body.toName, ...d, ...marca }));
    subject = d.titulo;
  } else if (body.tipo === 'promocion') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string; bonoConsumido?: boolean;
    };
    html = await render(PromocionEsperaEmail({ socioNombre: body.toName, intro: introCustom, personalizacion, ...d, ...marca }));
    subject = asuntoCustom ?? `Se ha liberado tu plaza — ${d.claseNombre}`;
  } else if (body.tipo === 'cancelacion') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string; bonoDevuelto?: boolean;
    };
    html = await render(CancelacionClaseEmail({ socioNombre: body.toName, intro: introCustom, personalizacion, ...d, ...marca }));
    subject = asuntoCustom ?? `Clase cancelada — ${d.claseNombre}`;
  } else if (body.tipo === 'cambio') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; instructorAnterior?: string; estudioNombre?: string;
      cambioHora?: boolean; cambioSala?: boolean;
    };
    html = await render(CambioClaseEmail({ socioNombre: body.toName, intro: introCustom, ...d, ...marca }));
    // Asunto según qué cambió de verdad — antes siempre decía "instructora"
    // aunque el motivo fuera mover la clase de hora/sala.
    const motivoAsunto = d.cambioHora || d.cambioSala ? 'Cambio de horario' : 'Cambio de instructora';
    subject = asuntoCustom ?? `${motivoAsunto} — ${d.claseNombre}`;
  } else if (body.tipo === 'recordatorio') {
    const d = body.data as {
      claseNombre: string; fecha: string; hora: string;
      sala: string; instructor: string; estudioNombre?: string;
    };
    html = await render(RecordatorioEmail({ socioNombre: body.toName, intro: introCustom, ...d, ...marca }));
    subject = asuntoCustom ?? `Recordatorio — ${d.claseNombre}`;
  } else {
    return NextResponse.json({ error: 'Tipo de email desconocido' }, { status: 400 });
  }

  const { data, error } = await resend.emails.send({
    // Remitente con el nombre del estudio (misma dirección verificada de
    // siempre, ver lib/emails/remitente.ts) — sin nombre resuelto, cae a Tentare.
    from: remitentePorMarca(nombreEstudio || 'Tentare'),
    // Reply-To del estudio: si la clienta contesta, le contesta a SU
    // estudio. La dirección que firma sigue siendo la verificada de la
    // plataforma (una del estudio sin verificar en Resend rebotaría).
    ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
    to: [body.to],
    subject,
    html,
  });

  // Historial real de comunicaciones — best-effort (registrarComunicacion ya
  // captura sus propios errores internamente y nunca lanza): si el email SÍ
  // salió (o SÍ falló), eso ya es el resultado que importa; un problema al
  // loguearlo no debe convertir un envío correcto en un error 500.
  if (body.socioId) {
    await registrarComunicacion({
      studioId: sesion.studioId,
      socioId: body.socioId,
      tipo: body.tipo,
      asunto: subject,
      estado: error ? 'FALLIDO' : 'ENVIADO',
      error: error?.message ?? null,
      resendId: data?.id ?? null,
      creadoPor: sesion.userId,
      creadoPorNombre: sesion.nombre,
    });
  }

  if (error) {
    return errorInterno('emails:send', error,
      'No se ha podido enviar el email. Comprueba que la dirección sea correcta e inténtalo de nuevo.');
  }

  return NextResponse.json({ id: data?.id });
}
