import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import { errorInterno } from '@/lib/errores-servidor';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVer } from '@/lib/permisos-reglas';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { resolverContextoEstudio } from '@/lib/emails/plantillas-preview';
import { remitentePorMarca } from '@/lib/emails/remitente';
import { definicionMensaje, plantillaDe, renderMensaje } from '@/lib/engines/mensajes-automatizacion';

// «Enviarme una prueba» de un mensaje de automatización (evaluación del
// 13-sep). La pantalla ya enseñaba el texto con datos de ejemplo, pero cómo
// llega de verdad a una bandeja —asunto, remitente, cómo lo pinta Gmail— solo
// se sabía cuando le llegaba a una clienta real. Mismo criterio que la prueba
// de plantillas (/api/plantillas-email/prueba): SIEMPRE al email de quien lo
// pide, nunca a un destinatario del body, y con la plantilla de correo que usa
// el envío real (`AutomatizacionEmail`, ver lib/inngest/automatizaciones.ts).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Quien no puede abrir Automatizaciones tampoco se manda correos con la marca
  // del estudio desde aquí.
  if (!puedeVer(sesion.rol, '/automatizaciones')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  if (!sesion.email) return NextResponse.json({ error: 'Tu cuenta no tiene un email asociado' }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    return NextResponse.json({ error: 'El envío de correos no está configurado.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { ruleId?: string; clave?: string; texto?: string | null } | null;
  const def = body?.clave ? definicionMensaje(body.clave) : undefined;
  if (!def) return NextResponse.json({ error: 'Mensaje desconocido' }, { status: 400 });

  // El texto: el borrador que se está escribiendo (se prueba ANTES de guardar)
  // o, si no hay, el guardado en la regla de ESTE estudio.
  let plantilla = body?.texto?.trim() ? body.texto : null;
  if (!plantilla && body?.ruleId) {
    const admin = getSupabaseAdmin();
    const { data: regla } = admin
      ? await admin.from('automation_rules').select('condicion')
          .eq('id', body.ruleId).eq('studio_id', sesion.studioId).maybeSingle()
      : { data: null };
    plantilla = plantillaDe(regla ? { condicion: regla.condicion ?? {} } : undefined, def.clave);
  }
  if (!plantilla) plantilla = plantillaDe(undefined, def.clave);

  const ejemplos: Record<string, string> = {};
  for (const v of def.variables) ejemplos[v.clave] = v.ejemplo;
  const mensaje = renderMensaje(plantilla, ejemplos);

  const { nombre, marca } = await resolverContextoEstudio(sesion.studioId);
  const html = await render(AutomatizacionEmail({
    socioNombre: ejemplos.nombre ?? 'Elena',
    titulo: def.asunto,
    mensaje,
    estudioNombre: marca.estudioNombre ?? nombre,
    colorPrimario: marca.colorPrimario,
    logoUrl: marca.logoUrl,
  }));

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: remitentePorMarca(marca.nombre || nombre),
    to: [sesion.email],
    subject: `[PRUEBA] ${def.asunto}`,
    html,
  });
  if (error) {
    return errorInterno('automatizaciones:prueba', error, 'No se ha podido enviar la prueba. Inténtalo de nuevo.');
  }
  return NextResponse.json({ ok: true, enviadoA: sesion.email });
}
