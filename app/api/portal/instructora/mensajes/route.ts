import { NextRequest, NextResponse, after } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import {
  abrirHiloConAlumna, avisarMensajeNuevo, enviarEnHilo, hilosDeInstructora, marcarHiloLeido, mensajesDeHilo,
} from '@/lib/portal-instructora/mensajes-servidor';
import { textoNoAbrir } from '@/lib/student/mensajes-instructora';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { errorInterno } from '@/lib/errores-servidor';

// Chat de la instructora con sus alumnas desde la app del estudio. Las reglas
// viven en `lib/portal-instructora/mensajes-servidor.ts`.
//
// Ruta aparte de `/api/public/mensajeria` (la socia) y de `/api/mensajeria` (el
// panel): cada una resuelve la identidad de una forma distinta, y aquí la
// instructora y el estudio salen del token + slug. Un hilo o una alumna que no
// son suyos responden igual (404) que si no existieran.

const ACCIONES = ['hilos', 'abrir', 'mensajes', 'enviar', 'leido'] as const;
type Accion = (typeof ACCIONES)[number];

const NO_ENCONTRADO = 'No encontramos esta conversación.';

const ERRORES: Record<Accion, string> = {
  hilos: 'No hemos podido cargar tus mensajes. Vuelve a intentarlo.',
  abrir: 'No hemos podido abrir la conversación. Vuelve a intentarlo.',
  mensajes: 'No hemos podido cargar los mensajes. Vuelve a intentarlo.',
  enviar: 'No se ha podido enviar el mensaje. Vuelve a intentarlo.',
  leido: 'No se ha podido marcar como leído.',
};

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-mensajes', { max: 120, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    slug?: string; accion?: unknown; socioId?: unknown; conversacionId?: unknown; cuerpo?: unknown;
  } | null;
  if (!body?.slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body.accion as Accion;
  if (!ACCIONES.includes(accion)) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const socioId = texto(body.socioId);
  const conversacionId = texto(body.conversacionId);
  if (accion === 'abrir' && !socioId) return NextResponse.json({ error: 'Falta la alumna' }, { status: 400 });
  if ((accion === 'mensajes' || accion === 'enviar' || accion === 'leido') && !conversacionId) {
    return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
  }
  const cuerpo = typeof body.cuerpo === 'string' ? body.cuerpo.trim() : '';
  if (accion === 'enviar' && (cuerpo.length < 1 || cuerpo.length > 4000)) {
    return NextResponse.json({ error: 'El mensaje debe tener entre 1 y 4000 caracteres.' }, { status: 400 });
  }

  try {
    const sesion = await verificarInstructoraEnEstudio(req, body.slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const suya = { studioId: sesion.studioId, instructorId: sesion.instructorId, userId: sesion.userId };

    // Escribir y abrir, con tope por INSTRUCTORA (no por IP: `enforceRateLimit`
    // mete la IP en la clave y con datos y wifi el límite se multiplica).
    if (accion === 'enviar' || accion === 'abrir') {
      const opciones = accion === 'enviar' ? { max: 30, windowSeconds: 60 } : { max: 20, windowSeconds: 60 };
      const limite = await rateLimit(`portal-instructora-mensajes-${accion}:${sesion.instructorId}`, opciones);
      if (!limite.allowed) return tooManyRequestsResponse(retryAfterSeconds(limite.resetAt, opciones.windowSeconds));
    }

    switch (accion) {
      case 'hilos':
        return NextResponse.json({ hilos: await hilosDeInstructora(suya) }, { headers: { 'Cache-Control': 'no-store' } });

      case 'abrir': {
        const r = await abrirHiloConAlumna({ ...suya, socioId: socioId as string });
        if (!r) return NextResponse.json({ error: 'No encontramos a esta alumna.' }, { status: 404 });
        if (!r.ok) return NextResponse.json({ error: textoNoAbrir(r.motivo), motivo: r.motivo }, { status: 409 });
        return NextResponse.json({ id: r.id });
      }

      case 'mensajes': {
        const mensajes = await mensajesDeHilo(suya, conversacionId as string);
        if (!mensajes) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 });
        return NextResponse.json({ mensajes }, { headers: { 'Cache-Control': 'no-store' } });
      }

      case 'enviar': {
        const mensaje = await enviarEnHilo(suya, conversacionId as string, cuerpo);
        if (!mensaje) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 });
        // Avisar nunca retrasa la respuesta: el mensaje ya está guardado.
        after(() => avisarMensajeNuevo({ ...suya, remitente: sesion.nombre }, conversacionId as string, mensaje.id));
        return NextResponse.json({ mensaje });
      }

      case 'leido': {
        const ok = await marcarHiloLeido(suya, conversacionId as string);
        if (!ok) return NextResponse.json({ error: NO_ENCONTRADO }, { status: 404 });
        return new NextResponse(null, { status: 204 });
      }
    }
  } catch (err) {
    return errorInterno(`portal/instructora/mensajes:${accion}`, err, ERRORES[accion]);
  }
}
