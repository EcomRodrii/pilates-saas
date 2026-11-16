import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarEmailImpagoSaas } from '@/lib/emails/impago-saas-server';
import { LEGAL } from '@/lib/legal-info';
import { avisoPendiente, CLAVE_POLITICA, debeEscalar, leerPolitica, textoDelMotivo, type PoliticaImpagos } from '@/lib/billing/impagos/reglas';

// Recuperación de impagos del SaaS (Fase 2). Stripe reintenta el cobro; esto SOLO avisa a la
// propietaria, guarda el motivo y sincroniza el resultado. Nunca cancela ni suspende nada.

export const urlActualizarTarjeta = () => `${process.env.NEXT_PUBLIC_APP_URL || LEGAL.url}/suscripcion?tarjeta=1`;

export interface IncidenteFila {
  stripe_invoice_id: string;
  studio_id: string | null;
  cadena_id: string | null;
  estado: string;
  importe_cents: number;
  motivo_codigo: string | null;
  motivo_texto: string | null;
  siguiente_intento: string | null;
  abierto_en: string;
  avisos: Array<{ dia: number }> | null;
}

export const COLUMNAS_INCIDENTE =
  'stripe_invoice_id, studio_id, cadena_id, estado, importe_cents, motivo_codigo, motivo_texto, siguiente_intento, abierto_en, avisos';

const eur = (cents: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const fechaLarga = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }) : null;

export async function leerPoliticaGuardada(admin: SupabaseClient): Promise<PoliticaImpagos> {
  const { data } = await admin.from('ajustes_plataforma').select('valor').eq('clave', CLAVE_POLITICA).maybeSingle();
  return leerPolitica(data?.valor);
}

/** El motivo que dio el banco, leído del PaymentIntent de la factura. `null` si Stripe no lo da. */
export async function leerMotivoDeFallo(stripe: Stripe, invoiceId: string): Promise<{ codigo: string; texto: string } | null> {
  const pagos = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5, expand: ['data.payment.payment_intent'] });
  for (const p of pagos.data) {
    const pi = p.payment?.payment_intent;
    if (!pi || typeof pi === 'string') continue;
    const e = pi.last_payment_error;
    const codigo = e?.decline_code ?? e?.code;
    if (!codigo) continue;
    const texto = textoDelMotivo(codigo);
    if (texto) return { codigo, texto };
  }
  return null;
}

/** La propietaria REAL (auth.users), no `studios.email` (contacto público de cara a sus alumnas). */
async function destinatario(admin: SupabaseClient, inc: Pick<IncidenteFila, 'studio_id' | 'cadena_id'>) {
  const tabla = inc.studio_id ? 'studios' : inc.cadena_id ? 'cadenas' : null;
  const id = inc.studio_id ?? inc.cadena_id;
  if (!tabla || !id) return null;
  const { data: fila } = await admin.from(tabla).select('nombre, plan, owner_auth_user_id').eq('id', id).maybeSingle();
  if (!fila?.owner_auth_user_id) return null;
  const { data } = await admin.auth.admin.getUserById(fila.owner_auth_user_id as string);
  const email = data?.user?.email;
  if (!email) return null;
  return { email, nombre: (fila.nombre as string | null) ?? 'tu estudio', plan: (fila.plan as string | null) ?? 'actual' };
}

export type ResultadoAviso = 'enviado' | 'nada_que_avisar' | 'sin_destinatario' | 'no_se_pudo_enviar';

/**
 * Manda el aviso que toque a un incidente (como mucho uno por llamada). Reclama el hito
 * ANTES de mandarlo —así el webhook y el cron no lo mandan dos veces— y lo devuelve si el
 * envío falla, para que el siguiente tic lo reintente.
 */
export async function avisarSiToca(
  admin: SupabaseClient, inc: IncidenteFila, ahora: Date, politica: PoliticaImpagos,
): Promise<ResultadoAviso> {
  const pendiente = avisoPendiente({ abiertoEn: inc.abierto_en, avisos: inc.avisos ?? [] }, ahora, politica);
  if (!pendiente) return 'nada_que_avisar';
  const dest = await destinatario(admin, inc);
  if (!dest) return 'sin_destinatario';

  const { data: reclamado, error } = await admin.rpc('billing_registrar_aviso', {
    p_stripe_invoice_id: inc.stripe_invoice_id, p_dia: pendiente.dia, p_tipo: pendiente.tipo,
  });
  if (error) throw new Error(`billing_registrar_aviso: ${error.message}`);
  if (!reclamado) return 'nada_que_avisar'; // otro proceso se adelantó
  // Los hitos que se pasaron sin mandar se anotan para no mandarlos nunca (ni a la vez).
  for (const d of pendiente.saltados) {
    await admin.rpc('billing_registrar_aviso', { p_stripe_invoice_id: inc.stripe_invoice_id, p_dia: d, p_tipo: 'saltado' });
  }

  const r = await enviarEmailImpagoSaas({
    to: dest.email, fase: pendiente.tipo, estudioNombre: dest.nombre, plan: dest.plan,
    importe: eur(inc.importe_cents), motivo: inc.motivo_texto, proximoIntento: fechaLarga(inc.siguiente_intento),
    urlActualizar: urlActualizarTarjeta(),
  });
  if (!r.ok && !r.skipped) {
    await admin.rpc('billing_liberar_aviso', { p_stripe_invoice_id: inc.stripe_invoice_id, p_dia: pendiente.dia });
    return 'no_se_pudo_enviar';
  }
  if (r.skipped) {
    // Sin clave de correo no se envía nada: no se da el aviso por hecho.
    await admin.rpc('billing_liberar_aviso', { p_stripe_invoice_id: inc.stripe_invoice_id, p_dia: pendiente.dia });
    return 'no_se_pudo_enviar';
  }
  return 'enviado';
}

