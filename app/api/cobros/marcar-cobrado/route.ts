import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { confirmarCobro } from '@/lib/billing/confirmar-cobro';
import { facturaIdManual } from '@/lib/billing/cobro-confirmado-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { anotarCobroMarcadoAMano, leerReciboAntesDeCobrar } from '@/lib/auditoria/cobro-manual';
import {
  estadoHttpDeLote, MENSAJE_COBRO_EN_MARCHA_LOTE, parsearPeticionMarcarCobrado, penalizacionesDeLosRecibos, recibosDePenalizacionAnulada,
  resultadoDeConfirmacion, resultadoDeExcepcion, resultadoNoCobrable, resultadoPenalizacionAnulada,
  type ResultadoReciboMarcado,
} from '@/lib/cobros/marcar-cobrado';
import Stripe from 'stripe';
import { motivosParaNoSerRemesa } from '@/lib/billing/remesa-del-recibo';
import {
  MENSAJE_COBRO_EN_EL_DATAFONO, MENSAJE_PAGO_ONLINE_SIN_COMPROBAR, MENSAJE_SE_ABRIO_UN_PAGO, MENSAJE_YA_PAGADO_EN_EL_DATAFONO,
  MENSAJE_YA_PAGADO_ONLINE, cerrarPagoOnlineAntesDeCobrarAMano, soltarCobroDeMostradorAntesDeCobrarAMano, type SesionesDeStripe,
} from '@/lib/billing/pago-online-al-cobrar-a-mano';
import { contextoCobroDe } from '@/lib/pos/terminal';
import { consultarCobroBizum } from '@/lib/pos/consulta-stripe';
import { COLUMNAS_COBRO_EN_MARCHA } from '@/lib/billing/remesa-sepa-reglas';

export const dynamic = 'force-dynamic';
// Hasta 50 recibos en serie, cada uno con su sellado Veri*Factu. El panel manda
// lotes de 10 (`RECIBOS_POR_LOTE_PANEL`); el tope es para quien no lo haga.
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────────────────────
// «Marcar cobrado» del panel (efectivo, tarjeta del datáfono propio, Bizum al
// móvil, transferencia), por el dueño único de «recibo cobrado».
//
// Antes lo escribía el NAVEGADOR: un UPDATE a COBRADO, luego el sellado por
// otra ruta, la renovación del bono con otro UPDATE, los créditos con una RPC y
// el apunte de caja con otra ruta — cinco escrituras que fallaban por separado,
// y en el cobro masivo con la fecha en UTC y el sellado sin esperar. Aquí es un
// compare-and-set y sus efectos en orden (`confirmarCobro`, origen `manual`):
// renovación → factura → caja → créditos. Nunca acepta un EN_CURSO: hay un cargo
// en vuelo y marcarlo a mano encima es la puerta al doble cobro.
//
// Sin email a la socia (`avisarSocia: false`): el justificante lo manda el panel
// cuando quien cobra lo pide (`cobrarYEmail`), igual que antes. Y sin aviso al
// estudio: el cobro a mano nunca lo emitió (`origenNotifica`).
//
// En SERIE a propósito: dos recibos de la misma suscripción cobrados a la vez
// leerían la misma `fecha_fin` y la socia pagaría dos meses por uno.
//
// El estudio sale SIEMPRE de la sesión; el `studio_id` va en el propio UPDATE,
// así que un id de otro estudio es «no encontrado».
//
// Libro de auditoría: esta ruta escribe con service-role, así que el trigger no
// ve quién marcó qué (`auth.uid()` es NULL) y hay que anotarlo aquí, con la sesión
// como actor. Se lee el recibo antes y después, solo de los que de verdad cambian.
// ─────────────────────────────────────────────────────────────────────────────

