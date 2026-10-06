import { NextRequest, NextResponse, after } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { asistenteEncendido } from '@/lib/asistente/servidor';
import { confirmarAccion } from '@/lib/asistente/acciones/ejecutar';
import { avisarPostComunidad } from '@/lib/comunidad/avisar-post';

// POST /api/asistente/acciones/confirmar — la persona pulsa «Confirmar» en la
// tarjeta y SOLO ahora se crea algo. No llama al modelo ni gasta consulta.
//
// El cuerpo trae solo el `id` de la propuesta: lo que se ejecuta es el payload
// que el servidor guardó al proponerla, nunca nada del navegador. Estudio y
// persona salen de la sesión: una propuesta ajena, de otro estudio o inexistente
// responde igual (404), sin oráculo. Idempotente: doble clic, reintento de red o
// dos pestañas = una sola creación (lib/asistente/acciones/ejecutar.ts).

export const runtime = 'nodejs';
export const maxDuration = 30;

const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return json({ error: 'No autorizado' }, 401);
  if (!puedeUsarAsistente(sesionStaff.rol)) return json({ error: 'No tienes permiso para esto', codigo: 'SIN_PERMISO' }, 403);
  if (!asistenteEncendido(sesionStaff.studioId)) return json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, 404);
  const [bloqueo, rafaga, body] = await Promise.all([
    bloqueoPorFeature(sesionStaff.studioId, 'asistente'),
    enforceRateLimit(req, 'asistente-confirmar', { max: 20, windowSeconds: 60 }, sesionStaff.userId),
    req.json().catch(() => null),
  ]);
  if (bloqueo) return bloqueo;
  if (rafaga) return rafaga;
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !UUID.test(id)) return json({ error: 'Propuesta no válida' }, 400);
  const admin = getSupabaseAdmin();
  if (!admin) return json({ error: 'Servidor no configurado', codigo: 'NO_DISPONIBLE' }, 503);

  const sesion = { studioId: sesionStaff.studioId, userId: sesionStaff.userId, rol: sesionStaff.rol, nombre: sesionStaff.nombre };
  try {
    const r = await confirmarAccion(admin, sesion, id, {
      ahora: new Date(),
      despues: f => after(f),
      avisarEvento: (postId, texto, s) => avisarPostComunidad({ studioId: s.studioId, postId, autorNombre: s.nombre, texto, audiencia: 'TODAS' }),
    });
    // Ids y códigos, nunca el contenido.
    console.info('[asistente] acción', JSON.stringify({ studioId: sesion.studioId, userId: sesion.userId, rol: sesion.rol, accionId: id, ok: r.ok, codigo: r.ok ? (r.yaCreada ? 'YA_CREADA' : 'OK') : r.codigo }));
    if (r.ok) return json({ estado: r.estado, resultado: r.resultado, yaCreada: r.yaCreada }, 200);
    return json({ error: r.error, codigo: r.codigo }, r.status);
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'asistente-acciones' }, extra: { accionId: id } });
    return json({ error: 'No he podido crearla ahora y no se ha creado nada. Puedes volver a intentarlo.', codigo: 'ERROR' }, 500);
  }
}
