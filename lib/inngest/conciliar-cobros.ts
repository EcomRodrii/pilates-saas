// ─────────────────────────────────────────────────────────────────────────────
// Red de seguridad: entrega lo que Stripe ya cobró y el webhook no entregó.
//
// Por qué existe. En dos días se perdieron dos cobros reales por dos causas
// distintas, y lo que tenían en común no era la causa: era que entregar lo
// comprado dependía de UN SOLO canal, el webhook. Si ese canal falla —por una
// firma que no cuadra, por un destino mal repartido, o porque sencillamente no
// hay ningún destino configurado, que es lo que pasaba— la venta se pierde en
// silencio y nos enteramos porque la clienta se queja.
//
// Esto le pregunta a Stripe directamente, con `STRIPE_SECRET_KEY`, sin depender
// de que ningún webhook esté bien enrutado ni de ningún secreto de firma.
//
// No sustituye al webhook: cuando el webhook funcione, entregará él en
// segundos y este barrido no encontrará nada que hacer. Los dos caminos usan
// `entregarPlanComprado`, que es idempotente por ids deterministas, así que
// convivir no duplica nada.
//
// Cadencia cada hora (optimizado 2026-08-25): el peor caso que ve una socia es
// esperar hasta 1 hora a que aparezca su bono. Query global sin fan-out por
// estudio (misma lección que reservas-pendientes/lista-espera): una invocación
// por tic, no una por estudio, que es lo que se comió la cuota de Inngest en su día.
//
// ⚠️ Cambio 2026-08-25: Inngest consumía 632% del límite Free (31.6k/mes).
// Reducir de */5min → /hora baja a 48% del límite (2.4k/mes). Red de seguridad
// con retraso de 1h es aceptable; el webhook debería ser el camino principal.
// Si C-1(1) sigue sin cerrarse, revisar si el webhook es realmente viable
// antes de volver a espaciar.
// ─────────────────────────────────────────────────────────────────────────────
import Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { inngest } from './client.ts';
import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { fetchAllRows } from '../supabase-data.ts';
import { entregarPlanComprado, idsDe } from '../billing/entregar-plan-comprado.ts';
import { confirmarCobroRecibo, reintentarFacturasPendientesDeSellar } from '../billing/confirmar-cobro.ts';
import { pendientesDeEntregar, pendientesDeEntregarPI, queEntregarPI, type SesionCobrada, type CobroPI, type Pendiente } from '../billing/conciliar-sesiones.ts';
import { detectarCadenaRotaVerifactu, type FilaCadenaVerifactu } from '../verifactu-cadena.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

// Cuánto atrás se mira. Generoso a propósito: con el barrido cada 5 minutos
// sobra, pero si Vercel se queda sin desplegar unas horas —ya ha pasado— o
// Inngest se atasca, al volver hay que recuperar lo de ese hueco, no solo lo
// último. No más: pasado un día, un cobro sin entregar ya no es un retraso
// recuperable sin mirarlo a mano.
const VENTANA_HORAS = 12;

// Techo defensivo del autopaginado. 2.000 sesiones en 12 h cubre con holgura al
// estudio más activo que quepa imaginar; no es el límite de trabajo —para eso
// está el `for await`—, es el freno para que un filtro roto no deje el barrido
// girando sobre miles de páginas. Si se alcanza, la suposición se ha roto y hay
// que enterarse: se avisa y se sigue, nunca se corta en silencio.
const TECHO_SESIONES = 2000;

