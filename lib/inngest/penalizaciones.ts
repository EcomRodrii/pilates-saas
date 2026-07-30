// ─────────────────────────────────────────────────────────────────────────────
// Fase 3: recoge las filas `penalizaciones` en estado DETECTADA (insertadas
// por cancelar_reserva_plaza y por el trigger de no-show, dentro de la misma
// transacción que cancela la reserva) y decide: crear el recibo y cobrar ya
// (modo automático), o dejarlo esperando aprobación manual (modo por
// defecto). Sin fan-out por estudio — igual que reservas-pendientes.ts/
// lista-espera-ofertas.ts: query global, nada caro que decidir por estudio.
//
// Cadencia cada 10 min: no es una guardia de seguridad (nadie puede "hacer
// trampa" esperando), así que no necesita el minuto a minuto de Fase 2a —
// pero tampoco tan relajada como Fase 2b, porque aquí hay dinero de por
// medio y cuanto antes se sepa si hace falta aprobación manual, mejor.
// ─────────────────────────────────────────────────────────────────────────────
import { inngest } from './client';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { cobrarReciboOffSession } from '@/lib/billing/stripe-cobros';
import {
  terminosServicioPorDefecto, politicaPrivacidadPorDefecto, textoLegalCompleto,
} from '@/lib/legal-textos';
import { uid } from '@/lib/utils';
import type { SupabaseClient } from '@supabase/supabase-js';