/** «Ya está al día»: solo si se le había avisado antes (si nunca supo del fallo, no se le habla de él). */
export async function avisarRecuperacion(admin: SupabaseClient, inc: IncidenteFila): Promise<void> {
  if ((inc.avisos ?? []).length === 0) return;
  const dest = await destinatario(admin, inc);
  if (!dest) return;
  await enviarEmailImpagoSaas({
    to: dest.email, fase: 'recuperado', estudioNombre: dest.nombre, plan: dest.plan,
    importe: eur(inc.importe_cents), urlActualizar: urlActualizarTarjeta(),
  });
}

export async function leerIncidente(admin: SupabaseClient, invoiceId: string): Promise<IncidenteFila | null> {
  const { data } = await admin.from('billing_incidentes_pago').select(COLUMNAS_INCIDENTE).eq('stripe_invoice_id', invoiceId).maybeSingle();
  return (data as IncidenteFila | null) ?? null;
}

/**
 * Desde el webhook, al llegar `invoice.payment_failed`: guarda el motivo (si Stripe lo da)
 * y manda el aviso del día 0. `sin_incidente` = el libro no pudo abrirlo; quien llama cae
 * al aviso de siempre, para no dejar a nadie sin enterarse por un fallo del libro.
 */
export async function atenderFalloDePago(admin: SupabaseClient, stripe: Stripe, invoiceId: string): Promise<ResultadoAviso | 'sin_incidente'> {
  let inc = await leerIncidente(admin, invoiceId);
  if (!inc || !['ABIERTO', 'ESCALADO'].includes(inc.estado)) return 'sin_incidente';
  if (!inc.motivo_codigo) {
    try {
      const m = await leerMotivoDeFallo(stripe, invoiceId);
      if (m) {
        await admin.rpc('billing_fijar_motivo', { p_stripe_invoice_id: invoiceId, p_codigo: m.codigo, p_texto: m.texto });
        inc = { ...inc, motivo_codigo: m.codigo, motivo_texto: m.texto };
      }
    } catch (err) {
      // El motivo es un extra: sin él el aviso sale igual con el texto habitual.
      Sentry.captureException(err, { tags: { area: 'billing', tipo: 'impago-motivo' }, extra: { invoiceId } });
    }
  }
  return avisarSiToca(admin, inc, new Date(), await leerPoliticaGuardada(admin));
}

export interface ResumenBarrido { revisados: number; avisos: number; escalados: number; cerrados: number; fallos: number }

/**
 * La pasada periódica (cron horario): avisa lo que toque, escala lo que llegó al último hito
 * y SINCRONIZA con Stripe antes de insistir — si la factura ya se pagó o se anuló mientras
 * tanto (y el evento se perdió), se cierra el incidente en vez de mandar otro aviso.
 */
export async function barrerImpagos(admin: SupabaseClient, stripe: Stripe | null, ahora = new Date()): Promise<ResumenBarrido> {
  const resumen: ResumenBarrido = { revisados: 0, avisos: 0, escalados: 0, cerrados: 0, fallos: 0 };
  const politica = await leerPoliticaGuardada(admin);
  const { data, error } = await admin.from('billing_incidentes_pago').select(COLUMNAS_INCIDENTE)
    .in('estado', ['ABIERTO', 'ESCALADO']).order('abierto_en').limit(200);
  if (error) throw new Error(`incidentes: ${error.message}`);

  for (const inc of (data ?? []) as IncidenteFila[]) {
    resumen.revisados++;
    try {
      const toca = avisoPendiente({ abiertoEn: inc.abierto_en, avisos: inc.avisos ?? [] }, ahora, politica) !== null;
      if (toca && stripe) {
        const factura = await stripe.invoices.retrieve(inc.stripe_invoice_id);
        if (factura.status === 'paid' || factura.status === 'void' || factura.status === 'uncollectible') {
          const pagada = factura.status === 'paid';
          await admin.rpc('billing_cerrar_incidente', {
            p_stripe_invoice_id: inc.stripe_invoice_id, p_en: ahora.toISOString(), p_estado: pagada ? 'RECUPERADO' : 'CANCELADO',
          });
          if (pagada) await avisarRecuperacion(admin, inc);
          resumen.cerrados++;
          continue;
        }
      }
      const r = await avisarSiToca(admin, inc, ahora, politica);
      if (r === 'enviado') resumen.avisos++;
      if (r === 'no_se_pudo_enviar') resumen.fallos++;
      const actual = await leerIncidente(admin, inc.stripe_invoice_id);
      if (actual && debeEscalar({ estado: actual.estado, avisos: actual.avisos ?? [] }, politica)) {
        const { data: ok } = await admin.rpc('billing_escalar_incidente', { p_stripe_invoice_id: inc.stripe_invoice_id });
        if (ok) {
          resumen.escalados++;
          Sentry.captureMessage('[billing] impago escalado: ya se han mandado todos los avisos', {
            level: 'warning', tags: { area: 'billing', tipo: 'impago-escalado' },
            extra: { invoiceId: inc.stripe_invoice_id, studioId: inc.studio_id, cadenaId: inc.cadena_id },
          });
        }
      }
    } catch (err) {
      resumen.fallos++;
      Sentry.captureException(err, { tags: { area: 'billing', tipo: 'impago-barrido' }, extra: { invoiceId: inc.stripe_invoice_id } });
    }
  }
  return resumen;
}
