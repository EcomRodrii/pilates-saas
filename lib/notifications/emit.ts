// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — emisores de dominio (server-only).
//
// Azúcar para que los módulos de negocio publiquen eventos en UNA línea sin
// preocuparse de reunir las variables de plantilla. Cada emisor reúne los datos
// de display (clase, cuándo, socia, importe…) y llama a NotificationEngine.publish.
// TODO best-effort: envuelto en try/catch; una notificación jamás rompe el negocio.
//
// (Optimización futura: mover la reunión de variables al worker de Inngest para
// aligerar aún más el hilo del request. Para miles/día esto ya es suficiente.)
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { publish } from './engine.ts';
import { EVENTOS } from './catalog.ts';

function cuandoLargo(iso: string): string {
  try {
    const d = new Date(iso);
    const dia = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
    const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
    return `${dia} a las ${hora}`;
  } catch { return ''; }
}

// Reúne los datos comunes de una sesión (clase, cuándo, sala, slug del estudio).
async function ctxSesion(admin: SupabaseClient, studioId: string, sesionId: string) {
  const { data: ses } = await admin.from('sesiones')
    .select('inicio, tipo_clase_id, sala_id').eq('id', sesionId).maybeSingle();
  const [{ data: tipo }, { data: studio }, { data: sala }] = await Promise.all([
    ses?.tipo_clase_id ? admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('studios').select('slug').eq('id', studioId).maybeSingle(),
    ses?.sala_id ? admin.from('salas').select('nombre').eq('id', ses.sala_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    clase: (tipo?.nombre as string | null) ?? 'tu clase',
    cuando: ses?.inicio ? cuandoLargo(ses.inicio as string) : '',
    slug: (studio?.slug as string | null) ?? '',
    sala: sala?.nombre ? ` en ${sala.nombre}` : '',
    sesionId,
  };
}

// Reserva creada: avisa a la socia (confirmada / lista de espera) y, si queda
// confirmada, a la propietaria (nueva inscripción).
export async function emitirReserva(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; socioId: string; estado: 'CONFIRMADA' | 'LISTA_ESPERA' },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: socio } = await admin.from('socios').select('nombre, apellidos').eq('id', p.socioId).maybeSingle();
    const socia = `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'Una clienta';
    const base = { ...ctx, socioId: p.socioId, socia };
    const dedup = `reserva:${p.sesionId}:${p.socioId}:${p.estado}`;

    if (p.estado === 'CONFIRMADA') {
      await publish({ type: EVENTOS.RESERVA_CONFIRMADA, studioId: p.studioId, data: base, resource: { type: 'sesion', id: p.sesionId }, dedupKey: dedup });
      await publish({ type: EVENTOS.RESERVA_CREADA, studioId: p.studioId, data: base, resource: { type: 'sesion', id: p.sesionId }, dedupKey: `${dedup}:owner` });
    } else {
      await publish({ type: EVENTOS.RESERVA_LISTA_ESPERA, studioId: p.studioId, data: base, resource: { type: 'sesion', id: p.sesionId }, dedupKey: dedup });
    }
  } catch (e) {
    console.error('[notifications] emitirReserva:', e instanceof Error ? e.message : e);
  }
}

// Plaza liberada: a la socia promovida de la lista de espera.
export async function emitirPlazaLiberada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; socioId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      type: EVENTOS.RESERVA_PLAZA_LIBERADA, studioId: p.studioId,
      data: { ...ctx, socioId: p.socioId }, resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `plaza-liberada:${p.sesionId}:${p.socioId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPlazaLiberada:', e instanceof Error ? e.message : e);
  }
}

