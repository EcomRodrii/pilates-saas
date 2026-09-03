import { NextRequest, NextResponse } from 'next/server';
import { registrarSociaPublica, actualizarSociaPublica, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { firmaCompleta } from '@/lib/student/consentimiento-regla';

// Operaciones de la propia socia desde el portal/reserva. SEGURIDAD: todas
// exigen sesión real de socia (JWT de Supabase Auth); la identidad se deriva del
// token, no del body. `registrar` es el alta de un walk-in ya autenticado por
// magic link: se crea su ficha vinculada a su usuario de auth.
//
// CORS: el bundle embebible manda ?studioId= en la URL (además del body).
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-socio', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: 'registrar' | 'actualizar';
    studioId?: string;
    id?: string;
    nombre?: string;
    telefono?: string;
    // `origen` NO se acepta del cliente: lo decide el servidor según por dónde
    // entró el alta (ver más abajo). Que el cliente pudiera declararse
    // 'MOSTRADOR' vaciaría de sentido la traza legal.
    aceptacion?: { fecha: string; firma: string; versionTexto: string };
    referidoPor?: string | null;
    origenLead?: string | null;
    cambios?: Record<string, unknown>;
  } | null;

  if (!body?.studioId) return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));

  const user = await verificarUsuarioSupabase(req);
  if (!user) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));

  try {
    // Alta de walk-in: autenticado por magic link pero aún sin ficha de socia.
    // El email lo pone el JWT (no el body) y se vincula auth_user_id.
    if (body.accion === 'registrar') {
      if (!body.id || !body.nombre) {
        return conCorsWidget(req, NextResponse.json({ error: 'Faltan datos de la socia' }, { status: 400 }));
      }

      // ⚠️ TRAZA LEGAL. `socios.aceptacion_origen` tiene un CHECK
      // ('PORTAL','MOSTRADOR') puesto por la migración 0109 citando el art. 7.1
      // del RGPD: hay que poder demostrar quién consintió y por qué vía. Esta
      // ruta escribía fecha, firma y versión pero dejaba el origen a NULL.
      //
      // El origen lo fija el SERVIDOR, nunca el cliente: un alta que llega por
      // aquí es autoservicio de la propia alumna, así que es 'PORTAL'. El otro
      // valor, 'MOSTRADOR', solo lo escribe el panel, donde además se anota
      // `aceptacion_por` (quién del estudio la introdujo). Si el cliente
      // pudiera elegirlo, una firma remota sería indistinguible de una
      // presencial y la traza no probaría nada.
      // Y si no viene la firma, el alta NO se hace. Sin fecha, firma y versión
      // la fila nace con `aceptacion_origen` a NULL — exactamente el estado que
      // la migración 0109 existe para eliminar—, y una traza a medias no prueba
      // nada. Es fail-closed a propósito: los tres llamantes vivos (el portal,
      // /reservar y el widget) ya la mandan, así que esto no cierra ningún
      // camino real; lo que impide es crear socias sin consentimiento probable.
      const ac = body.aceptacion;
      if (!firmaCompleta(ac)) {
        return conCorsWidget(req, NextResponse.json(
          { error: 'Falta la aceptación del contrato (fecha, firma y versión)' }, { status: 400 }));
      }
      const aceptacion = { ...ac, origen: 'PORTAL' as const };

      // El tope de socias del plan lo comprueba `registrarSociaPublica`, pegado
      // al insert y DESPUÉS de su salida temprana por idempotencia. Aquí corría
      // antes, así que un reintento de una socia que ya existía se llevaba el
      // bloqueo sin ir a crear nada.
      const r = await registrarSociaPublica({
        studioId: body.studioId, id: body.id, nombre: body.nombre, email: user.email,
        telefono: body.telefono, authUserId: user.userId, aceptacion, referidoPor: body.referidoPor ?? null,
        origenLead: body.origenLead ?? null,
      });
      if ('error' in r) {
        // 403 para el tope de plan (lo distingue el portal), 400 para el resto.
        const status = 'code' in r && r.code === 'LIMITE_SOCIAS' ? 403 : 400;
        return conCorsWidget(req, NextResponse.json(r, { status }));
      }
      return conCorsWidget(req, NextResponse.json(r));
    }

    // Acciones sobre una socia ya existente: su id sale del token, no del body.
    const socioId = await socioAutenticado(user.userId, body.studioId);
    if (!socioId) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));
    const common = { studioId: body.studioId, socioId, authUserId: user.userId, cambios: body.cambios ?? {} };

    if (body.accion === 'actualizar') {
      const r = await actualizarSociaPublica(common);
      if ('error' in r) return conCorsWidget(req, NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 }));
      return conCorsWidget(req, NextResponse.json(r));
    }
    return conCorsWidget(req, NextResponse.json({ error: 'Acción no válida' }, { status: 400 }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/socio:POST', err, 'No se ha podido procesar la operación.'));
  }
}
