import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { crearReservaMostrador } from '@/lib/db/supabase-data-admin';
import { leerPeticionReservaMostrador, MENSAJE_PANEL_VIEJO, puedeApuntarEnClase, puedeVenderClaseSuelta } from '@/lib/reservas/reserva-mostrador';
import { MENSAJE_RESERVA_RPC } from '@/lib/reservas/errores-rpc';
import { registrarAuditoriaServidor } from '@/lib/auditoria/registrar-servidor';

export const dynamic = 'force-dynamic';

// El mostrador apunta a una clienta a una clase desde el panel. Antes el
// navegador llamaba a `reservar_plaza` directo; ahora la reserva, el bono, los
// créditos y el aviso a la alumna los hace el servidor (`crearReservaMostrador`).
//
// El estudio SIEMPRE sale de la sesión de staff, nunca del body — mismo
// criterio que el resto de rutas de `app/api/reservas/`.
//
// Autorización: con service-role la guardia de rol de la RPC no corre
// (`es_llamada_servicio()`), así que se comprueba aquí. Solo quien gestiona el
// calendario: la instructora ya no apunta clientas desde el panel.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const peticion = leerPeticionReservaMostrador(await req.json().catch(() => null));
  if (!peticion.ok) return NextResponse.json({ error: peticion.error }, { status: 400 });
  const { sesionId, socioId, reservaId, avisar, comoClaseSuelta, claseSuelta } = peticion.datos;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  if (!puedeApuntarEnClase(sesion.rol)) {
    return NextResponse.json({ error: MENSAJE_RESERVA_RPC.NO_AUTORIZADO }, { status: 403 });
  }
  // Vender la clase suelta crea un recibo que luego se cobra: hace falta poder
  // mover dinero. La pantalla ya lo esconde; la cerradura es esta.
  if (claseSuelta && !puedeVenderClaseSuelta(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede cobrar clases sueltas.' }, { status: 403 });
  }
  // Una pestaña abierta con el panel de antes (#2467) cobraba la clase suelta
  // como un recibo aparte y sin política de cancelación. Con el servidor nuevo
  // sus avisos al quitar o al cambiar de plan ya no dicen la verdad: que recargue.
  if (comoClaseSuelta && !claseSuelta) {
    return NextResponse.json({ error: MENSAJE_PANEL_VIEJO }, { status: 409 });
  }

  const { data: sesionRow } = await admin
    .from('sesiones').select('id')
    .eq('id', sesionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (!sesionRow) return NextResponse.json({ error: MENSAJE_RESERVA_RPC.SESION_NO_ENCONTRADA }, { status: 404 });

  const r = await crearReservaMostrador({
    studioId: sesion.studioId, sesionId, socioId, reservaId, avisarSocia: avisar, claseSuelta,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.error, ...(r.reciboPendiente ? { reciboPendiente: true } : {}) }, { status: r.status });
  }
  // La venta la escribe el servidor (service-role): el trigger del libro no la
  // ve. Queda anotado quién le vendió la clase suelta —también a crédito, con
  // «Cóbraselo después»—; el cobro lo anota después `marcar-cobrado`. Solo la
  // de esta petición: un reintento o la de un intento anterior ya lo están.
  if (r.venta && !r.repetida) {
    await registrarAuditoriaServidor(admin, {
      sesion, tabla: 'recibos', filaId: r.venta.reciboId, operacion: 'INSERT', socioId,
      despues: { importe: r.venta.importe, estado: 'PENDIENTE' },
      contexto: { accion: 'CLASE_SUELTA_VENDIDA', concepto: r.venta.concepto },
    });
  }
  return NextResponse.json(r);
}
