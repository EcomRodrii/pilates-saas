// Renovaciones de planes MENSUALES — generación del recibo en SERVIDOR.
//
// El recibo de renovación de una cuota mensual caducada se generaba en el
// NAVEGADOR (studio-context, al abrir el panel) y sin proximo_reintento, así
// que no entraba al barrido de dunning: si la propietaria no abría el panel no
// había recibo, y cuando lo había se cobraba a mano. Los bonos ya hacían esto
// bien (consumirBonoServidor genera su renovación con proximo_reintento); este
// cron iguala el mensual: cada día, para cada suscripción ACTIVA de plan
// MENSUAL con fecha_fin vencida y sin recibo de renovación pendiente, crea el
// recibo con proximo_reintento = ahora — el dunning de las 08:30 lo cobra
// off-session ese mismo día. El efecto del cliente sigue como fallback y
// dedupe contra estos mismos recibos.
//
// A las 08:00 UTC: antes del dunning (08:30) y fuera de las horas del resto de
// crons (07:00 automatizaciones, 14:30 Decision OS).
import { inngest, EVENTS, enviarFanOutEnLotes } from '@/lib/inngest/client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { idsEstudios } from './estudios.ts';
import { repartirVencidas } from '@/lib/billing/baja-al-vencer';
import { puedeArmarReintento, type ReciboParaCobrar } from '@/lib/billing/cobro-permitido';
import { debeAvisarSubidaPrecio } from '@/lib/billing/aviso-subida-precio';
import { emitirRenovacionSinTarjeta } from '@/lib/notifications/emit';

export const renovacionesDispatcher = inngest.createFunction(
  { id: 'renovaciones-dispatcher', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    // La hora va dentro del step de la lista, no en uno propio: cada step es una
    // ejecución de Inngest, y el valor sigue siendo el mismo en los replays.
    // Id nuevo a propósito: el step devuelve otra forma ({ nowISO, studios }), y
    // con el id viejo una ejecución a medias durante un despliegue recuperaría el
    // array guardado y el fan-out fallaría para todos los estudios.
    const { nowISO, studios } = await step.run('list-studios-con-hora', async () => {
      const nowISO = new Date().toISOString();
      const hoy = nowISO.slice(0, 10);
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Service role no configurada');
      // TODOS los estudios, tengan o no Stripe: el recibo debe existir también
      // para cobro manual — el dunning ya filtra por Stripe conectado al cobrar.
      // `suspendido_en`: un estudio suspendido no debe seguir generando
      // recibos de renovación en su nombre.
      const activos = await idsEstudios(admin);

      // Solo abre evento para los estudios con algo que hacer: alguna cuota ACTIVA
      // ya vencida (lo que mira `generarRecibosRenovacion`, sin filtrar aún por
      // plan MENSUAL) o algún recibo de renovación por adoptar (lo que mira
      // `adoptarRecibosCliente`, sin el filtro de método de cobro ni de baja).
      // Ambas consultas son MÁS amplias que las del worker, nunca más estrechas:
      // un estudio con trabajo no se queda fuera. Uno sin nada gastaba cada día
      // un run y sus steps para no tocar ninguna fila.
      const [vencidas, porAdoptar] = await Promise.all([
        fetchAllRows<{ studio_id: string }>('(global)', 'suscripciones',
          (from, to) => admin.from('suscripciones').select('studio_id')
            .eq('estado', 'ACTIVA')
            .not('fecha_fin', 'is', null)
            .lt('fecha_fin', hoy)
            // Orden estable: paginar sin ORDER BY puede saltarse filas pasadas las 1.000.
            .order('id')
            .range(from, to)),
        fetchAllRows<{ studio_id: string }>('(global)', 'recibos',
          (from, to) => admin.from('recibos').select('studio_id')
            .eq('estado', 'PENDIENTE')
            .is('proximo_reintento', null)
            .not('suscripcion_id', 'is', null)
            .eq('es_renovacion', true)
            .is('checkout_session_id', null)
            .order('id')
            .range(from, to)),
      ]);
      if (vencidas.error) throw new Error(vencidas.error.message);
      if (porAdoptar.error) throw new Error(porAdoptar.error.message);
      const conTrabajo = new Set([...vencidas.data, ...porAdoptar.data].map(r => r.studio_id));
      return { nowISO, studios: activos.filter(s => conTrabajo.has(s.id)) };
    });

    await enviarFanOutEnLotes(step, 'fan-out-renovaciones', EVENTS.RENOVACIONES_ESTUDIO, studios, (s: { id: string }) => ({ studioId: s.id, nowISO }));

    return { estudios: studios.length, ejecutadoEn: nowISO };
  },
);