// Todas las sesiones de la ventana, no solo las primeras 100.
//
// ⚠️ Antes esto era un `.list({ limit: 100 })` a secas del que se leía `.data`.
// Stripe devuelve de MÁS RECIENTE A MÁS ANTIGUA, así que al pasar de 100 lo que
// se caía eran las más viejas — exactamente las que llevan más tiempo sin
// entregar— y, como la ventana es deslizante, una sesión atascada que se salía
// del top-100 no volvía nunca: dinero cobrado y no entregado, sin error y sin
// rastro. El `for await` autopagina (Stripe pide de 100 en 100 por debajo);
// mismo patrón que ya se usaba bien en `app/api/interno/facturacion`.
async function listarSesionesVentana(
  stripe: Stripe,
  cuenta: string,
  desde: number,
): Promise<Stripe.Checkout.Session[]> {
  const todas: Stripe.Checkout.Session[] = [];
  for await (const s of stripe.checkout.sessions.list(
    { created: { gte: desde }, limit: 100 },
    { stripeAccount: cuenta },
  )) {
    todas.push(s);
    if (todas.length >= TECHO_SESIONES) {
      Sentry.captureMessage('[conciliador] techo de paginado alcanzado: puede quedar dinero sin conciliar', {
        level: 'error',
        tags: { area: 'cobros', tipo: 'techo-paginado' },
        extra: { cuenta, techo: TECHO_SESIONES, ventanaHoras: VENTANA_HORAS },
      });
      break;
    }
  }
  return todas;
}

// El checkout embebido del widget (Modo B) cobra con un PaymentIntent DIRECTO,
// sin Checkout Session: el listado de arriba no lo ve, así que se listan
// aparte. Este listado es más ruidoso que el de sesiones — entran TODOS los PI
// de la cuenta: los abandonados del propio widget (cada POST al endpoint crea
// uno en `requires_payment_method` aunque la socia cierre la pestaña), los
// nacidos de Checkout Session, POS y SEPA. El filtro real (status + origen de
// metadata) es client-side, en el módulo puro. Mismo techo defensivo que las
// sesiones, con tag PROPIO: si salta, hay que saber cuál de los dos listados
// se rompió.
const TECHO_PIS = 2000;

async function listarPIsVentana(
  stripe: Stripe,
  cuenta: string,
  desde: number,
): Promise<Stripe.PaymentIntent[]> {
  const todos: Stripe.PaymentIntent[] = [];
  for await (const pi of stripe.paymentIntents.list(
    { created: { gte: desde }, limit: 100 },
    { stripeAccount: cuenta },
  )) {
    todos.push(pi);
    if (todos.length >= TECHO_PIS) {
      Sentry.captureMessage('[conciliador] techo de paginado de PaymentIntents alcanzado: puede quedar dinero sin conciliar', {
        level: 'error',
        tags: { area: 'cobros', tipo: 'techo-paginado-pi' },
        extra: { cuenta, techo: TECHO_PIS },
      });
      break;
    }
  }
  return todos;
}

