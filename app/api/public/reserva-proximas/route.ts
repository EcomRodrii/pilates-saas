import { NextRequest, NextResponse } from 'next/server';
import { reservarProximasPublico, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { bloqueoPorPreguntasAlta } from '@/lib/db/preguntas-alta-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { bloqueoPorSuspension } from '@/lib/billing/billing-guard';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';
import { accionesDeRechazo } from '@/lib/student/reserva-acciones';
import { normalizarIntento, normalizarN } from '@/lib/reservas/proximas-reglas';

// «Reservar las próximas N clases» con bono (autoreservable): hasta 12 reservas normales de una vez, una por clase del mismo
// horario. Va APARTE de `/api/public/reserva` (que es de uno en uno y lleva CORS de widget): un lote no tiene motivo para
// salir fuera de la app de la alumna.
//
// SEGURIDAD: igual que la reserva suelta, exige sesión real de socia (JWT) y deriva su id del token verificado, nunca del body.
// Cada reserva pasa por `crearReservaPublica` → `reservar_plaza`, así que hereda TODAS sus reglas (derecho, aforo, ventanas,
// máximo a la vez y al día, preguntas, impago); este endpoint solo recorre las clases, y el bono lo descuenta la base de datos.
//
// 12 reservas en serie (cada una: elegibilidad + reserva + efectos) caben de sobra en 60 s.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // Un lote cuesta ~12 reservas: límite propio y más corto que el de la reserva suelta.
  const limited = await enforceRateLimit(req, 'public-reserva-proximas', { max: 6, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: unknown; studioId?: unknown; sesionId?: unknown; n?: unknown; intentoId?: unknown;
  } | null;

  const studioId = typeof body?.studioId === 'string' && body.studioId ? body.studioId : null;
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const accion = body?.accion === 'previsualizar' || body?.accion === 'reservar' ? body.accion : null;
  if (!accion) return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  const sesionId = typeof body?.sesionId === 'string' && body.sesionId ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });
  const n = normalizarN(body?.n);
  if (n === null) return NextResponse.json({ error: 'Elige entre 2 y 12 clases.' }, { status: 400 });
  // El intento SOLO para reservar: es lo que hace que un reintento no duplique nada.
  const intentoId = accion === 'reservar' ? normalizarIntento(body?.intentoId) : undefined;
  if (accion === 'reservar' && !intentoId) return NextResponse.json({ error: 'Falta el intento' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    // Mismas puertas que reservar una clase (y, como ella, solo al RESERVAR: mirar qué se reservaría no escribe nada).
    if (accion === 'reservar') {
      const cerrada = await paginaCerradaParaPeticion(req, studioId);
      if (cerrada) return cerrada;
      const bloqueo = await bloqueoPorSuspension(studioId);
      if (bloqueo) return bloqueo;
      const sinPreguntas = await bloqueoPorPreguntasAlta(studioId, socioId, 'reservar');
      if (sinPreguntas) return sinPreguntas;
    }
    const r = await reservarProximasPublico({
      studioId, socioId, authUserId: user.userId, sesionId, n, accion, intentoId: intentoId ?? undefined,
    });
    if ('error' in r) {
      // El rechazo lleva el CÓDIGO (por qué) y las ACCIONES (qué puede hacer), como la reserva suelta.
      return NextResponse.json({ error: r.error, codigo: r.codigo, acciones: accionesDeRechazo(r.codigo) }, { status: r.status });
    }
    return NextResponse.json(r);
  } catch (err) {
    return errorInterno('public/reserva-proximas:POST', err, 'No se han podido reservar las clases.');
  }
}