// Feature #5 (ficha Lorari-vs-Tentare): una socia sin tarjeta/SEPA guardados
// (paga en efectivo/Bizum/transferencia a mano) nunca puede cobrarse
// off-session — `elegirMetodoCobro` siempre devolvería SIN_METODO. Antes
// esto SÍ entraba al dunning (proximo_reintento = ahora), y como el barrido
// de dunning.ts nunca reprograma un "omitido" (solo avanza el ciclo en un
// rechazo REAL), el mismo recibo se reintentaba cada día para siempre —
// puro gasto de invocaciones en un plan de Inngest ya al ~84% de su límite
// (ver inngest-limite-recordatorios-fan-out.md). El recibo se sigue
// creando/adoptando igual (PENDIENTE, visible en /cobros para marcarlo a
// mano), solo se le deja `proximo_reintento` en null para que el dunning
// no lo vuelva a mirar.
async function sociosConMetodoCobro(studioId: string): Promise<string[]> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data, error } = await admin
    .from('socios')
    .select('id')
    .eq('studio_id', studioId)
    .or('stripe_payment_method_id.not.is.null,sepa_payment_method_id.not.is.null');
  if (error) throw new Error(error.message);
  return (data ?? []).map(s => s.id as string);
}

// Adopción de recibos huérfanos: los de renovación generados por el
// NAVEGADOR (efecto del studio-context, sin proximo_reintento) — incluidos
// los que ya existen en prod de antes de este cron — no entraban nunca al
// dunning. Se les programa el reintento para que el barrido los cobre —
// salvo que la socia no tenga método off-session, ver guard de arriba.
async function adoptarRecibosCliente(studioId: string, nowISO: string, conMetodoCobro: Set<string>): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data: candidatos, error: candErr } = await admin
    .from('recibos')
    .select('id, socio_id, suscripcion_id, estado, tras_cancelar_cuota')
    .eq('studio_id', studioId)
    .eq('estado', 'PENDIENTE')
    .is('proximo_reintento', null)
    .not('suscripcion_id', 'is', null)
    // ⚠️ Por `es_renovacion`, NO por el texto del concepto. Este es el sitio
    // que decide A QUIEN SE LE COBRA SOLO, y hasta #1671 decidia por copy.
    // Su gemelo —`aplicarRenovacionServidor`, quien decide QUE SE ENTREGA—
    // ya migro a la columna, y la migracion 20260906003934 lo dice con
    // todas las letras: «una decision de dinero no puede depender de que
    // nadie lo traduzca ni lo reescriba». Quedaban divergentes: recepcion
    // crea desde /cobros un recibo con `suscripcion_id` (se adjunta solo la
    // suscripcion activa) y `es_renovacion: false` (el panel nunca lo
    // marca); si teclea el concepto «Renovacion Bono 10», el cron lo
    // adoptaba, el dunning le pasaba la tarjeta off-session y la entrega
    // devolvia SIN_ENTREGA. Cobro automatico real sin entregar nada.
    // El conjunto adoptado no cambia con los datos de hoy: la migracion
    // relleno `es_renovacion = true where concepto like 'Renovación%'`.
    .eq('es_renovacion', true)
    // ⚠️ D-3 (auditoría 24ª pasada): `/api/public/renovar-plan` crea un
    // recibo IDÉNTICO a este por convención (mismo id determinista
    // `rec-renov-{suscripcion}-{mes}`, para que choque por PK con el que
    // este mismo cron generaría) cuando la socia pulsa «Renovar» en el
    // portal — pero ESE es para pagarlo ELLA, ahora, con su propio
    // checkout. Sin este filtro, si cierra el checkout sin completarlo,
    // el barrido de MAÑANA lo adopta igual y el dunning de las 08:30 le
    // cobra la tarjeta guardada off-session sin que ella lo pidiera esta
    // vez. `checkout_session_id` se rellena en cuanto
    // app/api/stripe/checkout crea la sesión (antes de que pague o no),
    // así que es la señal de "esto lo está llevando ella en persona,
    // no lo adoptes" — sin inventar ninguna columna nueva.
    .is('checkout_session_id', null);
  if (candErr) throw new Error(candErr.message);
  // Baja programada a fin de periodo (migr 20260913215533): nunca se adopta
  // —y por tanto nunca se cobra solo— un recibo de renovación de una cuota
  // que se da de baja al vencer. Defensa en profundidad: el efecto del
  // navegador ya no los crea, pero un panel abierto con código anterior sí
  // podría haberlo hecho.
  //
  // Cuota cancelada (auditoría de cobros, 16-sep): tampoco se adopta el recibo de
  // una cuota que no está ACTIVA ni uno que ya marcó la cancelación
  // (`tras_cancelar_cuota`): `puedeArmarReintento`, la misma regla que el cobro.
  const idsSuscripcion = [...new Set((candidatos ?? []).map(r => r.suscripcion_id as string))];
  if (idsSuscripcion.length === 0) return 0;
  const { data: cuotas, error: bajaErr } = await admin
    .from('suscripciones')
    .select('id, estado, baja_al_vencer')
    .eq('studio_id', studioId)
    .in('id', idsSuscripcion);
  if (bajaErr) throw new Error(bajaErr.message);
  const cuotaPorId = new Map((cuotas ?? []).map(s => [s.id as string, s]));
  const idsAAdoptar = (candidatos ?? [])
    .filter(r => conMetodoCobro.has(r.socio_id as string))
    .filter(r => {
      const cuota = cuotaPorId.get(r.suscripcion_id as string);
      if (!cuota || cuota.baja_al_vencer === true) return false;
      return puedeArmarReintento(
        { estado: r.estado as string, proximoReintento: null, trasCancelarCuota: (r.tras_cancelar_cuota as ReciboParaCobrar['trasCancelarCuota']) ?? null },
        { estado: cuota.estado as string },
      );
    })
    .map(r => r.id as string);
  if (idsAAdoptar.length === 0) return 0;
  // Compare-and-set: solo lo que sigue exactamente como se leyó (pendiente, sin
  // reintento, sin checkout y sin marca de cancelación).
  const { data, error } = await admin
    .from('recibos')
    .update({ proximo_reintento: nowISO })
    .in('id', idsAAdoptar)
    .eq('studio_id', studioId)
    .eq('estado', 'PENDIENTE')
    .is('proximo_reintento', null)
    .is('checkout_session_id', null)
    .is('tras_cancelar_cuota', null)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