// Pago fallido: a la propietaria y a la socia afectada.
export async function emitirPagoFallido(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<void> {
  try {
    const { data: recibo } = await admin.from('recibos')
      .select('concepto, importe, socio_id').eq('id', p.reciboId).maybeSingle();
    if (!recibo) return;
    const { data: socio } = recibo.socio_id
      ? await admin.from('socios').select('nombre, apellidos').eq('id', recibo.socio_id).maybeSingle()
      : { data: null };
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.PAGO_FALLIDO, studioId: p.studioId,
      data: {
        concepto: recibo.concepto ?? 'una cuota', importe: recibo.importe,
        socia: `${socio?.nombre ?? ''} ${socio?.apellidos ?? ''}`.trim() || 'una clienta',
        socioId: recibo.socio_id, slug: (studio?.slug as string | null) ?? '',
      },
      resource: { type: 'recibo', id: p.reciboId },
      dedupKey: `pago-fallido:${p.reciboId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPagoFallido:', e instanceof Error ? e.message : e);
  }
}

// Clase casi llena (≥90% del aforo): a la propietaria. Dirigido por evento (al
// crear una reserva), no por cron. Dedup por sesión → un aviso por clase.
export async function emitirClaseCasiLlena(
  admin: SupabaseClient, p: { studioId: string; sesionId: string },
): Promise<void> {
  try {
    const { data: ses } = await admin.from('sesiones').select('aforo_maximo').eq('id', p.sesionId).maybeSingle();
    const aforo = Number(ses?.aforo_maximo ?? 0);
    if (aforo <= 0) return;
    const { count } = await admin.from('reservas')
      .select('id', { count: 'exact', head: true })
      .eq('sesion_id', p.sesionId).eq('estado', 'CONFIRMADA');
    const ocupadas = count ?? 0;
    const pct = Math.round((ocupadas / aforo) * 100);
    if (pct < 90) return;
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      type: EVENTOS.CLASE_CASI_LLENA, studioId: p.studioId,
      data: { ...ctx, ocupadas, aforo, porcentaje: pct },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `casi-llena:${p.sesionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirClaseCasiLlena:', e instanceof Error ? e.message : e);
  }
}

// Clase cancelada: a cada socia apuntada. Lo usa la cancelación desde el
// calendario (vía ruta), además del flujo de sustituciones (avisarAlumnas).
export async function emitirClaseCancelada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      type: EVENTOS.CLASE_CANCELADA, studioId: p.studioId,
      data: { clase: ctx.clase, cuando: ctx.cuando, slug: ctx.slug },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `clase-cancelada:${p.sesionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirClaseCancelada:', e instanceof Error ? e.message : e);
  }
}

// Clase modificada (cambio de horario/sala) → socias apuntadas. Recibe los datos
// de display YA formateados desde el cliente (con los valores NUEVOS), para no
// depender de que la escritura optimista haya llegado a la BD al leer la sesión.
export async function emitirClaseModificada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; clase: string; cuando: string; sala: string },
): Promise<void> {
  try {
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.CLASE_MODIFICADA, studioId: p.studioId,
      data: { clase: p.clase, cuando: p.cuando, sala: p.sala, sesionId: p.sesionId, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `clase-modificada:${p.sesionId}:${p.cuando}:${p.sala}`,
    });
  } catch (e) {
    console.error('[notifications] emitirClaseModificada:', e instanceof Error ? e.message : e);
  }
}

// Pago realizado: a la socia (confirmación de cobro).
export async function emitirPagoRealizado(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<void> {
  try {
    const { data: recibo } = await admin.from('recibos')
      .select('concepto, importe, socio_id').eq('id', p.reciboId).maybeSingle();
    if (!recibo?.socio_id) return;
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.PAGO_REALIZADO, studioId: p.studioId,
      data: { concepto: recibo.concepto ?? 'tu cuota', importe: recibo.importe, socioId: recibo.socio_id, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'recibo', id: p.reciboId },
      dedupKey: `pago-ok:${p.reciboId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirPagoRealizado:', e instanceof Error ? e.message : e);
  }
}

// Bono agotado: a la socia (ha usado la última sesión → renovar).
export async function emitirBonoAgotado(
  admin: SupabaseClient, p: { studioId: string; socioId: string; plan: string; suscripcionId: string },
): Promise<void> {
  try {
    const { data: studio } = await admin.from('studios').select('slug').eq('id', p.studioId).maybeSingle();
    await publish({
      type: EVENTOS.BONO_AGOTADO, studioId: p.studioId,
      data: { plan: p.plan, socioId: p.socioId, slug: (studio?.slug as string | null) ?? '' },
      resource: { type: 'suscripcion', id: p.suscripcionId },
      dedupKey: `bono-agotado:${p.suscripcionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirBonoAgotado:', e instanceof Error ? e.message : e);
  }
}

// La instructora avisa de que no puede dar una clase (baja desde su enlace):
// la dueña se entera al instante, no al abrir el panel.
export async function emitirInstructoraBaja(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; instructorId: string | null; motivo?: string | null; sustitucionId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: instr } = p.instructorId
      ? await admin.from('instructores').select('nombre').eq('id', p.instructorId).maybeSingle()
      : { data: null };
    await publish({
      type: EVENTOS.INSTRUCTORA_BAJA, studioId: p.studioId,
      data: {
        ...ctx,
        instructora: (instr?.nombre as string | null) ?? 'Una instructora',
        motivo: p.motivo ? ` (${p.motivo})` : '',
      },
      resource: { type: 'sustitucion', id: p.sustitucionId },
      dedupKey: `instructora-baja:${p.sustitucionId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirInstructoraBaja:', e instanceof Error ? e.message : e);
  }
}

// Sustitución rechazada: la candidata dice que no → la dueña debe elegir a otra.
export async function emitirSustitucionRechazada(
  admin: SupabaseClient,
  p: { studioId: string; sesionId: string; instructorId: string; sustitucionId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    const { data: instr } = await admin.from('instructores').select('nombre').eq('id', p.instructorId).maybeSingle();
    await publish({
      type: EVENTOS.SUSTITUCION_RECHAZADA, studioId: p.studioId,
      data: { ...ctx, instructora: (instr?.nombre as string | null) ?? 'Una instructora' },
      resource: { type: 'sustitucion', id: p.sustitucionId },
      dedupKey: `sustitucion-rechazada:${p.sustitucionId}:${p.instructorId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirSustitucionRechazada:', e instanceof Error ? e.message : e);
  }
}

// Stripe desconectado: se han parado los cobros → CRÍTICA para la dueña.
export async function emitirStripeDesconectado(
  admin: SupabaseClient, p: { studioId: string },
): Promise<void> {
  try {
    await publish({
      type: EVENTOS.SISTEMA_STRIPE_DESCONECTADO, studioId: p.studioId,
      data: {},
      resource: { type: 'studio', id: p.studioId },
      // Sin fecha en la clave: si se desconecta y reconecta varias veces, cada
      // desconexión debe volver a avisar → se usa el instante del evento.
      dedupKey: `stripe-off:${p.studioId}:${new Date().toISOString().slice(0, 13)}`,
    });
  } catch (e) {
    console.error('[notifications] emitirStripeDesconectado:', e instanceof Error ? e.message : e);
  }
}

// Los emails a clientas están fallando. Un aviso AL DÍA por estudio (dedupKey por
// fecha): el dato accionable es "hoy falla el correo", no 50 copias.
export async function emitirEmailFallido(
  admin: SupabaseClient, p: { studioId: string; error: string },
): Promise<void> {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    await publish({
      type: EVENTOS.SISTEMA_EMAIL_FALLIDO, studioId: p.studioId,
      data: { error: p.error.slice(0, 200) },
      dedupKey: `email-fallido:${p.studioId}:${hoy}`,
    });
  } catch (e) {
    console.error('[notifications] emitirEmailFallido:', e instanceof Error ? e.message : e);
  }
}

// Sustitución aceptada: a la instructora que cubre (nueva clase asignada).
export async function emitirSustitucionAceptada(
  admin: SupabaseClient, p: { studioId: string; sesionId: string; instructorId: string },
): Promise<void> {
  try {
    const ctx = await ctxSesion(admin, p.studioId, p.sesionId);
    await publish({
      type: EVENTOS.SUSTITUCION_ACEPTADA, studioId: p.studioId,
      data: { ...ctx, instructorId: p.instructorId }, resource: { type: 'sesion', id: p.sesionId },
      dedupKey: `sustitucion-aceptada:${p.sesionId}:${p.instructorId}`,
    });
  } catch (e) {
    console.error('[notifications] emitirSustitucionAceptada:', e instanceof Error ? e.message : e);
  }
}
