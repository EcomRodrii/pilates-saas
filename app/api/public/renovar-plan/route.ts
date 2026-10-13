import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { cobroDeReciboEnServidor } from '@/lib/billing/cobro-recibo-alumna-servidor';
import { hoyEnEstudio } from '@/lib/utils';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { esReciboCobrable } from '@/lib/billing/deuda-recibo';
import { paginaCerradaParaPeticion } from '@/lib/publico/pagina-cerrada-peticion';
import {
  CODIGO_RENOVACION_COBRANDOSE, elegirSuscripcionARenovar, MENSAJE_RENOVACION_COBRANDOSE, planSeRenueva,
  reciboPrevioDeRenovacion, renovacionPorLaAlumna, renovacionQuePagaElla,
} from '@/lib/billing/renovar-plan-reglas';

// "Renovar en un toque" desde el portal: garantiza que exista el recibo de
// renovación del plan de la socia y devuelve su id — el portal lo paga acto
// seguido con el checkout de recibos que ya usa para los pendientes. Exige
// sesión real de socia (JWT verificado); su suscripción se resuelve en
// servidor, nunca del body.
//
// Id determinista por (suscripción, mes) — la MISMA convención que el cron de
// renovaciones (lib/inngest/renovaciones.ts): si el cron ya lo generó esta
// mañana, el insert choca por PK y se reutiliza; si lo genera él después, es
// este el que encuentra por dedupe.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-renovar-plan', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  // `suscripcionId` (RECIBOS · 6-oct-2026): la app dice QUÉ plan renueva. Solo vale
  // uno suyo y de los que la regla admite (`elegirSuscripcionARenovar`).
  const body = await req.json().catch(() => null) as { studioId?: string; suscripcionId?: string | null } | null;
  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Renovar es COMPRAR otro ciclo: crea el recibo que se paga a continuación.
  // La app de la alumna enseña el aviso sin pase (app/portal/[slug]/layout.tsx),
  // y esta puerta sigue su mismo criterio.
  const cerrada = await paginaCerradaParaPeticion(req, body.studioId);
  if (cerrada) return cerrada;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    // Suscripción de la socia: la ACTIVA, o la más reciente si ninguna lo está.
    const { data: susRows, error: susErr } = await admin
      .from('suscripciones')
      .select('id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes')
      .eq('studio_id', body.studioId)
      .eq('socio_id', socioId)
      .order('fecha_inicio', { ascending: false });
    if (susErr) throw new Error(susErr.message);
    const elegida = elegirSuscripcionARenovar(
      (susRows ?? []) as Array<{ id: string; estado: string | null; plan_id: string | null; fecha_fin: string | null }>,
      typeof body.suscripcionId === 'string' ? body.suscripcionId : null,
    );
    if (!elegida.ok) {
      return NextResponse.json({ error: elegida.error, ...(elegida.codigo ? { codigo: elegida.codigo } : {}) }, { status: elegida.status });
    }
    const sus = elegida.sus;

    // ¿Lo puede renovar ELLA? (lib/billing/renovar-plan-reglas.ts). Renovar deja la
    // suscripción ACTIVA al cobrarse: una cuota en PAUSADA no se renueva desde la
    // app (la descongelaría sin que el estudio lo decidiera) — decisión del
    // fundador, 5-oct-2026. Va ANTES de reutilizar un recibo pendiente: uno que
    // ya existiera para esa cuota tampoco se le entrega para pagar. Renovar sola
    // una cuota CANCELADA (también por impago) lo elige el estudio
    // (`renovar_sola_cuota_cancelada`, por defecto sí, como hasta ahora).
    let renovarSolaCuotaCancelada = true;
    if (sus.estado === 'CANCELADA') {
      const { data: politica, error: polErr } = await admin
        .from('studios').select('renovar_sola_cuota_cancelada').eq('id', body.studioId).maybeSingle();
      if (polErr) throw new Error(polErr.message);
      renovarSolaCuotaCancelada = politica?.renovar_sola_cuota_cancelada !== false;
    }
    const puede = renovacionPorLaAlumna(sus.estado as string | null, { renovarSolaCuotaCancelada });
    if (!puede.ok) {
      return NextResponse.json({ error: puede.error, codigo: puede.codigo }, { status: 409 });
    }

    const { data: plan, error: planErr } = await admin
      .from('planes_tarifa')
      .select('id, nombre, precio, tipo, es_prueba, activo')
      .eq('id', sus.plan_id as string)
      .eq('studio_id', body.studioId)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan) return NextResponse.json({ error: 'Tu plan ya no existe. Habla con tu estudio.' }, { status: 404 });
    // La clase de prueba es de una sola vez (lib/billing/clase-prueba.ts):
    // renovarla la volvería a vender, a precio de prueba, a quien ya la usó.
    if (plan.es_prueba === true) {
      return NextResponse.json(
        { error: 'La clase de prueba no se renueva. Mira los planes de tu estudio para seguir viniendo.' },
        { status: 409 },
      );
    }

    // Un plan que el estudio ya no vende no se le vuelve a vender a quien ya lo dejó.
    const seRenueva = planSeRenueva(sus.estado, plan as { activo?: boolean | null });
    if (!seRenueva.ok) return NextResponse.json({ error: seRenueva.error, codigo: seRenueva.codigo }, { status: 409 });

    // Si ya hay un recibo DE RENOVACIÓN en juego, se reutiliza (el portal lo
    // paga): puede venir del cron, del panel o de un toque anterior. Solo uno de
    // renovación y cobrable (`reciboPrevioDeRenovacion`): antes se le daba cualquier
    // PENDIENTE o EN_CURSO de la suscripción, también uno que estaba en el banco.
    const { data: previos, error: penErr } = await admin
      .from('recibos')
      .select('id, estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, es_renovacion, cobro_off_session_clave')
      .eq('studio_id', body.studioId)
      .eq('suscripcion_id', sus.id)
      .eq('es_renovacion', true)
      .in('estado', ['PENDIENTE', 'EN_CURSO', 'FALLIDO', 'DEVUELTO'])
      .order('fecha_vencimiento', { ascending: false })
      .limit(10);
    if (penErr) throw new Error(penErr.message);
    const decisiones = (previos ?? []).map((r) => ({ id: r.id as string, que: reciboPrevioDeRenovacion(r as Parameters<typeof reciboPrevioDeRenovacion>[0]) }));
    if (decisiones.some((d) => d.que === 'cobrandose')) {
      return NextResponse.json({ error: MENSAJE_RENOVACION_COBRANDOSE, codigo: CODIGO_RENOVACION_COBRANDOSE }, { status: 409 });
    }
    const reutilizable = decisiones.find((d) => d.que === 'reutilizar');
    // ⚠️ Reutilizarla es dársela a pagar con tarjeta: solo si le toca pagarla a ELLA, con la MISMA regla con la que su
    // app decide qué ofrecer (`lib/billing/cobro-recibo-alumna.ts`). Si va en la remesa, la cobra su tarjeta guardada con
    // el reintento programado o se está cobrando, 409 y no se crea nada (otro recibo del mismo ciclo sería el doble cobro).
    if (reutilizable) return await respuestaReutilizar(admin, body.studioId, reutilizable.id);

    // Hora del estudio, no UTC: el id lleva el MES, y entre las 00:00 y las 02:00 del día 1 en Madrid el día UTC aún es el
    // del mes anterior (el recibo nacería con el id del mes pasado y chocaría con el que el cron ya creó).
    const hoy = hoyEnEstudio();
    // ⚠️ 26ª pasada. El id determinista POR MES viene de `lib/inngest/
    // renovaciones.ts`: se elige así a propósito para que CHOQUE por PK con el
    // que generaría el cron y no salgan dos recibos del mismo ciclo. Eso es
    // correcto para una cuota MENSUAL —un ciclo por mes— y falso para un BONO,
    // que es justo donde el portal enseña el botón «Renovar» (se pinta cuando
    // las sesiones se agotan, app/portal/[slug]/bonos/page.tsx).
    //
    // Una socia que agota su bono de 4 dos veces en el mismo mes: la primera
    // renovación crea y COBRA `rec-renov-…-2026-09`; la segunda no lo ve en el
    // dedupe de arriba (solo mira PENDIENTE/EN_CURSO), choca 23505, y el
    // `insErr.code !== '23505'` lo trataba como éxito devolviendo el id del
    // recibo YA COBRADO — que /api/stripe/checkout rechaza con 409 y la socia
    // lee como una avería. Venta perdida con cara de fallo del sistema.
    //
    // Los ciclos de 3/6/12 meses (`periodicidad_meses`, #1701) caen en meses
    // distintos, así que la convención les sirve igual que a la mensual.
    //
    // ⚠️ El id sigue siendo DETERMINISTA para todos: solo cambia la resolución,
    // de mes a día. La revisión independiente cazó que un sufijo aleatorio
    // arreglaba el caso del bono y rompía algo peor — el dedupe de arriba es un
    // SELECT no atómico, y la PK determinista era la única defensa REAL contra
    // dos peticiones en vuelo (doble toque, re-render). Con un id aleatorio las
    // dos insertan y nacen dos recibos PENDIENTE de la misma renovación; el que
    // se quede sin `checkout_session_id` cumple todos los criterios del cron de
    // adopción y el dunning de las 08:30 le pasa la tarjeta off-session:
    // segundo cobro de algo ya pagado. Justo lo que el filtro
    // `.is('checkout_session_id', null)` de `lib/inngest/renovaciones.ts` existe
    // para impedir, reabierto por otra puerta.
    //
    // Por día: dos toques seguidos siguen chocando por PK (dedupe atómico), y
    // un bono agotado dos veces el MISMO día —el caso raro que queda— cae en el
    // 409 honesto de abajo en vez de mandarla a un checkout que responde 409.
    const cicloEsMensual = plan.tipo === 'MENSUAL';
    const id = cicloEsMensual
      ? `rec-renov-${sus.id}-${hoy.slice(0, 7)}`
      : `rec-renov-${sus.id}-${hoy}`;
    const { error: insErr } = await admin.from('recibos').insert({
      id, studio_id: body.studioId, socio_id: socioId, suscripcion_id: sus.id,
      concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
      // «Renovar en un toque»: renueva un ciclo ya entregado.
      es_renovacion: true,
      fecha_vencimiento: sus.fecha_fin ?? hoy, fecha_cobro: null, fecha_devolucion: null,
      intentos_reintento: 0,
    });
    // 23505: otro camino (cron, doble toque) lo creó en paralelo — se reutiliza.
    // Pero SOLO si de verdad se puede pagar: el que ya estaba ahí puede estar
    // COBRADO (renovación anterior del mismo mes) y devolver su id mandaba a la
    // socia a un checkout que responde 409. Se comprueba con el mismo criterio
    // que usa /api/stripe/checkout para aceptarlo, no con una lista aparte.
    if (insErr) {
      if (insErr.code !== '23505') throw new Error(insErr.message);
      const { data: chocado } = await admin
        .from('recibos')
        .select('estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en')
        .eq('id', id).eq('studio_id', body.studioId).maybeSingle();
      if (!chocado || !esReciboCobrable(chocado as Parameters<typeof esReciboCobrable>[0])) {
        return NextResponse.json(
          { error: 'Ya has renovado este plan. Si necesitas otro, habla con tu estudio.' },
          { status: 409 },
        );
      }
      // El que ya estaba (el cron lo creó en paralelo) también es reutilizar: la misma regla que arriba.
      return await respuestaReutilizar(admin, body.studioId, id);
    }

    return NextResponse.json({ reciboId: id });
  } catch (err) {
    return errorInterno('public/renovar-plan:POST', err, 'No se ha podido preparar la renovación.');
  }
}

/**
 * Devuelve para pagar una renovación que YA existía solo si le toca pagarla a ella. Sin poder saberlo (una lectura
 * fallida), se lanza y contesta el 500 de siempre: con dinero de por medio, no saber no es «págala tú».
 */
async function respuestaReutilizar(admin: SupabaseClient, studioId: string, reciboId: string): Promise<NextResponse> {
  const leido = await cobroDeReciboEnServidor(admin, { studioId, reciboId, hoy: hoyEnEstudio() });
  if (!leido.ok) throw new Error(`no se ha podido saber quién cobra la renovación ${reciboId}`);
  const quien = renovacionQuePagaElla(leido.cobro);
  if (!quien.ok) return NextResponse.json({ error: quien.error, codigo: quien.codigo, cobro: leido.cobro }, { status: 409 });
  return NextResponse.json({ reciboId });
}