async function generarRecibosRenovacion(studioId: string, nowISO: string, conMetodoCobro: Set<string>): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const hoy = nowISO.slice(0, 10);

  const [{ data: susRows, error: susErr }, { data: planRows, error: planErr }] = await Promise.all([
    admin.from('suscripciones')
      .select('id, socio_id, plan_id, fecha_fin, baja_al_vencer')
      .eq('studio_id', studioId)
      .eq('estado', 'ACTIVA')
      .not('fecha_fin', 'is', null)
      .lt('fecha_fin', hoy),
    admin.from('planes_tarifa')
      .select('id, nombre, precio, tipo')
      .eq('studio_id', studioId)
      .eq('tipo', 'MENSUAL'),
  ]);
  if (susErr) throw new Error(susErr.message);
  if (planErr) throw new Error(planErr.message);

  const planById = new Map((planRows ?? []).map(p => [p.id as string, p]));
  const todasVencidas = (susRows ?? []).filter(s => planById.has(s.plan_id as string));
  if (todasVencidas.length === 0) return 0;

  // Baja programada a fin de periodo (migr 20260913215533): la cuota vence
  // y se CANCELA en vez de generarle el recibo del mes siguiente. Va antes
  // de crear nada, y con la condición de estado en el UPDATE para no pisar
  // una suscripción que alguien haya tocado entre la lectura y la escritura.
  const { renovar: vencidas, cancelar } = repartirVencidas(
    todasVencidas.map(s => ({ ...s, id: s.id as string, baja_al_vencer: s.baja_al_vencer as boolean | null })),
  );
  if (cancelar.length > 0) {
    const { error: bajaErr } = await admin.from('suscripciones')
      .update({ estado: 'CANCELADA' })
      .eq('studio_id', studioId)
      .eq('estado', 'ACTIVA')
      .eq('baja_al_vencer', true)
      .in('id', cancelar.map(s => s.id));
    if (bajaErr) throw new Error(bajaErr.message);
    // Sin cuota, fuera las clases que su plaza fija ya tenía reservadas (el cron
    // nocturno también lo haría, pero puede haber una clase mañana). Best-effort:
    // un fallo aquí no puede tumbar las renovaciones del resto.
    try {
      const { soltarReservasPlazaFijaSinCuota } = await import('@/lib/db/supabase-data-admin');
      await soltarReservasPlazaFijaSinCuota(admin, { studioId });
    } catch (e) {
      console.error('[renovaciones] soltar plazas fijas sin cuota:', e instanceof Error ? e.message : e);
    }
  }
  if (vencidas.length === 0) return 0;

  // Dedupe: fuera las suscripciones que ya tienen un recibo de renovación
  // en juego (PENDIENTE o adeudo EN_CURSO) — del cliente, de este cron ayer,
  // o creado a mano.
  const { data: pendientes, error: penErr } = await admin
    .from('recibos')
    .select('suscripcion_id')
    .eq('studio_id', studioId)
    .in('estado', ['PENDIENTE', 'EN_CURSO'])
    .in('suscripcion_id', vencidas.map(s => s.id as string));
  if (penErr) throw new Error(penErr.message);
  const conRecibo = new Set((pendientes ?? []).map(r => r.suscripcion_id as string));

  let creados = 0;
  for (const sus of vencidas) {
    if (conRecibo.has(sus.id as string)) continue;
    const plan = planById.get(sus.plan_id as string)!;
    // Id determinista por (suscripción, mes): un reintento del step o dos
    // ejecuciones el mismo día no duplican el recibo (choca por PK).
    const id = `rec-renov-${sus.id}-${hoy.slice(0, 7)}`;
    // Sin tarjeta/SEPA guardados no hay a quién cobrarle off-session — se
    // crea el recibo igual (para /cobros), pero sin entrar al dunning.
    const proximoReintento = conMetodoCobro.has(sus.socio_id as string) ? nowISO : null;
    const { error: insErr } = await admin.from('recibos').insert({
      id, studio_id: studioId, socio_id: sus.socio_id, suscripcion_id: sus.id,
      concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
      // Renueva un ciclo ya entregado: al cobrarlo hay que recargar/extender.
      es_renovacion: true,
      fecha_vencimiento: sus.fecha_fin, fecha_cobro: null, fecha_devolucion: null,
      intentos_reintento: 0, proximo_reintento: proximoReintento,
    });
    if (insErr) {
      // 23505 = ya existía (reintento del step): no es un fallo.
      if (insErr.code !== '23505') throw new Error(insErr.message);
      continue;
    }
    creados++;
    // Sin tarjeta ni SEPA nadie la va a cobrar sola: se le dice a ella, una vez por
    // recibo (dedupKey en el aviso), con dónde pagarla. Antes el recibo se quedaba
    // pendiente sin que nadie se enterase. Al estudio se lo cuenta su bandeja.
    if (proximoReintento === null) await emitirRenovacionSinTarjeta(admin, { studioId, reciboId: id });
  }
  return creados;
}

