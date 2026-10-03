import type { SupabaseClient } from '@supabase/supabase-js';
import { penalizacionDelRecibo } from './penalizacion-aprobar-reglas.ts';
import { seguirCreditosAlRecibo } from './creditos-recibo-server.ts';
import { registrarAuditoriaServidor, type RegistrarAuditoria } from '../auditoria/registrar-servidor.ts';
import { cobroEntroPorStripe, elBancoPuedeDevolver, TEXTO_NO_LO_DEVUELVE_EL_BANCO } from './devolucion-reglas.ts';
import { COLUMNAS_COBRO_EN_MARCHA } from './remesa-sepa-reglas.ts';
import { esReciboCobrable } from './deuda-recibo.ts';
import { motivosParaNoSerRemesa } from './remesa-del-recibo.ts';
import { hoyEnEstudio } from '../utils.ts';

export { cobroEntroPorStripe };

// «El banco lo devolvió» de Cobros (components/cobros/use-acciones-recibo.tsx): el
// cargo no llegó a quedarse y la clienta VUELVE A DEBER. No es «le he devuelto
// el dinero» —eso es un reembolso y lo lleva lib/billing/reembolso-manual.ts—:
// son hechos opuestos (lib/billing/devolucion-reglas.ts), y un cobro en
// efectivo, por Bizum o por transferencia no lo devuelve ningún banco.
//
// Antes era un UPDATE directo desde el cliente (`dbUpdateRecibo`), y eso dejaba
// fuera lo único que no puede hacer el cliente: si el recibo era el de una
// penalización COBRADA, la penalización se quedaba COBRADA y la liquidación de
// la instructora la seguía imputando con el dinero fuera. Ponerla al día usa
// service-role, así que vive aquí, detrás de `POST /api/cobros/marcar-devuelto`
// (con `puedeMoverDinero`), nunca en el cliente.
//
// Anotar, no mover dinero: no llama a Stripe, no crea fila en `devoluciones` ni
// factura rectificativa. Lo mismo que hacía el UPDATE al que sustituye.
//
// Sin `import 'server-only'` a propósito: se prueba con `node --test`.

/**
 * Desde dónde se puede marcar devuelto. EN_CURSO solo si lo que está en el banco
 * es una remesa, sin ningún cobro de Stripe en vuelo (ese lo cierra su webhook).
 */
export const ESTADOS_QUE_SE_PUEDEN_DEVOLVER = ['PENDIENTE', 'FALLIDO', 'COBRADO', 'EN_CURSO'] as const;

export type ResultadoMarcarDevuelto =
  | { ok: true; fechaDevolucion: string; yaEstaba: boolean }
  | { ok: false; http: 404 | 409 | 500; error: string };

