import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { confirmarCobro } from '@/lib/billing/confirmar-cobro';
import { facturaIdManual } from '@/lib/billing/cobro-confirmado-reglas';
import {
  estadoHttpDeLote, parsearPeticionMarcarCobrado, penalizacionesDeLosRecibos, recibosDePenalizacionAnulada,
  resultadoDeConfirmacion, resultadoDeExcepcion, resultadoPenalizacionAnulada,
  type ResultadoReciboMarcado,
} from '@/lib/cobros/marcar-cobrado';

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

  const cuerpo = await req.json().catch(() => null);
  const parseo = parsearPeticionMarcarCobrado(cuerpo);
  if (!parseo.ok) return NextResponse.json({ error: parseo.error }, { status: 400 });
  const { peticion } = parseo;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const anulados = await bloqueadosPorPenalizacion(admin, sesion.studioId, peticion.reciboIds);

  const resultados: ResultadoReciboMarcado[] = [];
  for (const reciboId of peticion.reciboIds) {
    if (anulados.has(reciboId)) {
      resultados.push(resultadoPenalizacionAnulada(reciboId));
      continue;
    }
    try {
      const r = await confirmarCobro(admin, {
        studioId: sesion.studioId,
        reciboId,
        metodo: peticion.metodo,
        origen: 'manual',
        paymentIntentId: null,
        avisarSocia: false,
        facturaId: facturaIdManual(reciboId),
        actor: { userId: sesion.userId, nombre: sesion.nombre },
      });
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

  return NextResponse.json({ resultados }, { status: estadoHttpDeLote(resultados) });
}
