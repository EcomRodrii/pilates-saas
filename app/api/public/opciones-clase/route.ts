import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { retryAfterSeconds, tooManyRequestsResponse } from '@/lib/rate-limit-core';
import { usuarioSupabaseConPaso } from '@/lib/auth-server';
import { CODIGO_SEGUNDO_PASO } from '@/lib/auth/doble-factor-reglas';
import { comprobarPlazaAntesDeCobrar, comprobarVentanaReserva, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { comprobarModoStripe, comprobarParDeClaves } from '@/lib/billing/modo-stripe';
import { bloqueoPorPreguntasAlta } from '@/lib/db/preguntas-alta-admin';
import { opcionDePrueba, opcionesDeClase } from '@/lib/reservar/opciones-de-clase';
import { pruebaCubreTipo, pruebaParaSocia } from '@/lib/billing/clase-prueba';
import { hidratarTiposDePlanes, mapPlanTarifa } from '@/lib/supabase-data';
import type { RowPlanesTarifa } from '@/lib/db-types';
import { errorInterno } from '@/lib/errores-servidor';

// ─────────────────────────────────────────────────────────────────────────────
// Las opciones para venir a UNA clase, dichas por el SERVIDOR (P06 · Fase A,
// 6-oct-2026). SOLO LECTURA: no crea nada, no reserva nada, no cobra nada.
//
// Antes de enseñar «Pagar y reservar», la hoja de la app pregunta aquí:
//   · si el estudio puede cobrar online (Stripe conectado, modo correcto,
//     suscripción a Tentare al día);
//   · si le faltan las preguntas del estudio (se le abren antes de nada de pago);
//   · si ya tiene un pago de esta clase en marcha (entonces no se le ofrece pagar:
//     se confirma ese);
//   · si hay plaza PARA ELLA, con la misma regla que el cobro
//     (`comprobarPlazaAntesDeCobrar`): llena, ya cubierta, impago, topes…;
//   · y las 2-3 formas de venir con su precio (`opcionesDeClase`, la MISMA regla
//     con que cobra `checkout-embebido`).
// La decisión de cobrar sigue en el cobro: esto solo evita ofrecer un pago que el
// servidor va a rechazar.
// ─────────────────────────────────────────────────────────────────────────────

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'opciones-clase', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string; sesionId?: string; spotId?: string | null } | null;
  if (!body?.studioId || !body.sesionId) return json({ error: 'Falta la clase' }, 400);
  const studioId = body.studioId;
  const sesionId = body.sesionId;

  const r = await usuarioSupabaseConPaso(req);
  if (!r) return json({ error: 'Tu sesión ha caducado. Vuelve a entrar: no se te ha cobrado nada.' }, 401);
  if (r.paso === 'doble_factor') return json({ error: 'Falta el segundo paso de la verificación', codigo: CODIGO_SEGUNDO_PASO }, 401);
  const socioId = await socioAutenticado(r.usuario.userId, studioId);
  if (!socioId) return json({ error: 'No autorizado' }, 403);
  const porSocia = { max: 20, windowSeconds: 60 };
  const lim = await rateLimit(`opciones-clase-socia:${socioId}`, porSocia);
  if (!lim.allowed) return tooManyRequestsResponse(retryAfterSeconds(lim.resetAt, porSocia.windowSeconds));

  const cerrada = await paginaCerradaParaPeticion(req, studioId);
  if (cerrada) return cerrada;

  const admin = getSupabaseAdmin();
  if (!admin) return json({ error: 'Servidor no configurado' }, 503);

  try {
    // ¿Se puede pagar aquí? Lo mismo que miran las puertas de cobro antes de crear nada.
    const key = process.env.STRIPE_SECRET_KEY;
    const [{ data: studio }, bloqueoSuscripcion] = await Promise.all([
      admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle(),
      bloqueoPorSuscripcion(studioId),
    ]);
    const pagosOnline = !!key && !key.startsWith('sk_test_XXXX') && comprobarModoStripe().puedeCobrar && comprobarParDeClaves().ok
      && !!studio?.stripe_account_id && !bloqueoSuscripcion;

    if (await bloqueoPorPreguntasAlta(studioId, socioId, 'comprar')) {
      return json({ pagosOnline, bloqueo: 'faltan-preguntas', opciones: [] });
    }

    // Ya ha pagado esta clase y se está confirmando: ni otra opción de pago.
    const { data: enCurso } = await admin.from('pagos_clase').select('payment_intent_id')
      .eq('studio_id', studioId).eq('pagador', socioId).eq('sesion_id', sesionId).eq('estado', 'PAGADO').limit(1);
    const piEnCurso = (enCurso?.[0]?.payment_intent_id as string | null | undefined) ?? null;
    if (piEnCurso) return json({ pagosOnline, pagoEnCurso: { pi: piEnCurso }, opciones: [] });

    const { data: ses } = await admin.from('sesiones').select('inicio, tipo_clase_id, precio_puntual')
      .eq('id', sesionId).eq('studio_id', studioId).maybeSingle();
    if (!ses) return json({ error: 'Esta clase ya no existe.' }, 404);
    const tipoClaseId = (ses.tipo_clase_id as string | null) ?? null;

    // La ventana de reserva y la plaza, con las MISMAS funciones que el cobro.
    const ventana = await comprobarVentanaReserva(admin, { studioId, tipoClaseId, inicioISO: ses.inicio as string });
    const plaza = ventana
      ? { ok: false as const, codigo: ventana.codigo, error: ventana.error, posicionEspera: null }
      : await comprobarPlazaAntesDeCobrar(admin, { studioId, sesionId, socioId, email: null, spotId: body.spotId ?? null });

    const { data: planRows } = await admin.from('planes_tarifa').select('*').eq('studio_id', studioId);
    const planes = await hidratarTiposDePlanes(admin as never, studioId, ((planRows ?? []) as RowPlanesTarifa[]).map(mapPlanTarifa));
    const { opciones, precioEspecial } = opcionesDeClase({
      planes, tipoClaseId, precioPuntualSesion: (ses.precio_puntual as number | null) ?? null,
    });

    // P07: la clase de prueba, PRIMERA, solo si el servidor la considera nueva (`pruebaParaSocia`, el mismo dueño que
    // las puertas de cobro) y si cubre ESTE tipo de clase. La gratis no pasa por Stripe: se ofrece sin pagos online.
    // Con precio especial no se ofrece nada (la clase no se vende en la app).
    const prueba = plaza.ok && !precioEspecial ? await pruebaParaSocia(admin, studioId, socioId) : null;
    const opcionPrueba = prueba && pruebaCubreTipo(prueba, tipoClaseId) && (prueba.gratis || pagosOnline)
      ? [opcionDePrueba(prueba)] : [];

    return json({
      pagosOnline,
      ...(plaza.ok ? { plaza: { ok: true } } : { rechazo: { codigo: plaza.codigo, error: plaza.error, ...(plaza.posicionEspera != null ? { posicionEspera: plaza.posicionEspera } : {}) } }),
      precioEspecial,
      // Sin plaza para ella, no se le ofrece pagar nada.
      opciones: plaza.ok ? [...opcionPrueba, ...(pagosOnline ? opciones : [])] : [],
    });
  } catch (err) {
    return errorInterno('public/opciones-clase:POST', err, 'No hemos podido comprobar la clase. Inténtalo en un momento.');
  }
}