async function procesarUna(admin: SupabaseClient, pen: { id: string; studio_id: string; socio_id: string; reserva_id: string; tipo: string; importe: number }) {
  const marcar = (estado: string) =>
    admin.from('penalizaciones').update({ estado, procesada_en: new Date().toISOString() }).eq('id', pen.id);

  const { data: studio } = await admin
    .from('studios')
    .select(`
      id, nombre, razon_social, nif, direccion, ciudad, codigo_postal, email,
      cancelacion_ventana_horas, penalizacion_importe_eur, penalizacion_cobro_automatico,
      stripe_account_id, suspendido_en, politica_privacidad, terminos_servicio
    `)
    .eq('id', pen.studio_id).maybeSingle();
  if (!studio || studio.suspendido_en) return; // estudio suspendido: no se persigue cobro en su nombre

  // Guard de Stripe Connect: sin cuenta conectada no hay a quién cobrar. NO se
  // marca omitida — cuando el estudio conecte Stripe, el próximo barrido la
  // recoge; evita un recibo PENDIENTE fantasma que nunca podría cobrarse.
  if (!studio.stripe_account_id) return;

  const { data: socio } = await admin
    .from('socios')
    .select('id, nombre, email, stripe_customer_id, stripe_payment_method_id, aceptacion_version')
    .eq('id', pen.socio_id).maybeSingle();
  if (!socio) { await marcar('FALLIDA'); return; }

  // Guard de consentimiento (§7 del plan): AceptacionContrato.versionTexto es
  // el TEXTO COMPLETO que la socia aceptó, no un número de versión — se
  // compara contra el texto vigente hoy. Si no coincide (cambió, o nunca
  // aceptó ninguno), no hay consentimiento vigente para este cargo.
  const datosLegales = {
    nombre: studio.nombre, razonSocial: studio.razon_social, nif: studio.nif,
    direccion: studio.direccion, ciudad: studio.ciudad, codigoPostal: studio.codigo_postal,
    email: studio.email, cancelacionVentanaHoras: studio.cancelacion_ventana_horas,
    penalizacionImporteEur: studio.penalizacion_importe_eur,
  };
  const textoVigente = textoLegalCompleto({
    politicaPrivacidad: studio.politica_privacidad ?? politicaPrivacidadPorDefecto(datosLegales),
    terminosServicio: studio.terminos_servicio ?? terminosServicioPorDefecto(datosLegales),
  });
  if (socio.aceptacion_version !== textoVigente) {
    await marcar('OMITIDA_SIN_CONSENTIMIENTO');
    const { emitirPenalizacionBloqueada } = await import('@/lib/notifications/emit');
    await emitirPenalizacionBloqueada(admin, { studioId: pen.studio_id, socioId: pen.socio_id, motivo: 'consentimiento', importe: pen.importe, penalizacionId: pen.id });
    return;
  }

  // Guard de tarjeta (decisión de producto: silencioso, sin bloquear nada).
  if (!socio.stripe_customer_id || !socio.stripe_payment_method_id) {
    await marcar('OMITIDA_SIN_TARJETA');
    return;
  }

  // Guard de compensación: si esta reserva ya generó una recuperación (p.ej.
  // bajaConRecuperacion), no se cobra Y se quita la sesión a la vez sobre el
  // mismo hecho.
  const { data: recuperacion } = await admin
    .from('recuperaciones')
    .select('id').eq('origen_reserva_id', pen.reserva_id).neq('estado', 'ANULADA').maybeSingle();
  if (recuperacion) { await marcar('OMITIDA_COMPENSADA'); return; }

  // Nombre de la clase para el concepto del recibo.
  const { data: reserva } = await admin.from('reservas').select('sesion_id').eq('id', pen.reserva_id).maybeSingle();
  const { data: sesion } = reserva?.sesion_id
    ? await admin.from('sesiones').select('tipo_clase_id').eq('id', reserva.sesion_id).maybeSingle()
    : { data: null };
  const { data: tipo } = sesion?.tipo_clase_id
    ? await admin.from('tipos_clase').select('nombre').eq('id', sesion.tipo_clase_id).maybeSingle()
    : { data: null };
  const nombreClase = tipo?.nombre ?? 'la clase';
  const motivo = pen.tipo === 'NO_SHOW' ? 'no presentada' : 'cancelación tardía';

  const reciboId = `rec-penaliz-${uid()}`;
  const hoy = new Date().toISOString().slice(0, 10);
  const { error: errRecibo } = await admin.from('recibos').insert({
    id: reciboId, studio_id: pen.studio_id, socio_id: pen.socio_id, suscripcion_id: null,
    concepto: `Penalización — ${motivo}: ${nombreClase}`, importe: pen.importe, estado: 'PENDIENTE',
    fecha_vencimiento: hoy, fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0,
  });
  if (errRecibo) { console.error('[penalizaciones] insert recibo', errRecibo.message); return; }

  const automatico = studio.penalizacion_cobro_automatico === true;
  await admin.from('penalizaciones').update({
    recibo_id: reciboId,
    estado: automatico ? 'RECIBO_CREADO' : 'PENDIENTE_APROBACION',
  }).eq('id', pen.id);

  if (automatico) {
    const resultado = await cobrarReciboOffSession({ reciboId, socioId: pen.socio_id, studioId: pen.studio_id });
    // COBRADO_SIN_PERSISTIR: el dinero entró en Stripe pero el recibo no
    // quedó marcado — no es un éxito limpio, necesita reconciliación manual
    // (mismo criterio que app/api/stripe/charge-off-session/route.ts).
    const cobradaLimpio = resultado.ok && resultado.aviso !== 'COBRADO_SIN_PERSISTIR';
    await admin.from('penalizaciones').update({
      estado: cobradaLimpio ? 'COBRADA' : 'FALLIDA', procesada_en: new Date().toISOString(),
    }).eq('id', pen.id);
    if (cobradaLimpio) {
      const { emitirPagoPenalizacion } = await import('@/lib/notifications/emit');
      await emitirPagoPenalizacion(admin, { studioId: pen.studio_id, socioId: pen.socio_id, importe: pen.importe, penalizacionId: pen.id });
    }
    // Si falla, no reintentar aquí: el recibo ya nació PENDIENTE con los
    // mismos campos que cualquier otro, hereda el dunning gratis.
  }
}

export const penalizacionesDispatcher = inngest.createFunction(
  { id: 'penalizaciones-procesar', triggers: [{ cron: '*/10 * * * *' }] },
  async ({ step }) => {
    return step.run('procesar', async () => {
      const admin = getSupabaseAdmin();
      if (!admin) return { skipped: 'sin service-role' };
      const { data: pendientes } = await admin
        .from('penalizaciones')
        .select('id, studio_id, socio_id, reserva_id, tipo, importe')
        .eq('estado', 'DETECTADA')
        .limit(200);
      if (!pendientes?.length) return { procesadas: 0 };
      for (const pen of pendientes) {
        await procesarUna(admin, pen as never);
      }
      return { procesadas: pendientes.length };
    });
  },
);
