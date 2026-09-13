import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { ejecutarCancelacionReserva } from '@/lib/db/supabase-data-admin';
import { comprobarModoStripe } from '@/lib/billing/modo-stripe';
import { VINCULOS_CUENTA, decidirBorradoCuenta, type RecuentoVinculos } from '@/lib/socios/borrado-cuenta';
import {
  avisoPendientes, conReintentos, cuentaYaNoExiste, stripeYaNoExiste, type TerceroPendiente,
} from '@/lib/socios/terceros-supresion';

// Supresión RGPD (art. 17) de una socia, con RETENCIÓN FISCAL.
//
// Decisión de producto cerrada: se borra o anonimiza TODO menos lo fiscal
// (recibos, facturas, ventas, devoluciones, pagos históricos, que se conservan
// seudonimizados por `socio_id`), incluida su cuenta de acceso si no tiene más
// vínculos y su cliente en la cuenta Stripe del estudio. Qué pasa con cada tabla:
// `lib/socios/supresion-clasificacion.ts` (con test de cobertura).
//
// H-2 (auditoría RGPD 13-sep): esta ruta limpiaba 8 tablas y dejaba ~30 con su
// nombre, su firma, notificaciones, logs, IBAN, créditos, la cuenta de
// auth.users y el cliente de Stripe. Ahora el grueso vive en UNA transacción
// (`anonimizar_socio`) y aquí queda solo lo que no cabe en ella.
//
// Orden, y por qué:
//   1. Storage de `documentos_socio` ANTES que sus filas: si falla, 500 y las
//      filas se quedan para reintentar; al revés el objeto quedaría colgando sin
//      nada que lo encuentre (I-14).
//   2. Reservas FUTURAS canceladas ANTES de anonimizar (F-3): el núcleo
//      `ejecutarCancelacionReserva` promociona la lista de espera y avisa con el
//      nombre de quien libera la plaza. `omitirPenalizacion`: ella no pulsó
//      cancelar. Best-effort: una carrera no bloquea la baja.
//   3. Avatar del bucket PÚBLICO `avatars` (la ruta del objeto es el socioId a
//      pelo). Best-effort.
//   4. `anonimizar_socio` (RPC, service_role): borra/anonimiza y registra la fila
//      en `supresiones`. Si falla, 500 y no se ha tocado ningún tercero.
//   5. Terceros, FUERA de la transacción, con 3 intentos cada uno:
//      a) cliente de Stripe en la cuenta conectada del estudio (respetando
//         lib/billing/modo-stripe.ts). Borrar el cliente cancela también sus
//         suscripciones de Stripe;
//      b) cuenta de auth.users, SOLO si no le queda ningún otro vínculo
//         (`decidirBorradoCuenta`, fail-closed).
//      Lo que falle se guarda en `supresiones.terceros_pendientes` y la respuesta
//      lo dice (`completa: false`, `aviso`). Volver a llamar a esta ruta sobre
//      una socia ya suprimida reaplica la función y reintenta los pendientes.
//
// Se CONSERVA `lecturas_ficha_salud` (quién del estudio leyó su ficha y cuándo):
// es trazabilidad del acceso del staff. ⚠️ Pendiente de revisión legal su plazo.
// Solo PROPIETARIO/RECEPCIÓN/MANAGER del propio estudio.

