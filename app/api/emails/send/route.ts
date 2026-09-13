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
import { resolverPlantilla, envioDesactivado, interpolar, interpolarPersonalizacion, resolverMarcaEstudio, generarEnlaceAccesoSocia } from '@/lib/emails/plantillas-server';
import { validarDatosEmail } from '@/lib/emails/validar-datos';
import { esDominioReservado } from '@/lib/emails/dominios-reservados';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { registrarComunicacion } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { escaparLike } from '@/lib/escapar-like';
import { rateLimit } from '@/lib/rate-limit';
import { tooManyRequestsResponse, retryAfterSeconds } from '@/lib/rate-limit-core';
import { puedeEnviarEmail, TIPOS_EMAIL_PANEL, TIPOS_EMAIL_DE_CLASE, type TipoEmailPanel } from '@/lib/permisos-reglas';
import { clasesParaAviso } from '@/lib/avisos-clase-servidor';

const json = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  // SEGURIDAD: solo staff autenticado. Evita que cualquiera use la cuenta de
  // Resend del estudio para enviar correos (spam / phishing).
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return json('No autorizado', 401);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    return json('Resend no configurado. Añade RESEND_API_KEY en .env.local', 503);
  }

  const resend = new Resend(apiKey);
  const body = (await req.json().catch(() => null)) as {
    tipo?: string;
    to?: string;
    toName?: string;
    data?: Record<string, unknown>;
    socioId?: string;
  } | null;
  if (!body || typeof body.to !== 'string' || !body.to.trim()) return json('Falta el destinatario.', 400);
  if (!(TIPOS_EMAIL_PANEL as readonly string[]).includes(body.tipo ?? '')) return json('Tipo de email desconocido', 400);
  const tipo = body.tipo as TipoEmailPanel;
  const to = body.to.trim();
  const toName = typeof body.toName === 'string' ? body.toName : '';
  const dataCliente = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>;

  // Rol por tipo de correo (ver `puedeEnviarEmail`). Antes bastaba la sesión:
  // una instructora podía mandar a una clienta un «Pago confirmado» o un texto
  // libre con la marca del estudio. Aquí va el techo del rol; que la clase de
  // una cancelación sea de quien llama se comprueba abajo, contra la BD.
  if (!puedeEnviarEmail(sesion.rol, tipo, true)) {
    return json('No tienes permiso para enviar este email.', 403);
  }

  // Direcciones de ejemplo (RFC 2606): se cortan ANTES de llamar a Resend, igual
  // que en el motor de automatizaciones. Hasta ahora la guarda sólo vivía allí, así
  // que todo lo que dispara la dueña a mano desde el panel —recibo, bienvenida,
  // cancelación, cambio de instructora, campaña— salía sin filtrar. Resend las
  // rechaza de todas formas, pero con un error suyo en inglés; aquí le decimos qué
  // arreglar y nos ahorramos la llamada. Ver lib/emails/dominios-reservados.ts.
  if (esDominioReservado(to)) {
    return json(`${toName || to} tiene un email de ejemplo (${to}), no una dirección real. Corrígelo en su ficha para que reciba los avisos.`, 400);
  }

  // Auditoría 23ª pasada (4-sep-2026), P-4: el destinatario tiene que ser una
  // clienta del estudio. Todos los llamantes reales sacan `to`/`toName` de una
  // fila de `socios` del propio estudio. Se piden todas las fichas con ese email
  // (una familia puede compartirlo): el recibo o la plaza pueden ser de cualquiera.
  const admin = getSupabaseAdmin();
  if (!admin) return json('Servidor no configurado', 503);
  const { data: socias } = await admin
    .from('socios').select('id')
    .eq('studio_id', sesion.studioId)
    .ilike('email', escaparLike(to))
    .limit(20);
  const socioIds = ((socias ?? []) as { id: string }[]).map(s => s.id);
  if (socioIds.length === 0) {
    return json('Ese destinatario no es una clienta de tu estudio.', 403);
  }

  // Red de seguridad de volumen: generoso a propósito (la mensajería masiva ya
  // manda a "todas" las socias de un estudio en una sola campaña) — no está
  // pensado para acotar el uso normal, solo para que una sesión comprometida
  // no pueda convertir esto en un cañón de spam sin límite.
  const porEstudio = await rateLimit(`emails-send:${sesion.studioId}`, { max: 500, windowSeconds: 3600 });
  if (!porEstudio.allowed) {
    return tooManyRequestsResponse(retryAfterSeconds(porEstudio.resetAt, 3600));
  }

  // Lo que dice un justificante de pago o un aviso de clase sale de la BD, no de
  // la petición: si no, cualquiera con permiso de enviar podía inventarse el
  // importe, el concepto o una clase. Solo `bienvenida` y `automatizacion` usan
  // `data` tal cual llega.
  let datos: Record<string, unknown> = dataCliente;
  if (tipo === 'recibo') {
    const reciboId = typeof dataCliente.reciboId === 'string' ? dataCliente.reciboId : null;
    if (!reciboId) return json('Falta el recibo del justificante.', 400);
    const { data: recibo } = await admin.from('recibos')
      .select('concepto, importe, socio_id, fecha_cobro, estado')
      .eq('id', reciboId).eq('studio_id', sesion.studioId).maybeSingle();
    if (!recibo) return json('Recibo no encontrado.', 404);
    if (!socioIds.includes(recibo.socio_id as string)) return json('Ese recibo no es de esa clienta.', 403);
    if (recibo.estado !== 'COBRADO') return json('Ese recibo no está cobrado.', 409);
    // Puede no existir: la factura se sella aparte. El email sale sin número.
    const { data: factura } = await admin.from('facturas')
      .select('numero_completo').eq('recibo_id', reciboId).maybeSingle();
    datos = {
      concepto: recibo.concepto,
      importe: Number(recibo.importe),
      fechaCobro: (recibo.fecha_cobro as string | null) ?? new Date().toISOString(),
      numeroFactura: (factura?.numero_completo as string | null) ?? undefined,
    };
  } else if ((TIPOS_EMAIL_DE_CLASE as readonly string[]).includes(tipo)) {
    const sesionId = typeof dataCliente.sesionId === 'string' ? dataCliente.sesionId : null;
    if (!sesionId) return json('Falta la clase del aviso.', 400);
    const r = await clasesParaAviso(admin, sesion, [sesionId]);
    if (!r) return json('No se ha podido comprobar la clase.', 500);
    if (r.ajenas > 0) return json('No tienes permiso para avisar de esta clase.', 403);
    const clase = r.clases[0];
    if (!clase) return json('Sesión no encontrada', 404);
    // Una cancelación, de una clase cancelada en la BD; el resto, de una en pie.
    if ((tipo === 'cancelacion') !== clase.cancelada) {
      return json(tipo === 'cancelacion' ? 'Esa clase no está cancelada.' : 'Esa clase está cancelada.', 409);
    }
    // Y a quien tenga plaza en ella. Quien cancela avisa ANTES de cancelar las
    // reservas, así que en ese momento siguen vivas.
    const { data: plaza } = await admin.from('reservas').select('id')
      .eq('sesion_id', clase.id).in('socio_id', socioIds).neq('estado', 'CANCELADA').limit(1);
    if (!plaza || plaza.length === 0) return json('Esa clienta no tiene plaza en esa clase.', 403);
    datos = {
      claseNombre: clase.clase, fecha: clase.fecha, hora: clase.hora,
      sala: clase.sala, instructor: clase.instructor,
      cambioHora: dataCliente.cambioHora === true, cambioSala: dataCliente.cambioSala === true,
    };
  }

  // La propietaria puede apagar cualquiera de los correos automáticos desde
  // Configuración → Emails. Se comprueba aquí, en la puerta de servidor, y no
  // en cada pantalla que llama: un interruptor que dependa de que seis sitios
  // se acuerden de mirarlo no es un interruptor.
  //
  // 200 con `omitido`, no un 4xx: quien llama no ha hecho nada mal —el estudio
  // ha decidido que ese correo no sale—, y un error pintaría un aviso rojo en
  // el panel cada vez que se da de alta a una clienta con la bienvenida
  // apagada. Los llamantes que cuentan avisos de verdad
  // (enviarEmailCancelacionClase) miran este campo para no contar de más.
  if (await envioDesactivado(sesion.studioId, tipo)) {
    return NextResponse.json({ omitido: 'desactivado' });
  }

  // `data` llega sin tipos en runtime. Se valida ANTES de renderizar: los campos
  // que van en template literals (asunto, `preview`) sacan "undefined" a la
  // vista de la clienta, y los que reciben un método (importe.toFixed, new
  // Date(fechaCobro)) revientan sin try/catch en un 500 opaco. Sólo lo que rompe
  // el email de verdad — ver lib/emails/validar-datos.
  const errorDatos = validarDatosEmail(tipo, datos);
  if (errorDatos) return json(errorDatos, 400);

  let html: string;
  let subject: string;

  // Override de plantilla del estudio (asunto + intro). El studioId sale de la
  // sesión de staff, no del body — así ningún emisor tiene que pasarlo. Para los
  // tipos no editables (recibo, automatizacion) devuelve {} y todo sigue igual.
  const plantilla = await resolverPlantilla(sesion.studioId, tipo);
  // Marca del estudio (logo + color): una sola resolución aquí, en vez de que
  // cada caller de /api/emails/send tenga que acordarse de pasarla.
  const marca = await resolverMarcaEstudio(sesion.studioId);
  const dv = datos as { estudioNombre?: string; claseNombre?: string };
  // `{estudio}` en una plantilla personalizada sale del nombre REAL del estudio
  // (sesión → studios.nombre), no de lo que mande el cliente: ningún emisor de
  // lib/api-client.ts pone `estudioNombre` en el body, así que la variable se
  // interpolaba a cadena vacía y la propietaria veía "Bienvenida a  " en su
  // propio asunto. Mismo motivo que el default 'Tentare' del encabezado.
  const nombreEstudio = marca.nombre || dv.estudioNombre;
  const varsPlantilla = { nombre: toName, estudio: nombreEstudio, clase: dv.claseNombre };
  const introCustom = plantilla.intro ? interpolar(plantilla.intro, varsPlantilla) : undefined;
  const asuntoCustom = plantilla.asunto ? interpolar(plantilla.asunto, varsPlantilla) : undefined;
  // Personalización total (cuerpo libre, marca y pie por plantilla). Para los
  // tipos no editables viene vacía y no cambia nada.
  const personalizacion = interpolarPersonalizacion(plantilla, varsPlantilla);

  type DatosClase = { claseNombre: string; fecha: string; hora: string; sala: string; instructor: string; estudioNombre?: string };

  if (tipo === 'recibo') {
    const d = datos as {
      concepto: string; importe: number; fechaCobro: string;
      numeroFactura?: string; estudioNombre?: string;
    };
    html = await render(ReciboEmail({ socioNombre: toName, ...d, ...marca }));
    subject = `Pago confirmado — ${d.concepto}`;
  } else if (tipo === 'bienvenida') {
    const d = datos as { planNombre?: string; estudioNombre?: string };
    // Enlace de acceso directo al portal: antes la bienvenida no decía cómo
    // entrar y la socia se quedaba sin saber que existía /portal/{slug}. Es el
    // mismo magic link que ya usa el login sin contraseña del portal, solo que
    // lo dispara el staff en vez de esperar a que la socia lo pida ella misma.
    // Fallo suave: si algo falla, la bienvenida sale igual, sin el botón.
    const urlAcceso = marca.slug ? await generarEnlaceAccesoSocia(marca.slug, to) : null;
    html = await render(BienvenidaEmail({ socioNombre: toName, intro: introCustom, personalizacion, url: urlAcceso ?? undefined, ...d, ...marca }));
    subject = asuntoCustom ?? `¡Bienvenida a ${nombreEstudio ?? 'tu estudio'}!`;
  } else if (tipo === 'reserva') {
    const d = datos as DatosClase;
    html = await render(ReservaEmail({ socioNombre: toName, intro: introCustom, personalizacion, ...d, ...marca }));
    subject = asuntoCustom ?? `Reserva confirmada — ${d.claseNombre}`;
  } else if (tipo === 'automatizacion') {
    const d = datos as { titulo: string; mensaje: string; estudioNombre?: string };
    html = await render(AutomatizacionEmail({ socioNombre: toName, ...d, ...marca }));
    subject = d.titulo;
  } else if (tipo === 'promocion') {
    const d = datos as DatosClase;
    html = await render(PromocionEsperaEmail({ socioNombre: toName, intro: introCustom, personalizacion, ...d, ...marca }));
    subject = asuntoCustom ?? `Se ha liberado tu plaza — ${d.claseNombre}`;
  } else if (tipo === 'cancelacion') {
    const d = datos as DatosClase;
    html = await render(CancelacionClaseEmail({ socioNombre: toName, intro: introCustom, personalizacion, ...d, ...marca }));
    subject = asuntoCustom ?? `Clase cancelada — ${d.claseNombre}`;
  } else if (tipo === 'cambio') {
    const d = datos as DatosClase & { cambioHora?: boolean; cambioSala?: boolean };
    html = await render(CambioClaseEmail({ socioNombre: toName, intro: introCustom, ...d, ...marca }));
    // Asunto según qué cambió de verdad — antes siempre decía "instructora"
    // aunque el motivo fuera mover la clase de hora/sala.
    const motivoAsunto = d.cambioHora || d.cambioSala ? 'Cambio de horario' : 'Cambio de instructora';
    subject = asuntoCustom ?? `${motivoAsunto} — ${d.claseNombre}`;
  } else {
    const d = datos as DatosClase;
    html = await render(RecordatorioEmail({ socioNombre: toName, intro: introCustom, ...d, ...marca }));
    subject = asuntoCustom ?? `Recordatorio — ${d.claseNombre}`;
  }

  const { data, error } = await resend.emails.send({
    // Remitente con el nombre del estudio (misma dirección verificada de
    // siempre, ver lib/emails/remitente.ts) — sin nombre resuelto, cae a Tentare.
    from: remitentePorMarca(nombreEstudio || 'Tentare'),
    // Reply-To del estudio: si la clienta contesta, le contesta a SU
    // estudio. La dirección que firma sigue siendo la verificada de la
    // plataforma (una del estudio sin verificar en Resend rebotaría).
    ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
    to: [to],
    subject,
    html,
  });

  // Historial real de comunicaciones — best-effort (registrarComunicacion ya
  // captura sus propios errores internamente y nunca lanza): si el email SÍ
  // salió (o SÍ falló), eso ya es el resultado que importa; un problema al
  // loguearlo no debe convertir un envío correcto en un error 500.
  // Solo con la ficha de la destinataria, no con cualquier id del body.
  if (body.socioId && socioIds.includes(body.socioId)) {
    await registrarComunicacion({
      studioId: sesion.studioId,
      socioId: body.socioId,
      tipo,
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