// Detecta qué está cobrado y sin entregar en una ventana dada. NO entrega nada.
//
// Separar "detectar" de "entregar" es lo que permite que el barrido que RECUPERA
// (12 h) y la vigilancia que solo AVISA (72 h) usen exactamente el mismo criterio
// sin poder divergir nunca. Si fueran dos consultas parecidas escritas aparte,
// bastaría con tocar una para que la vigilancia dejara de ver justo lo que el
// otro se deja.
async function detectarPendientes(
  admin: SupabaseClient,
  stripe: Stripe,
  studio: { id: string; stripe_account_id: string },
  ventanaHoras: number,
): Promise<{
  pendientes: Pendiente[];
  sesionPorId: Map<string, Stripe.Checkout.Session>;
  piPorId: Map<string, Stripe.PaymentIntent>;
}> {
  const desde = Math.floor(Date.now() / 1000) - ventanaHoras * 3600;

  const todas = await listarSesionesVentana(stripe, studio.stripe_account_id, desde);
  const pis = await listarPIsVentana(stripe, studio.stripe_account_id, desde);

  const sesiones: SesionCobrada[] = todas.map(s => ({
    id: s.id,
    status: s.status,
    paymentStatus: s.payment_status,
    metadata: s.metadata,
  }));
  const cobrosPI: CobroPI[] = pis.map(pi => ({
    id: pi.id,
    status: pi.status,
    metadata: pi.metadata,
  }));

  // Qué está ya hecho, en DOS consultas y no una por sesión: los recibos que ya
  // constan cobrados, y los `rec-web-…` que ya existen (una compra de plan
  // entregada deja ese recibo, con id derivado de la sesión o del PI).
  const idsRecibo = sesiones.map(s => s.metadata?.reciboId).filter((x): x is string => !!x);
  const idsWeb = sesiones.map(s => idsDe(s.id).reciboId);
  // ⚠️ Los `rec-web-…` esperados de los PI van a ESTA consulta (existencia,
  // sin filtro de estado), nunca a la de COBRADO: un recibo DEVUELTO debe
  // seguir dedupeando — reentregarlo re-ejecutaría la renovación de una
  // compra ya devuelta.
  //
  // Y SOLO de los PI que clasifican como candidatos Modo B (el mismo
  // clasificador puro que decide qué entregar, una sola fuente de la regla):
  // meter un id por CADA PI de la ventana —abandonos, POS, SEPA, los nacidos
  // de sesiones, que son la mayoría— inflaría el `.in()` hasta poder tumbar
  // la consulta, y como su error se descarta (patrón heredado de la vía de
  // sesiones), el dedupe colapsaría a vacío y se reintentaría la entrega
  // entera cada 5 min: el dinero lo salva el 23505, pero el email de recibo
  // se reenviaría a cada socia en cada pasada.
  const candidatosPI = cobrosPI.filter(pi => queEntregarPI(pi, studio.id) !== null);
  const idsWebPI = candidatosPI.map(pi => idsDe(pi.id).reciboId);

  const recibosCobrados = new Set<string>();
  if (idsRecibo.length) {
    const { data } = await admin
      .from('recibos').select('id').eq('studio_id', studio.id)
      .in('id', idsRecibo).eq('estado', 'COBRADO');
    for (const r of data ?? []) recibosCobrados.add((r as { id: string }).id);
  }

  const sesionesEntregadas = new Set<string>();
  const pisEntregados = new Set<string>();
  if (idsWeb.length || idsWebPI.length) {
    const { data } = await admin
      .from('recibos').select('id').eq('studio_id', studio.id).in('id', [...idsWeb, ...idsWebPI]);
    const existentes = new Set((data ?? []).map(r => (r as { id: string }).id));
    for (const s of sesiones) {
      if (existentes.has(idsDe(s.id).reciboId)) sesionesEntregadas.add(s.id);
    }
    for (const pi of candidatosPI) {
      if (existentes.has(idsDe(pi.id).reciboId)) pisEntregados.add(pi.id);
    }
  }

  const pendientes = [
    ...pendientesDeEntregar(sesiones, studio.id, { recibosCobrados, sesionesEntregadas }),
    ...pendientesDeEntregarPI(cobrosPI, studio.id, pisEntregados),
  ];
  return {
    pendientes,
    sesionPorId: new Map(todas.map(s => [s.id, s])),
    piPorId: new Map(pis.map(pi => [pi.id, pi])),
  };
}