// PAY-6 (auditoría 2026-09-16, decisión del fundador): el estudio puede subir
// el precio de un plan y la renovación cobra el importe de HOY — pero la
// socia se entera ANTES, no el día del cargo. Corre en el MISMO cron diario
// (nunca uno nuevo — Inngest ya va al ~84% del plan free), mirando las
// suscripciones que vencen dentro de la ventana de aviso, no las ya vencidas
// (esas las mira `generarRecibosRenovacion`).
//
// Ventana de varios días (no un único "exactamente hoy+7"), a propósito: si el
// cron se salta un día, el aviso no se pierde. El `dedupKey` de
// `emitirSuscripcionPrecioSube` (suscripción + fecha_fin) es quien garantiza
// UN solo aviso por ciclo aunque esta función la revise varias veces dentro
// de la ventana.
const VENTANA_AVISO_DIAS = 7;

async function avisarSubidaPrecioRenovacion(studioId: string, nowISO: string): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const hoy = nowISO.slice(0, 10);
  const limite = new Date(nowISO);
  limite.setUTCDate(limite.getUTCDate() + VENTANA_AVISO_DIAS);
  const limiteISO = limite.toISOString().slice(0, 10);

  const [{ data: susRows, error: susErr }, { data: planRows, error: planErr }] = await Promise.all([
    admin.from('suscripciones')
      .select('id, socio_id, plan_id, fecha_fin')
      .eq('studio_id', studioId)
      .eq('estado', 'ACTIVA')
      .not('fecha_fin', 'is', null)
      .gte('fecha_fin', hoy)
      .lte('fecha_fin', limiteISO),
    admin.from('planes_tarifa')
      .select('id, nombre, precio, tipo')
      .eq('studio_id', studioId)
      .eq('tipo', 'MENSUAL'),
  ]);
  if (susErr) throw new Error(susErr.message);
  if (planErr) throw new Error(planErr.message);

  const planById = new Map((planRows ?? []).map(p => [p.id as string, p]));
  const candidatas = (susRows ?? []).filter(s => planById.has(s.plan_id as string));
  if (candidatas.length === 0) return 0;

  const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  let avisados = 0;
  for (const sus of candidatas) {
    const plan = planById.get(sus.plan_id as string)!;
    // El precio ANTERIOR es el último que de verdad se le cobró, no el que
    // tuviera el plan al contratar — si nunca se le ha cobrado (alta muy
    // reciente, primer ciclo) no hay "subida" de la que avisar: es su primer
    // cargo, ya lo vio al contratar.
    const { data: ultimoCobro, error: cobroErr } = await admin.from('recibos')
      .select('importe')
      .eq('studio_id', studioId).eq('suscripcion_id', sus.id as string).eq('estado', 'COBRADO')
      .order('fecha_cobro', { ascending: false }).limit(1).maybeSingle();
    if (cobroErr) throw new Error(cobroErr.message);
    if (!ultimoCobro) continue;
    const precioAnterior = Number(ultimoCobro.importe);
    const precioNuevo = Number(plan.precio);
    if (!debeAvisarSubidaPrecio(precioAnterior, precioNuevo)) continue;
    const { emitirSuscripcionPrecioSube } = await import('@/lib/notifications/emit');
    await emitirSuscripcionPrecioSube(admin, {
      studioId, socioId: sus.socio_id as string, suscripcionId: sus.id as string,
      plan: plan.nombre as string,
      precioAnterior: euros.format(precioAnterior), precioNuevo: euros.format(precioNuevo),
      fecha: sus.fecha_fin as string,
    });
    avisados++;
  }
  return avisados;
}