export type SeguirPenalizacion = (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<unknown>;

const seguirPorDefecto: SeguirPenalizacion = async (admin, p) => {
  // Dinámico: ese módulo usa alias `@/`, que `node --test` no resuelve.
  const { seguirPenalizacionAlRecibo } = await import('./penalizacion-recibo-server.ts');
  return seguirPenalizacionAlRecibo(admin, p);
};

export const TEXTO_COBRO_EN_MARCHA =
  'Este recibo tiene un cobro de Stripe en marcha: se cerrará solo cuando Stripe conteste.';

export const TEXTO_RECIBO_CAMBIADO = 'Este recibo acaba de cambiar. Recarga y vuelve a intentarlo.';

export const TEXTO_COBRO_POR_STRIPE =
  'Este cobro entró por Stripe: marcarlo aquí no le devuelve el dinero. Haz el reembolso completo desde Stripe (o desde la ficha de la clienta, si tienes activadas las devoluciones) y el recibo se marcará como devuelto solo.';

export async function marcarReciboDevuelto(
  admin: SupabaseClient,
  /**
   * `actor`: quien pulsó el botón, para el libro de auditoría. Obligatorio: un llamador nuevo que lo olvide no puede dejar el cambio sin dueño.
   * `desde`: el estado que vio quien pulsó. Si ya no es ese, no se toca: una pestaña vieja no puede convertir en deuda un cobro recién confirmado.
   */
  p: { studioId: string; reciboId: string; ahoraISO: string; actor: { userId: string; rol: string }; desde?: string },
  seguir: SeguirPenalizacion = seguirPorDefecto,
  seguirCreditos: SeguirPenalizacion = seguirCreditosAlRecibo,
  registrar: RegistrarAuditoria = registrarAuditoriaServidor,
): Promise<ResultadoMarcarDevuelto> {
  const { data: recibo, error: errLectura } = await admin.from('recibos')
    .select('estado, fecha_devolucion, stripe_payment_intent_id, metodo_cobro, sepa_estado, socio_id, concepto, importe, fecha_vencimiento, proximo_reintento, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, checkout_session_id, cobro_mostrador_pi, cobro_off_session_clave')
    .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
  if (errLectura) return { ok: false, http: 500, error: 'No se ha podido comprobar el recibo.' };
  if (!recibo) return { ok: false, http: 404, error: 'No se encuentra ese recibo.' };

  const estado = recibo.estado as string;
  // `fecha_devolucion` es `date`: el día en el estudio, no el de UTC (a las
  // 00:30 de Madrid quedaba en el día anterior).
  const hoy = hoyEnEstudio(new Date(p.ahoraISO));
  let fechaDevolucion = hoy;
  let yaEstaba = false;

  if (estado === 'DEVUELTO') {
    // Quien pulsó lo veía de otra forma (p. ej. cobrado, y otra pestaña acaba de
    // registrar «Le he devuelto el dinero»): no se le dice que sí, porque la
    // pantalla pintaría una deuda que no existe.
    if (p.desde && p.desde !== 'DEVUELTO') return { ok: false, http: 409, error: TEXTO_RECIBO_CAMBIADO };
    // Doble toque, o ya lo devolvió el webhook: no se reescribe la fecha original.
    yaEstaba = true;
    fechaDevolucion = (recibo.fecha_devolucion as string | null) ?? hoy;
  } else {
    if (p.desde && p.desde !== estado) return { ok: false, http: 409, error: TEXTO_RECIBO_CAMBIADO };
    if (!(ESTADOS_QUE_SE_PUEDEN_DEVOLVER as readonly string[]).includes(estado)) {
      return { ok: false, http: 409, error: 'Este recibo ya no se puede marcar como devuelto.' };
    }
    // Lo que está en el banco solo se da por devuelto si es una remesa: con un
    // cargo de Stripe en vuelo, lo cierra su webhook.
    if (estado === 'EN_CURSO' && COLUMNAS_COBRO_EN_MARCHA.some(col => !!recibo[col])) {
      return { ok: false, http: 409, error: TEXTO_COBRO_EN_MARCHA };
    }
    // Y solo lo que pudo salir en una remesa (lib/billing/remesa-del-recibo.ts).
    if (estado === 'EN_CURSO') {
      const remesa = await motivosParaNoSerRemesa(admin, p.studioId, [p.reciboId]);
      if (!remesa.ok) return { ok: false, http: 500, error: 'No se ha podido comprobar si salió en una remesa.' };
      const motivo = remesa.motivoPorRecibo.get(p.reciboId);
      if (motivo) return { ok: false, http: 409, error: motivo };
    }
    if (estado === 'COBRADO') {
      // ⚠️ Un cobro que entró por Stripe no se «devuelve» anotándolo: el dinero
      // sigue en la cuenta del estudio. Y si después se reembolsa de verdad, el
      // webhook ya lo encuentra DEVUELTO y no hace nada más (`.neq('estado',
      // 'DEVUELTO')` en procesar-reembolso.ts): ni rectificativa ni aviso a la
      // nómina. El reembolso real marca el recibo solo.
      if (cobroEntroPorStripe(recibo)) return { ok: false, http: 409, error: TEXTO_COBRO_POR_STRIPE };
      // Ningún banco devuelve el efectivo, el Bizum ni una transferencia: si ese
      // dinero salió, lo devolvió el estudio (reembolso, no deuda).
      if (!elBancoPuedeDevolver(recibo.metodo_cobro as string | null)) {
        return { ok: false, http: 409, error: TEXTO_NO_LO_DEVUELVE_EL_BANCO };
      }
      if (Number(recibo.importe_devuelto ?? 0) > 0 || recibo.reembolso_stripe_id || recibo.reembolso_solicitado_en) {
        return { ok: false, http: 409, error: 'A este cobro ya se le ha devuelto dinero: revísalo en la ficha de la clienta.' };
      }
      // Una venta de la caja se devuelve desde la caja: si no, la venta y su recibo divergen.
      const { data: venta, error: errVenta } = await admin.from('ventas_pos').select('id')
        .eq('studio_id', p.studioId).eq('recibo_id', p.reciboId).limit(1);
      if (errVenta) return { ok: false, http: 500, error: 'No se ha podido comprobar el recibo.' };
      if (venta && venta.length > 0) return { ok: false, http: 409, error: 'Este cobro es una venta de la caja: devuélvela desde la caja.' };
    }
    // Compare-and-set sobre el estado leído (y, desde el banco, sin cobro en
    // marcha también en el propio UPDATE). `proximo_reintento` a null: un
    // DEVUELTO no lo cobra el dunning, pero si alguien lo vuelve a PENDIENTE con
    // una fecha ya vencida, lo cobraría sin avisar.
    let consulta = admin.from('recibos')
      .update({ estado: 'DEVUELTO', fecha_devolucion: hoy, proximo_reintento: null })
      .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('estado', estado);
    if (estado === 'EN_CURSO') for (const col of COLUMNAS_COBRO_EN_MARCHA) consulta = consulta.is(col, null);
    const { data: tocado, error } = await consulta.select('id').maybeSingle();
    if (error) {
      console.error('[marcar-devuelto] no se pudo marcar el recibo', p.reciboId, error.message);
      return { ok: false, http: 500, error: 'No se ha podido marcar el recibo como devuelto.' };
    }
    if (!tocado) return { ok: false, http: 409, error: TEXTO_RECIBO_CAMBIADO };

    // Solo si ESTA llamada lo cambió (no si ya estaba DEVUELTO: nada que anotar). No lanza:
    // el recibo ya dice la verdad y el libro es fail-open.
    await registrar(admin, {
      sesion: { userId: p.actor.userId, rol: p.actor.rol, studioId: p.studioId },
      tabla: 'recibos', filaId: p.reciboId, operacion: 'UPDATE',
      socioId: (recibo.socio_id as string | null) ?? null,
      antes: { estado, fecha_devolucion: recibo.fecha_devolucion ?? null, proximo_reintento: recibo.proximo_reintento ?? null },
      // `fecha_devolucion` es una columna `date`: se anota el día, que es lo que la base guarda.
      despues: { estado: 'DEVUELTO', fecha_devolucion: hoy, proximo_reintento: null },
      contexto: {
        accion: 'RECIBO_MARCADO_DEVUELTO',
        concepto: recibo.concepto ?? null, fecha_vencimiento: recibo.fecha_vencimiento ?? null,
        importe: typeof recibo.importe === 'number' ? recibo.importe : Number(recibo.importe) || null,
      },
    });
  }

  // ⚠️ SIEMPRE que el recibo esté DEVUELTO, no solo si lo ha devuelto esta
  // llamada: uno marcado devuelto antes de este arreglo tiene aún su penalización
  // COBRADA, y volver a pulsar la pone al día. Repetirlo es seguro (compare-and-set
  // desde COBRADA). Nunca lanza; y si no llega a escribir, lo recoge el barrido
  // horario del cron de penalizaciones. El recibo ya dice la verdad.
  if (penalizacionDelRecibo(p.reciboId)) {
    try {
      await seguir(admin, { studioId: p.studioId, reciboId: p.reciboId });
    } catch (e) {
      console.error('[marcar-devuelto] no se pudo poner al día la penalización del recibo', p.reciboId, e instanceof Error ? e.message : e);
    }
  }

  // Los créditos de «Renovar plan» que diera este recibo se revierten (lo ya
  // gastado queda por compensar). También SIEMPRE que esté DEVUELTO, por el
  // mismo motivo que la penalización; repetir no hace nada. Nunca lanza.
  try {
    await seguirCreditos(admin, { studioId: p.studioId, reciboId: p.reciboId });
  } catch (e) {
    console.error('[marcar-devuelto] no se pudieron poner al día los créditos del recibo', p.reciboId, e instanceof Error ? e.message : e);
  }

  return { ok: true, fechaDevolucion, yaEstaba };
}

export type ResultadoReintentarPorElBanco =
  | { ok: true; intentosReintento: number }
  | { ok: false; http: 404 | 409 | 500; error: string };

/**
 * «Reintentar por el banco»: un recibo que DEVOLVIÓ el banco vuelve a la próxima
 * remesa (PENDIENTE). Antes el panel lo ponía EN_CURSO («Enviado al banco») sin
 * mandar nada a ningún banco: se quedaba ahí para siempre, porque la remesa solo
 * coge PENDIENTE y lo que está EN_CURSO sin cargo no lo cierra nadie.
 *
 * Solo tiene sentido si va a entrar en la remesa: el estudio con los datos de
 * acreedor SEPA y la clienta con un mandato VIGENTE. Si no, «vuelve a la
 * remesa» sería mentira y se dice. Un reembolso (dinero que el estudio devolvió)
 * no se reintenta nunca: mismo criterio que `esReciboCobrable`.
 *
 * Mientras vuelve al banco deja de contar como impago (PENDIENTE no bloquea
 * reservas): lo devuelve otra vez el banco, o lo cobra.
 */
export async function reintentarPorElBanco(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; actor: { userId: string; rol: string } },
  registrar: RegistrarAuditoria = registrarAuditoriaServidor,
): Promise<ResultadoReintentarPorElBanco> {
  const { data: recibo, error } = await admin.from('recibos')
    .select('estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, socio_id, intentos_reintento, concepto')
    .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
  if (error) return { ok: false, http: 500, error: 'No se ha podido comprobar el recibo.' };
  if (!recibo) return { ok: false, http: 404, error: 'No se encuentra ese recibo.' };
  if (recibo.estado !== 'DEVUELTO' || !esReciboCobrable(recibo as Parameters<typeof esReciboCobrable>[0])) {
    return { ok: false, http: 409, error: 'Solo se reintenta por el banco un recibo que devolvió el banco.' };
  }
  const socioId = recibo.socio_id as string | null;
  const [{ data: estudio, error: errEstudio }, { data: mandatos, error: errMandato }] = await Promise.all([
    admin.from('studios').select('sepa_acreedor_id, sepa_iban, sepa_titular').eq('id', p.studioId).maybeSingle(),
    socioId
      ? admin.from('mandatos_sepa').select('id').eq('studio_id', p.studioId).eq('socio_id', socioId).eq('estado', 'VIGENTE').limit(1)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);
  if (errEstudio || errMandato) return { ok: false, http: 500, error: 'No se ha podido comprobar la domiciliación.' };
  if (!estudio?.sepa_acreedor_id || !estudio.sepa_iban || !estudio.sepa_titular) {
    return { ok: false, http: 409, error: 'Para volver a pasarlo por el banco, configura antes las domiciliaciones en Configuración → Cobros y facturas.' };
  }
  if (!mandatos || mandatos.length === 0) {
    return { ok: false, http: 409, error: 'Esta clienta no tiene una domiciliación vigente: no entraría en la remesa. Cóbraselo de otra forma.' };
  }
  const intentos = Number(recibo.intentos_reintento ?? 0) + 1;
  // Compare-and-set: sigue devuelto por el banco, con los mismos intentos y sin
  // reembolso pedido entretanto.
  const { data: tocado, error: errUpdate } = await admin.from('recibos')
    .update({ estado: 'PENDIENTE', intentos_reintento: intentos, proximo_reintento: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('estado', 'DEVUELTO')
    .eq('intentos_reintento', Number(recibo.intentos_reintento ?? 0)).eq('importe_devuelto', 0)
    .is('reembolso_stripe_id', null).is('reembolso_solicitado_en', null)
    .select('id').maybeSingle();
  if (errUpdate) {
    // Ya hay otra renovación viva de esa cuota (índice único): es la que hay que cobrar.
    if ((errUpdate as { code?: string }).code === '23505') {
      return { ok: false, http: 409, error: 'Esta cuota ya tiene otra renovación pendiente: cobra esa en vez de reintentar esta.' };
    }
    return { ok: false, http: 500, error: 'No se ha podido volver a pasar por el banco.' };
  }
  if (!tocado) return { ok: false, http: 409, error: TEXTO_RECIBO_CAMBIADO };
  await registrar(admin, {
    sesion: { userId: p.actor.userId, rol: p.actor.rol, studioId: p.studioId },
    tabla: 'recibos', filaId: p.reciboId, operacion: 'UPDATE', socioId,
    antes: { estado: 'DEVUELTO', intentos_reintento: recibo.intentos_reintento ?? 0 },
    despues: { estado: 'PENDIENTE', intentos_reintento: intentos },
    contexto: { accion: 'RECIBO_REINTENTADO_POR_BANCO', concepto: recibo.concepto ?? null },
  });
  return { ok: true, intentosReintento: intentos };
}