async function conciliarEstudio(
  admin: SupabaseClient,
  stripe: Stripe,
  studio: { id: string; stripe_account_id: string },
): Promise<number> {
  const { pendientes, sesionPorId, piPorId } = await detectarPendientes(admin, stripe, studio, VENTANA_HORAS);
  for (const p of pendientes) {
    await entregar(admin, stripe, studio.stripe_account_id, p, sesionPorId.get(p.sesionId), piPorId.get(p.sesionId));
  }
  return pendientes.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// I-3 · Vigilancia: lo que se le ESCAPÓ al barrido de recuperación.
//
// `VENTANA_HORAS` (12) es un límite duro y hasta ahora era mudo: un cobro sin
// entregar que se pasaba de esa ventana salía del alcance del conciliador y
// desaparecía del sistema — sin error, sin aviso y sin ninguna tarea pendiente
// que lo recordara. El comentario de la ventana ya decía que pasado un día "ya
// no es un retraso recuperable sin mirarlo a mano"; el problema era que **nada
// ni nadie avisaba de que había algo que mirar**.
//
// Esto NO entrega. A propósito: si un cobro lleva más de 12 h sin entregarse, la
// causa no es un retraso —eso ya lo cubre el barrido de 5 min— sino algo
// estructural (el webhook rechazando por cuenta/metadata que no cuadran, una
// cuenta Connect mal configurada). Entregarlo en silencio taparía justo la señal
// que hace falta para arreglar la causa. Entregar es barato de añadir el día que
// se decida; recuperar una señal que nunca se emitió, no.
// ─────────────────────────────────────────────────────────────────────────────
const VENTANA_VIGILANCIA_HORAS = 72;

async function vigilarEstudio(
  admin: SupabaseClient,
  stripe: Stripe,
  studio: { id: string; stripe_account_id: string },
): Promise<number> {
  const { pendientes, sesionPorId, piPorId } = await detectarPendientes(admin, stripe, studio, VENTANA_VIGILANCIA_HORAS);

  // Solo lo que ya está FUERA del alcance del barrido de recuperación. Lo más
  // reciente que 12 h no es un problema todavía: el otro cron lo cogerá en su
  // próximo tic, y avisar de ello sería ruido diario garantizado.
  const limite = Math.floor(Date.now() / 1000) - VENTANA_HORAS * 3600;
  const creadoDe = (p: Pendiente): number | undefined =>
    sesionPorId.get(p.sesionId)?.created ?? piPorId.get(p.sesionId)?.created;
  const escapados = pendientes.filter(p => {
    const creado = creadoDe(p);
    return creado !== undefined && creado < limite;
  });

  for (const p of escapados) {
    const creado = creadoDe(p);
    Sentry.captureMessage('[conciliador] cobro sin entregar FUERA de la ventana de recuperación', {
      level: 'error',
      tags: { area: 'cobros', tipo: 'fuera-de-ventana' },
      extra: {
        studioId: studio.id,
        sesionId: p.sesionId,
        tipo: p.tipo,
        creadoEn: creado ? new Date(creado * 1000).toISOString() : null,
        horasSinEntregar: creado ? Math.round((Date.now() / 1000 - creado) / 3600) : null,
        queHacer: 'El conciliador ya NO lo va a recuperar solo. Revisar por qué el webhook no lo entregó y entregarlo a mano.',
      },
    });
  }
  return escapados.length;
}

// Roturas HISTÓRICAS ya diagnosticadas y documentadas: la condición es
// permanente (una factura emitida NO se reescribe, ver `queHacer` de abajo), así
// que avisar de ellas cada día solo entierra la alerta que sí importaría.
//
// `studio-1` / seq 4 (`A-2026-0028`): la migración
// `supabase/migrations/20260729152338_facturas_numeracion_atomica.sql` reparó un
// duplicado real de numeración renumerando `fac-auto-1783688865320-feepl` de la
// seq 3 a la 4, pero NO reenlazó su `verifactu_prev_hash` — que sigue apuntando
// a la "anterior" que tenía antes del renumerado. Por eso hoy en producción las
// facturas seq 3 y seq 4 de `studio-1` comparten `prev_hash`. Son facturas de
// SIEMBRA, jamás transmitidas a la AEAT, y el renumerado fue deliberado.
//
// Esta lista es una EXENCIÓN NOMINAL, no un silenciador: cualquier otra rotura
// —de otro estudio, u otra seq de este mismo— sigue disparando el aviso.
const ROTURAS_VERIFACTU_CONOCIDAS: ReadonlySet<string> = new Set([
  'studio-1:4', // A-2026-0028, renumerado de la migración 20260729152338
]);

// Auditoría 22ª pasada (3-sep-2026), P-3. `reservar_numero_factura` reserva
// numero_completo/verifactu_seq/verifactu_prev_hash bajo un advisory lock POR
// ESTUDIO (lib/billing/sellar-factura-server.ts), así que la secuencia y su
// cadena de huellas son por studio_id, no globales — de ahí agrupar así, no
// con un solo LAG() sobre toda la tabla (mezclaría estudios distintos).
//
// Bifurcación real encontrada en producción durante la auditoría: dos sellados
// CONCURRENTES de la misma acción del panel escribieron dos facturas con el
// mismo verifactu_prev_hash (la misma "anterior"), y una de las dos rompe la
// cadena para siempre — una factura emitida no se reescribe. El bug de
// concurrencia parece cerrado (nada roto desde el 10-jul; D-2 cerró además el
// caso adyacente de las facturas legacy sin seq), pero hasta ahora NADA
// comprobaba si volvía a pasar: se encontró con una consulta SQL manual, no
// con ninguna alerta.
export async function vigilarCadenaVerifactu(admin: SupabaseClient): Promise<number> {
  const { data: filas } = await fetchAllRows<FilaCadenaVerifactu>(
    '(global)', 'facturas',
    (from, to) => admin
      .from('facturas')
      .select('studio_id, verifactu_seq, numero_completo, verifactu_hash, verifactu_prev_hash')
      .not('verifactu_seq', 'is', null)
      .order('studio_id', { ascending: true })
      .order('verifactu_seq', { ascending: true })
      .range(from, to),
  );
  // El filtro se aplica AQUÍ y no dentro de `detectarCadenaRotaVerifactu`: esa
  // función es pura, está testeada (lib/verifactu-cadena.test.ts) y debe seguir
  // diciendo la verdad sobre el estado real de la cadena. Lo que se exime es el
  // AVISO, no el hecho.
  const roturas = detectarCadenaRotaVerifactu(filas)
    .filter(r => !ROTURAS_VERIFACTU_CONOCIDAS.has(`${r.studioId}:${r.seqRota}`));
  for (const r of roturas) {
    Sentry.captureMessage('[verifactu] cadena de facturación bifurcada', {
      level: 'error',
      tags: { area: 'facturacion', tipo: 'cadena-rota' },
      extra: {
        ...r,
        queHacer: 'Una factura emitida no se reescribe: documentar la incidencia para el asesor fiscal antes de VERIFACTU_ENTORNO=produccion.',
      },
    });
  }
  return roturas.length;
}

export const conciliarCobrosVigilancia = inngest.createFunction(
  // Una vez al día: no es un barrido de recuperación, es una red por debajo de
  // la red. Un tic diario no mueve la aguja del consumo (O-1) y cierra el
  // agujero de que un cobro perdido no deje rastro en ninguna parte.
  { id: 'conciliar-cobros-vigilancia', triggers: [{ cron: '20 7 * * *' }] },
  async ({ step }) => {
    const cobros = await step.run('vigilar', async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith('sk_test_XXXX')) return { skipped: 'stripe no configurado' };
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      const { data: studios } = await fetchAllRows<{ id: string; stripe_account_id: string }>(
        '(global)', 'studios',
        (from, to) => admin
          .from('studios')
          .select('id, stripe_account_id')
          .not('stripe_account_id', 'is', null)
          .is('suspendido_en', null)
          .range(from, to),
      );
      if (!studios.length) return { escapados: 0 };

      const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      let escapados = 0;
      for (const s of studios) {
        try {
          escapados += await vigilarEstudio(admin, stripe, s as { id: string; stripe_account_id: string });
        } catch (e) {
          Sentry.captureException(e instanceof Error ? e : new Error('vigilancia conciliador'), {
            level: 'error', tags: { area: 'cobros' }, extra: { studioId: (s as { id: string }).id },
          });
        }
      }
      return { estudios: studios.length, escapados };
    });

    // Auditoría 22ª pasada (3-sep-2026), P-3. La cadena Veri*Factu de un
    // estudio se descubrió bifurcada por una consulta SQL manual durante la
    // auditoría — nada la comprobaba antes. Paso aparte (no dentro de
    // `vigilar`): no depende de Stripe, así que no debe caer si falta la
    // clave, y un fallo aquí no debe tumbar la vigilancia de cobros de arriba
    // ni al revés. Mismo cron diario en vez de uno nuevo (Inngest cerca del
    // límite del plan free, ver cabecera del fichero).
    const facturacion = await step.run('vigilar-cadena-verifactu', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      return { rotas: await vigilarCadenaVerifactu(admin) };
    });

    return { cobros, facturacion };
  },
);