// Los recibos del lote que NO se cobran por ser de una penalización anulada o
// reembolsada (la guardia del mostrador, trasladada desde el navegador). Lee con
// service-role pero acotado al estudio de la sesión. Sin poder leer, deja cobrar y
// lo registra: ver `recibosDePenalizacionAnulada`.
async function bloqueadosPorPenalizacion(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, studioId: string, reciboIds: string[],
): Promise<Set<string>> {
  const penalizacionIds = penalizacionesDeLosRecibos(reciboIds);
  let estados: Map<string, string> | null = new Map();
  if (penalizacionIds.length > 0) {
    try {
      const { data, error } = await admin.from('penalizaciones').select('id, estado')
        .eq('studio_id', studioId).in('id', penalizacionIds);
      if (error) estados = null;
      else for (const fila of data ?? []) estados.set(fila.id as string, fila.estado as string);
    } catch {
      estados = null;
    }
  }
  const { bloqueados, sinComprobar } = recibosDePenalizacionAnulada(reciboIds, estados);
  if (sinComprobar.length > 0) {
    Sentry.captureMessage('[penalizaciones] cobro en mostrador sin poder comprobar la penalización', {
      level: 'warning',
      tags: { area: 'cobros', tipo: 'penalizacion-mostrador' },
      extra: { reciboIds: sinComprobar, studioId },
    });
  }
  return bloqueados;
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede registrar cobros' }, { status: 403 });
  }

  // Solo dinero, tope de 50 por petición y compare-and-set idempotente: esto no
  // protege un cobro doble sino un bucle de reintentos (o una sesión robada) lanzando
  // cientos de lotes. El cobro masivo del panel manda 10 por petición.
  const limitado = await enforceRateLimit(req, 'cobros-marcar-cobrado', { max: 60, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const cuerpo = await req.json().catch(() => null);
  const parseo = parsearPeticionMarcarCobrado(cuerpo);
  if (!parseo.ok) return NextResponse.json({ error: parseo.error }, { status: 400 });
  const { peticion } = parseo;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // El recibo de ANTES, para el libro. En paralelo y con tope de tiempo cada lectura;
  // mejor esfuerzo: sin él el cobro sigue y la entrada sale sin el valor anterior.
  const antes = new Map(await Promise.all(
    peticion.reciboIds.map(async id => [id, await leerReciboAntesDeCobrar(admin, sesion.studioId, id)] as const),
  ));

  // «El banco lo ha cobrado»: el cierre de una remesa (origen `banco`, solo
  // EN_CURSO y sin ningún cobro de Stripe en marcha). El método es el adeudo.
  // Y solo lo que pudo salir en una remesa: un EN_CURSO de un «Reintentar» del
  // panel de antes, o de una remesa cuyo fichero falló, no lo cobró ningún banco.
  const porElBanco = peticion.canal === 'banco';
  const remesa = porElBanco ? await motivosParaNoSerRemesa(admin, sesion.studioId, peticion.reciboIds) : null;
  // En un cobro de varios, lo que tiene un cobro en marcha no se cobra (y el
  // propio UPDATE lo vuelve a exigir, por si cambia entre medias).
  const conCobroEnMarcha = new Set<string>();
  let sinLeerCobrosEnMarcha = false;
  if (peticion.lote && !porElBanco) {
    const { data, error: errEnMarcha } = await admin.from('recibos').select(`id, ${COLUMNAS_COBRO_EN_MARCHA.join(', ')}`)
      .eq('studio_id', sesion.studioId).in('id', peticion.reciboIds);
    sinLeerCobrosEnMarcha = !!errEnMarcha;
    for (const fila of (data ?? []) as unknown as Record<string, unknown>[]) {
      if (COLUMNAS_COBRO_EN_MARCHA.some(col => col !== 'stripe_payment_intent_id' && !!fila[col])) conCobroEnMarcha.add(fila.id as string);
    }
  }
  // Uno a uno en el mostrador (también «Cobrar X €» de la ficha): antes de cobrar cada
  // recibo se mira, en ese momento, si tiene un pago en marcha. Un enlace de pago
  // abierto se CIERRA en Stripe (que la clienta no pueda pagarlo también online), y un
  // cobro del datáfono o Bizum abandonado se cancela y se suelta; si ya se pagó o sigue
  // en curso, no se cobra. El lote ya deja fuera ambos; el banco no cobra en el mostrador.
  const unoAUno = !peticion.lote && !porElBanco;
  // Stripe del estudio, preparado una vez y solo si hace falta, con el mismo guardia de
  // modo que el resto de cobros (`contextoCobroDe`) y tiempos cortos: la pantalla espera.
  let stripeDelEstudio: { stripe: Stripe; cuenta: string } | null | undefined;
  const prepararStripe = async () => {
    if (stripeDelEstudio !== undefined) return stripeDelEstudio;
    const c = await contextoCobroDe(admin, sesion.studioId);
    if (!c.ok) {
      Sentry.captureMessage('[cobros] cobro a mano con un pago en marcha y sin Stripe para comprobarlo', {
        level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { studioId: sesion.studioId, motivo: c.motivo },
      });
      stripeDelEstudio = null;
    } else {
      stripeDelEstudio = {
        stripe: new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2026-06-24.dahlia', timeout: 5_000, maxNetworkRetries: 1 }),
        cuenta: c.ctx.stripeAccount,
      };
    }
    return stripeDelEstudio;
  };

  const resultados: ResultadoReciboMarcado[] = [];
  for (const reciboId of peticion.reciboIds) {
    if (remesa && !remesa.ok) {
      resultados.push(resultadoNoCobrable(reciboId, 'No se ha podido comprobar si salió en una remesa. Inténtalo otra vez.'));
      continue;
    }
    if (sinLeerCobrosEnMarcha) {
      resultados.push(resultadoNoCobrable(reciboId, 'No se ha podido comprobar si tiene un cobro en marcha. Inténtalo otra vez.'));
      continue;
    }
    const motivo = remesa?.ok ? remesa.motivoPorRecibo.get(reciboId) : null;
    if (motivo) {
      resultados.push(resultadoNoCobrable(reciboId, motivo));
      continue;
    }
    if (conCobroEnMarcha.has(reciboId)) {
      resultados.push(resultadoNoCobrable(reciboId, MENSAJE_COBRO_EN_MARCHA_LOTE));
      continue;
    }
    // La guardia de penalizaciones se lee JUSTO antes de cobrar cada recibo, no una vez al
    // principio: el lote va en serie (hasta ~20 s) y una penalización que alguien anula en
    // mitad no puede cobrarse con la lectura vieja. Solo lee para los `rec-penaliz-*`.
    // Lo que ya cobró el banco no se frena: el dinero ha entrado, y bloquearlo lo
    // dejaría sin registrar.
    if (!porElBanco && penalizacionesDeLosRecibos([reciboId]).length > 0
      && (await bloqueadosPorPenalizacion(admin, sesion.studioId, [reciboId])).has(reciboId)) {
      resultados.push(resultadoPenalizacionAnulada(reciboId));
      continue;
    }
    // Después de la guardia de penalizaciones: no se cierra el enlace de la clienta para
    // luego no cobrar. Leído AQUÍ, justo antes de cobrar este recibo (no al principio del
    // lote: en serie tarda segundos y la clienta puede abrir un pago entre medias), y lo
    // leído viaja al compare-and-set, que no cobra si la columna cambió.
    let checkoutLeido: string | null | undefined;
    if (unoAUno) {
      const { data: fila, error: errFila } = await admin.from('recibos')
        .select('checkout_session_id, cobro_mostrador_pi, cobro_mostrador_checkout_session_id')
        .eq('id', reciboId).eq('studio_id', sesion.studioId).maybeSingle();
      if (errFila) {
        resultados.push(resultadoNoCobrable(reciboId, 'No se ha podido comprobar si tiene un cobro en marcha. Inténtalo otra vez.'));
        continue;
      }
      const ref = (fila?.cobro_mostrador_pi as string | null) ?? null;
      if (ref) {
        const cs = (fila?.cobro_mostrador_checkout_session_id as string | null) ?? null;
        const s = await prepararStripe();
        const mostrador = await soltarCobroDeMostradorAntesDeCobrarAMano(ref, s && {
          consultar: async () => (await consultarCobroBizum(s.stripe, ref, s.cuenta)).estado,
          // Solo ESTE cobro: nada de cancelar la acción del lector, que podría estar
          // cobrando otra venta en ese momento.
          cancelar: async () => {
            try {
              if (cs || ref.startsWith('cs_')) await s.stripe.checkout.sessions.expire(cs ?? ref, undefined, { stripeAccount: s.cuenta });
              else await s.stripe.paymentIntents.cancel(ref, {}, { stripeAccount: s.cuenta });
            } catch { /* lo dirá la siguiente consulta */ }
          },
          soltar: async () => {
            const { data, error } = await admin.from('recibos')
              .update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
              .eq('id', reciboId).eq('studio_id', sesion.studioId).eq('cobro_mostrador_pi', ref).select('id');
            return !error && (data?.length ?? 0) > 0;
          },
        });
        if (mostrador.tipo === 'YA_PAGADO') {
          Sentry.captureMessage('[cobros] cobro a mano sobre un cobro del mostrador ya pagado', {
            level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { reciboId, studioId: sesion.studioId, referencia: ref },
          });
          resultados.push(resultadoNoCobrable(reciboId, MENSAJE_YA_PAGADO_EN_EL_DATAFONO));
          continue;
        }
        if (mostrador.tipo === 'EN_MARCHA') {
          resultados.push(resultadoNoCobrable(reciboId, MENSAJE_COBRO_EN_EL_DATAFONO));
          continue;
        }
      }
      checkoutLeido = (fila?.checkout_session_id as string | null) ?? null;
      if (checkoutLeido) {
        const s = await prepararStripe();
        const sesiones: SesionesDeStripe | null = s && {
          consultar: id => s.stripe.checkout.sessions.retrieve(id, undefined, { stripeAccount: s.cuenta }),
          cerrar: id => s.stripe.checkout.sessions.expire(id, undefined, { stripeAccount: s.cuenta }),
        };
        const online = await cerrarPagoOnlineAntesDeCobrarAMano(checkoutLeido, sesiones);
        if (online.tipo === 'YA_PAGADO') {
          // Si el webhook rechazó esa sesión (otro importe, otra cuenta), el recibo no se
          // cerraría solo: que alguien lo vea.
          Sentry.captureMessage('[cobros] cobro a mano sobre un enlace de pago ya pagado', {
            level: 'warning', tags: { area: 'cobros', tipo: 'marcar-cobrado' }, extra: { reciboId, studioId: sesion.studioId, sesionId: checkoutLeido },
          });
          resultados.push(resultadoNoCobrable(reciboId, MENSAJE_YA_PAGADO_ONLINE));
          continue;
        }
        if (online.tipo === 'NO_SE_SABE') {
          resultados.push(resultadoNoCobrable(reciboId, MENSAJE_PAGO_ONLINE_SIN_COMPROBAR));
          continue;
        }
      }
    }
    try {
      const r = await confirmarCobro(admin, {
        studioId: sesion.studioId,
        reciboId,
        metodo: porElBanco ? 'SEPA' : peticion.metodo,
        origen: porElBanco ? 'banco' : 'manual',
        sinCobroEnMarcha: peticion.lote && !porElBanco,
        sinCobroDeMostrador: unoAUno,
        ...(unoAUno ? { checkoutLeido: checkoutLeido ?? null } : {}),
        conFactura: peticion.conFactura,
        paymentIntentId: null,
        avisarSocia: false,
        facturaId: facturaIdManual(reciboId),
        actor: { userId: sesion.userId, nombre: sesion.nombre },
      });
      if (!r.ok && r.codigo === 'PERSISTENCIA') {
        // La pantalla solo ve «no se ha podido guardar»: sin esto el motivo real
        // (el error de la base de datos) no llegaba a ningún sitio.
        Sentry.captureMessage('[cobros] marcar cobrado: no se pudo escribir el cobro', {
          level: 'error', tags: { area: 'cobros', tipo: 'marcar-cobrado' },
          extra: { reciboId, studioId: sesion.studioId, error: r.error },
        });
      }
      // El compare-and-set no cobró porque entre la lectura y el cobro se abrió un pago
      // (enlace o datáfono): se dice así, no «no admite este cobro».
      if (unoAUno && !r.ok && r.codigo === 'NO_COBRABLE' && r.estado === 'PENDIENTE') {
        resultados.push(resultadoNoCobrable(reciboId, MENSAJE_SE_ABRIO_UN_PAGO));
        continue;
      }
      resultados.push(resultadoDeConfirmacion(reciboId, r));
    } catch (e) {
      // `confirmarCobro` no lanza por diseño; si lo hiciera, este recibo queda
      // en «error» (la pantalla no lo da por cobrado) y el lote sigue.
      Sentry.captureException(e instanceof Error ? e : new Error('Excepción marcando un cobro a mano'), {
        tags: { area: 'cobros', tipo: 'marcar-cobrado' },
        extra: { reciboId, studioId: sesion.studioId },
      });
      resultados.push(resultadoDeExcepcion(reciboId));
    }
  }

  // Al libro, solo lo que ESTA petición cambió (`aplicada`): un `ya_estaba` no
  // cambió nada. Después de todos los cobros y antes de responder; nunca lanza.
  await Promise.all(resultados.filter(r => r.resultado === 'aplicada').map(r =>
    anotarCobroMarcadoAMano(admin, { sesion, reciboId: r.reciboId, antes: antes.get(r.reciboId) ?? null, porElBanco }),
  ));

  return NextResponse.json({ resultados }, { status: estadoHttpDeLote(resultados) });
}