export const procesarRenovacionesEstudio = inngest.createFunction(
  {
    id: 'renovaciones-estudio',
    triggers: [{ event: EVENTS.RENOVACIONES_ESTUDIO }],
    concurrency: { limit: 3 },
    retries: 3,
  },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };

    // Los cuatro pasos van en UN step (antes tres): cada step es una ejecución
    // de Inngest. Repetirlos juntos en un reintento no duplica nada: la
    // adopción solo toca recibos con `proximo_reintento` nulo, la cancelación
    // por baja es condicional a `estado = 'ACTIVA'`, el recibo de renovación
    // tiene id determinista (23505 = ya existía) y el aviso de subida de
    // precio es idempotente por `dedupKey` (PAY-6). El orden no cambia: primero
    // adoptar, luego generar, luego avisar de subidas futuras.
    //
    // El Set de socias con método se construye DENTRO del step y no se devuelve:
    // un Set devuelto por step.run se serializaría a `{}` en el replay (mismo
    // gotcha que documenta lib/inngest/decision.ts para los Map).
    return step.run('renovar', async () => {
      const conMetodoCobro = new Set(await sociosConMetodoCobro(studioId));
      const adoptados = await adoptarRecibosCliente(studioId, nowISO, conMetodoCobro);
      const generados = await generarRecibosRenovacion(studioId, nowISO, conMetodoCobro);
      const avisados = await avisarSubidaPrecioRenovacion(studioId, nowISO);
      return { studioId, adoptados, generados, avisados };
    });
  },
);
