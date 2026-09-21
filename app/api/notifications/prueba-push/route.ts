import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { rateLimit } from '@/lib/rate-limit';
import { CANALES } from '@/lib/notifications/channels';
import { EVENTOS, REGLAS } from '@/lib/notifications/catalog';
import { previsualizar, validarTexto } from '@/lib/notifications/textos-estudio';
import { antelacionDeFila, textoAntelacion, textoFaltan } from '@/lib/notificaciones/antelacion-recordatorio';

// Envío de PRUEBA de un texto de aviso desde el editor de Configuración: manda
// el push de verdad, con los datos de ejemplo de la vista previa, pero SIEMPRE
// a los dispositivos de quien lo pide — nunca a un destinatario del body, igual
// que la prueba de plantillas de correo (/api/plantillas-email/prueba). Existe
// porque comprobar un texto nuevo exigía una clase y una reserva de mentira y
// esperar al cron (prueba real del 21-sep). Nada se guarda: ni el texto ni una
// notificación.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Mismo criterio que la RLS de notification_template (migr 20260921145514):
  // el texto que ven las alumnas lo decide solo la propietaria.
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const limite = await rateLimit(`prueba-push:${sesion.userId}`, { max: 10, windowSeconds: 600 });
  if (!limite.allowed) {
    return NextResponse.json({ error: 'Has enviado muchas pruebas seguidas. Espera unos minutos.' }, { status: 429 });
  }

  const b = (await req.json().catch(() => null)) as { evento?: string; title?: string; body?: string } | null;
  const evento = b?.evento ?? '';
  const texto = { title: b?.title ?? '', body: b?.body ?? '' };
  const invalido = validarTexto(evento, texto);
  if (invalido) return NextResponse.json({ error: invalido }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // La antelación de ESTE estudio: la prueba tiene que decir lo que dirá el de verdad.
  const { data: st } = await admin.from('studios')
    .select('recordatorio_largo_horas, recordatorio_corto_minutos').eq('id', sesion.studioId).maybeSingle();
  const a = antelacionDeFila(st ?? {});
  const datos: Record<string, string> = evento === EVENTOS.RECORDATORIO_24H ? { antelacion: textoAntelacion('24h', a), faltan: textoFaltan('24h', a) }
    : evento === EVENTOS.RECORDATORIO_1H ? { antelacion: textoAntelacion('1h', a), faltan: textoFaltan('1h', a) }
    : {};
  const muestra = previsualizar(texto, datos, evento);

  const ahora = new Date().toISOString();
  const res = await CANALES.PUSH!.enviar({
    admin,
    destinatario: { role: 'PROPIETARIO', userId: sesion.userId },
    notificacion: {
      id: `prueba-${ahora}`, studioId: sesion.studioId, recipientRole: 'PROPIETARIO', recipientUserId: sesion.userId,
      recipientSocioId: null, recipientInstructorId: null, eventType: `prueba.${evento}`,
      category: REGLAS[evento].category, priority: REGLAS[evento].priority,
      title: `Prueba · ${muestra.title}`, body: muestra.body,
      resourceType: null, resourceId: null, deepLink: null, data: null, readAt: null, archivedAt: null, createdAt: ahora,
    },
  });

  if (res.status === 'SENT') {
    const dispositivos = Number.parseInt(res.providerId ?? '', 10) || 1;
    return NextResponse.json({ ok: true, dispositivos });
  }
  if (res.error === 'sin suscripción push' || res.error === 'sin endpoints válidos') {
    return NextResponse.json({
      error: 'No tienes los avisos activados en ningún dispositivo. Actívalos en Configuración › Mis avisos o en la app de tu estudio, y vuelve a probar.',
    }, { status: 409 });
  }
  if (res.status === 'SKIPPED') return NextResponse.json({ error: 'Los avisos al móvil no están configurados en este servidor.' }, { status: 503 });
  return errorInterno('notifications/prueba-push', new Error(res.error ?? 'push fallido'), 'No se ha podido enviar la prueba. Inténtalo de nuevo.');
}