const STRIPE_SIN_CONFIGURAR = 'sk_test_XXXX';

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para dar de baja a una socia' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { socioId?: unknown } | null;
  const socioId = typeof body?.socioId === 'string' ? body.socioId : null;
  if (!socioId) return NextResponse.json({ error: 'Falta el socioId' }, { status: 400 });

  // La socia debe existir y ser de este estudio (autoridad: el JWT, no el body).
  // Cuenta y cliente de Stripe se leen AQUÍ: la función los pone a NULL.
  const { data: socia, error: errLeer } = await admin
    .from('socios')
    .select('id, studio_id, borrado_en, auth_user_id, stripe_customer_id')
    .eq('id', socioId)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se pudo leer la socia' }, { status: 500 });
  if (!socia) return NextResponse.json({ error: 'Socia no encontrada' }, { status: 404 });

  // Ya suprimida: reaplicar es idempotente (y completa bajas anteriores a la
  // función); lo único pendiente pueden ser terceros que fallaron.
  if (socia.borrado_en) {
    const { data: supresion } = await admin
      .from('supresiones').select('terceros_pendientes')
      .eq('studio_id', sesion.studioId).eq('socio_id', socioId).maybeSingle();
    const previos = Array.isArray(supresion?.terceros_pendientes)
      ? (supresion.terceros_pendientes as TerceroPendiente[]) : [];

    const { error: errRpc } = await admin.rpc('anonimizar_socio', {
      p_studio_id: sesion.studioId, p_socio_id: socioId, p_ejecutada_por: sesion.userId, p_origen: 'panel',
    });
    if (errRpc) {
      console.error('[socios/eliminar] anonimizar_socio (reaplicar) falló', errRpc);
      return NextResponse.json({ error: 'No se pudo completar la supresión' }, { status: 500 });
    }
    if (previos.length === 0) return NextResponse.json({ ok: true, yaEstaba: true, completa: true });

    const pendientes: TerceroPendiente[] = [];
    for (const p of previos) {
      const r = p.tercero === 'stripe_customer'
        ? await borrarClienteStripe(admin, sesion.studioId, p.ref, p.cuenta ?? null)
        : (await borrarCuentaSiQuedaSuelta(admin, p.ref)).pendiente;
      if (r) pendientes.push(r);
    }
    await guardarPendientes(admin, sesion.studioId, socioId, pendientes);
    return respuesta(pendientes, { yaEstaba: true });
  }

  // 1) Documentos: objetos de Storage primero. Las filas las borra la función.
  const { data: documentos, error: errDocsLeer } = await admin
    .from('documentos_socio').select('storage_path')
    .eq('socio_id', socioId).eq('studio_id', sesion.studioId);
  if (errDocsLeer) return NextResponse.json({ error: 'No se pudieron leer los documentos' }, { status: 500 });
  if (documentos && documentos.length > 0) {
    const { error: errStorage } = await admin.storage
      .from('documentos-socio')
      .remove(documentos.map(d => d.storage_path as string));
    if (errStorage) return NextResponse.json({ error: 'No se pudieron borrar los documentos del almacenamiento' }, { status: 500 });
  }

  // 2) Reservas futuras, antes de anonimizar (ver cabecera). Secuencial a
  //    propósito: cada cancelación puede promocionar a la siguiente de la cola.
  const { data: reservasFuturas, error: errReservasLeer } = await admin
    .from('reservas')
    .select('id, sesiones!inner(inicio)')
    .eq('socio_id', socioId)
    .eq('studio_id', sesion.studioId)
    .in('estado', ['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION'])
    .gt('sesiones.inicio', new Date().toISOString());
  if (errReservasLeer) return NextResponse.json({ error: 'No se pudieron leer sus reservas' }, { status: 500 });
  for (const r of reservasFuturas ?? []) {
    const res = await ejecutarCancelacionReserva(admin, {
      studioId: sesion.studioId, reservaId: r.id as string, socioId, omitirPenalizacion: true,
      // D-1: nadie va a canjear una recuperación de una cuenta que se suprime.
      otorgarRecuperacionPlazaFija: false,
    });
    if ('error' in res) {
      console.error('[socios/eliminar] no se pudo cancelar una reserva futura', socioId, r.id, res.error);
    }
  }

  // 3) La foto, del almacenamiento y no solo de la columna (bucket público).
  const { error: errFoto } = await admin.storage.from('avatars').remove([socioId]);
  if (errFoto) console.error('[socios:eliminar] no se pudo borrar el avatar', errFoto);

  // 4) La supresión en sí, en una transacción.
  const { data: resumen, error: errRpc } = await admin.rpc('anonimizar_socio', {
    p_studio_id: sesion.studioId, p_socio_id: socioId, p_ejecutada_por: sesion.userId, p_origen: 'panel',
  });
  if (errRpc) {
    console.error('[socios/eliminar] anonimizar_socio falló', errRpc);
    return NextResponse.json({ error: 'No se pudo completar la supresión de la socia' }, { status: 500 });
  }
  const mandatoSepaRetenido = (resumen as { mandato_sepa_retenido?: unknown } | null)?.mandato_sepa_retenido === true;

  // 5) Terceros.
  const pendientes: TerceroPendiente[] = [];
  if (socia.stripe_customer_id) {
    const p = await borrarClienteStripe(admin, sesion.studioId, socia.stripe_customer_id as string, null);
    if (p) pendientes.push(p);
  }
  let cuentaConservada = false;
  if (socia.auth_user_id) {
    const r = await borrarCuentaSiQuedaSuelta(admin, socia.auth_user_id as string);
    if (r.pendiente) pendientes.push(r.pendiente);
    cuentaConservada = r.conservada;
  }
  await guardarPendientes(admin, sesion.studioId, socioId, pendientes);

  return respuesta(pendientes, { cuentaConservada, mandatoSepaRetenido });
}