// `sesion` y `pi` son excluyentes: un pendiente nace del listado de sesiones
// (Modo A) o del de PaymentIntents (Modo B, checkout embebido), nunca de los
// dos. Esto es una RED DE ENTREGA de lo comprado, no una réplica del webhook:
// igual que ya pasaba en Modo A, no se replica el guardado de tarjeta ni el
// consumo del código de descuento — una compra recuperada por aquí entrega el
// bono (y la plaza, en Modo B) pero no descuenta el uso del código.
async function entregar(
  admin: SupabaseClient,
  stripe: Stripe,
  cuenta: string,
  p: Pendiente,
  sesion: Stripe.Checkout.Session | undefined,
  pi: Stripe.PaymentIntent | undefined,
) {
  // Que este barrido tenga trabajo significa que el webhook NO hizo el suyo.
  // Entregar en silencio arreglaría a la socia y escondería la avería, que es
  // exactamente cómo se llegó a perder el primer cobro.
  Sentry.captureMessage('[conciliador] cobro sin entregar recuperado', {
    level: 'warning',
    tags: { area: 'cobros', tipo: 'conciliado' },
    extra: { sesionId: p.sesionId, studioId: p.studioId, tipo: p.tipo },
  });

  if (p.tipo === 'recibo') {
    // F-12/F-13 (rediseño de fondo): mismo punto único que usa el webhook —
    // marcar cobrado + renovar + sellar factura + notificar + email en un
    // solo sitio, ver lib/billing/confirmar-cobro.ts. Antes esto era una
    // copia casi literal del webhook que se quedaba atrás cada vez que el
    // webhook ganaba una pieza nueva (guardar el PaymentIntent, sellar
    // factura — las dos llegaron aquí tarde, F-13).
    const piId = typeof sesion?.payment_intent === 'string'
      ? sesion.payment_intent
      : sesion?.payment_intent?.id ?? null;
    const res = await confirmarCobroRecibo(admin, {
      studioId: p.studioId, reciboId: p.reciboId, metodoCobro: 'TARJETA',
      paymentIntentId: piId, fuente: 'conciliador',
    });
    if (!res.ok) throw new Error(`conciliador/recibo ${p.reciboId}: ${res.error}`);
    return;
  }

  // Los mismos datos que usa la rama correspondiente del webhook. En la vía PI
  // (Modo B) el email/nombre viajan en la metadata desde la creación del PI;
  // en Modo A los pone Stripe en la propia sesión.
  const datos = pi ? {
    email: pi.metadata?.socioEmail ?? null,
    nombre: pi.metadata?.socioNombre ?? null,
    // Gemelo divergente con el webhook (app/api/stripe/webhook/route.ts, rama
    // del checkout embebido): allí la ficha nueva se crea CON teléfono y con
    // la "información adicional" del formulario de pago sin login. Aquí no se
    // pasaban, así que la socia rescatada por el cron acababa con una ficha
    // más pobre que la de la socia rescatada por el webhook — el rescate no
    // puede entregar peor que el camino normal. Misma metadata, misma forma.
    telefono: pi.metadata?.socioTelefono ?? null,
    datosAdicionales: {
      genero: pi.metadata?.genero ?? null,
      comoConociste: pi.metadata?.comoConociste ?? null,
      codigoPostal: pi.metadata?.codigoPostal ?? null,
      fechaNacimiento: pi.metadata?.fechaNacimiento ?? null,
    },
    importeCobradoCentimos: pi.amount_received ?? pi.amount ?? null,
    paymentIntentId: pi.id,
  } : {
    email: sesion?.customer_details?.email ?? sesion?.customer_email ?? null,
    nombre: sesion?.customer_details?.name ?? null,
    // Lo cobrado de VERDAD, no el precio de catálogo de ahora: entre la compra
    // y este barrido el estudio puede haber cambiado el precio del plan.
    importeCobradoCentimos: typeof sesion?.amount_total === 'number' ? sesion.amount_total : null,
    paymentIntentId: typeof sesion?.payment_intent === 'string' ? sesion.payment_intent : null,
  };

  const entrega = await entregarPlanComprado(admin, {
    sessionId: p.sesionId,
    studioId: p.studioId,
    planId: p.planId,
    socioId: p.socioId,
    ...datos,
    origenLead: p.origenLead,
    // Mismo criterio que el webhook (app/api/stripe/webhook/route.ts): sin
    // socioId conocido, es una compra de invitada.
    esInvitada: !p.socioId,
    fuente: 'conciliador',
  });

  if (!entrega.ok) {
    Sentry.captureMessage('[conciliador] cobrado y NO se pudo entregar', {
      level: 'error',
      tags: { area: 'cobros', tipo: 'conciliado-fallido' },
      extra: { sesionId: p.sesionId, studioId: p.studioId, motivo: entrega.motivo, detalle: entrega.detalle },
    });
    return;
  }

  if (pi) {
    // Mismo remate que el webhook del checkout embebido: sin `reciboId` en la
    // metadata, la compra es invisible a reembolsos y disputas. Merge
    // conservando lo que ya hay — el PI de Modo B NACE con metadata (origen
    // incluido), a diferencia del de Modo A, que nace vacío y se puede pisar.
    try {
      await stripe.paymentIntents.update(
        pi.id,
        { metadata: { ...pi.metadata, reciboId: entrega.reciboId } },
        { stripeAccount: cuenta },
      );
    } catch { /* el bono ya está entregado; esto es el remate, no el cobro */ }

    // "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md
    // §4.2): si la compra venía con una clase concreta, la plaza también es
    // parte de lo pagado — la pantalla ya le dijo "reservada" a la socia.
    // Idempotente por `res-web-<pi>` y serializado por el FOR UPDATE de
    // `reservar_plaza`: la carrera con el webhook acaba en YA_RESERVADA (que
    // se trata como éxito, sin consumir bono dos veces), no en plaza doble.
    // Con el retraso del conciliador la clase puede haber empezado o cerrado
    // su ventana de reserva — ese fallo acaba en Sentry + aviso al mostrador,
    // que es justo lo que toca: que alguien llame a la socia hoy.
    if (pi.metadata?.sesionId) {
      try {
        const { reservarPlazaTrasPagoPublico } = await import('@/lib/db/supabase-data-admin');
        const r = await reservarPlazaTrasPagoPublico({
          studioId: p.studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId, paymentIntentId: pi.id,
          // Igual que el webhook: si la socia pagó por una CAMILLA/plaza
          // concreta, el rescate tiene que darle ESA, no una cualquiera.
          spotId: pi.metadata.spotId ?? null,
        });
        if (!r.ok) {
          Sentry.captureMessage('[conciliador] plan entregado pero NO se pudo reservar la clase pagada', {
            level: 'error',
            tags: { area: 'cobros', tipo: 'conciliado-sin-plaza' },
            extra: { studioId: p.studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId, paymentIntentId: pi.id, motivo: r.motivo, detalle: r.detalle },
          });
          const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
          await emitirReservaPagadaSinPlaza(admin, { studioId: p.studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId });
        } else if (r.estado === 'LISTA_ESPERA') {
          // Mismo caso que en el webhook: cobrado y en la cola, no confirmada.
          // Se avisa aquí también porque el conciliador es el camino PRINCIPAL
          // de rescate de este repo, no un plan B teórico.
          const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
          await emitirReservaPagadaSinPlaza(admin, {
            studioId: p.studioId, sesionId: pi.metadata.sesionId, socioId: entrega.socioId, situacion: 'en-espera',
          });
        }
      } catch (e) {
        Sentry.captureException(e instanceof Error ? e : new Error('conciliador reservarPlazaTrasPagoPublico'), {
          extra: { contexto: 'conciliador reservarPlazaTrasPagoPublico', studioId: p.studioId, sesionId: pi.metadata?.sesionId, paymentIntentId: pi.id },
        });
      }
    }
  } else if (typeof sesion?.payment_intent === 'string') {
    // Sin esto, la compra es invisible a reembolsos y disputas: sus manejadores
    // leen `pi.metadata.reciboId`, y el PaymentIntent de una compra de plan
    // Modo A nace sin metadata porque el recibo aún no existía. Mismo remate
    // que el webhook.
    try {
      await stripe.paymentIntents.update(
        sesion.payment_intent,
        { metadata: { reciboId: entrega.reciboId, origen: 'plan_web', studioId: p.studioId } },
        { stripeAccount: cuenta },
      );
    } catch { /* el bono ya está entregado; esto es el remate, no el cobro */ }
  }

  const { emitirPagoRealizado } = await import('@/lib/notifications/emit');
  await emitirPagoRealizado(admin, { studioId: p.studioId, reciboId: entrega.reciboId });
  const { enviarEmailReciboWebhook } = await import('@/lib/emails/enviar-recibo-webhook');
  await enviarEmailReciboWebhook(admin, { studioId: p.studioId, reciboId: entrega.reciboId });
}