function respuesta(pendientes: TerceroPendiente[], extra: Record<string, unknown>) {
  return NextResponse.json({
    ok: true,
    ...extra,
    completa: pendientes.length === 0,
    pendientes: pendientes.map(p => ({ tercero: p.tercero, motivo: p.motivo })),
    aviso: avisoPendientes(pendientes),
  });
}

async function guardarPendientes(admin: SupabaseClient, studioId: string, socioId: string, pendientes: TerceroPendiente[]) {
  const { error } = await admin
    .from('supresiones')
    .update({ terceros_pendientes: pendientes })
    .eq('studio_id', studioId)
    .eq('socio_id', socioId);
  // No se oculta al panel: la respuesta ya lleva los pendientes. Pero sin la
  // fila actualizada nadie los reintentará, así que va a los logs.
  if (error) console.error('[socios/eliminar] no se pudieron registrar los terceros pendientes', socioId, error);
}

async function borrarClienteStripe(
  admin: SupabaseClient, studioId: string, customerId: string, cuentaGuardada: string | null,
): Promise<TerceroPendiente | null> {
  const pendiente = (motivo: string, cuenta: string | null): TerceroPendiente => ({
    tercero: 'stripe_customer', ref: customerId, cuenta, motivo, en: new Date().toISOString(),
  });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.startsWith(STRIPE_SIN_CONFIGURAR)) return pendiente('Stripe no está configurado en el servidor', cuentaGuardada);
  // Una clave live fuera de producción no borra clientes reales, igual que no cobra.
  const modo = comprobarModoStripe();
  if (!modo.puedeCobrar) return pendiente(modo.motivo ?? 'Modo de Stripe no permitido en este entorno', cuentaGuardada);

  let cuenta = cuentaGuardada;
  if (!cuenta) {
    const { data: estudio, error } = await admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle();
    if (error) return pendiente('No se pudo leer la cuenta de Stripe del estudio', null);
    cuenta = (estudio?.stripe_account_id as string | null) ?? null;
  }
  // Los clientes viven en la cuenta del estudio (Connect Standard): sin ella no
  // hay dónde borrarlo, y borrar en la plataforma no alcanzaría el correcto.
  if (!cuenta) return pendiente('El estudio no tiene cuenta de Stripe conectada', null);

  const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
  const r = await conReintentos(async () => {
    try {
      await stripe.customers.del(customerId, { stripeAccount: cuenta });
    } catch (e) {
      if (!stripeYaNoExiste(e)) throw e;
    }
  });
  if (!r.ok) {
    console.error('[socios/eliminar] no se pudo borrar el cliente de Stripe', r.error);
    return pendiente(`Stripe: ${r.error}`, cuenta);
  }
  return null;
}

async function borrarCuentaSiQuedaSuelta(
  admin: SupabaseClient, authUserId: string,
): Promise<{ pendiente: TerceroPendiente | null; conservada: boolean }> {
  const pendiente = (motivo: string): TerceroPendiente => ({
    tercero: 'cuenta_acceso', ref: authUserId, motivo, en: new Date().toISOString(),
  });

  const recuento: RecuentoVinculos = {};
  await Promise.all(VINCULOS_CUENTA.map(async v => {
    const { count, error } = await admin
      .from(v.tabla).select(v.columna, { count: 'exact', head: true }).eq(v.columna, authUserId);
    recuento[v.clave] = error ? null : (count ?? null);
  }));

  const decision = decidirBorradoCuenta(recuento);
  if (!decision.borrar) {
    // Con otros vínculos la cuenta se conserva a propósito: no es un pendiente.
    if (decision.motivo === 'tiene_vinculos') return { pendiente: null, conservada: true };
    return { pendiente: pendiente(`No se pudieron comprobar sus otros vínculos (${decision.sinComprobar.join(', ')})`), conservada: false };
  }

  const r = await conReintentos(async () => {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error && !cuentaYaNoExiste(error)) throw error;
  });
  if (!r.ok) {
    console.error('[socios/eliminar] no se pudo borrar la cuenta de acceso', r.error);
    return { pendiente: pendiente(`Cuenta: ${r.error}`), conservada: false };
  }
  return { pendiente: null, conservada: false };
}