export const conciliarCobrosDispatcher = inngest.createFunction(
  { id: 'conciliar-cobros', triggers: [{ cron: '0 * * * *' }] },
  async ({ step }) => {
    return step.run('conciliar', async () => {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key || key.startsWith('sk_test_XXXX')) return { skipped: 'stripe no configurado' };
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };

      // Solo estudios que pueden cobrar. Hoy son un puñado; si algún día son
      // cientos, esto pasa a fan-out — pero no antes, que es cuando duele la
      // cuota de Inngest sin motivo.
      const { data: studios } = await fetchAllRows<{ id: string; stripe_account_id: string }>(
        '(global)', 'studios',
        (from, to) => admin
          .from('studios')
          .select('id, stripe_account_id')
          .not('stripe_account_id', 'is', null)
          .is('suspendido_en', null)
          .range(from, to),
      );
      if (!studios.length) return { entregados: 0 };

      const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      let entregados = 0;
      for (const s of studios) {
        try {
          entregados += await conciliarEstudio(admin, stripe, s as { id: string; stripe_account_id: string });
        } catch (e) {
          // Un estudio que falle no puede dejar sin conciliar a los demás.
          Sentry.captureException(e instanceof Error ? e : new Error('conciliador'), {
            level: 'error', tags: { area: 'cobros' }, extra: { studioId: (s as { id: string }).id },
          });
        }
      }

      // F-12/F-13: remate del eslabón "factura" del ciclo cobro → factura →
      // devolución → conciliación. Acotado a las últimas 72h (ver cabecera de
      // confirmar-cobro.ts) — nunca sellado retroactivo sin límite.
      let facturasSelladas = 0;
      try {
        facturasSelladas = await reintentarFacturasPendientesDeSellar(admin, 72);
      } catch (e) {
        Sentry.captureException(e instanceof Error ? e : new Error('reintentarFacturasPendientesDeSellar'), {
          level: 'error', tags: { area: 'cobros', tipo: 'facturacion' },
        });
      }

      return { estudios: studios.length, entregados, facturasSelladas };
    });
  },
);
