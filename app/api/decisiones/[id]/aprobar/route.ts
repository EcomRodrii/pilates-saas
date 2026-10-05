import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { dbGetRecomendacion, dbTransicionarRecomendacion } from '@/lib/decision/db';
import { comprobarAprobacion } from '@/lib/decision/efecto-aprobar';
import { canalesDeSocias } from '@/lib/decision/canales-socia';
import { bloqueoPorPlan } from '@/lib/decision/plan-servidor';
import { lecturaFallida, transicionFallida } from '@/lib/decision/respuesta-transicion';
import { inngest, EVENTS } from '@/lib/inngest/client';

// POST /api/decisiones/[id]/aprobar — transición condicional PENDIENTE→APROBADA
// (doble-clic-seguro, DECISION-OS-ARQUITECTURA.md §7) + encola la ejecución.
// Lo que hace la ejecución según la recomendación (cobrar, mandarle un mensaje
// a la socia o solo marcarla) lo dice el botón: lib/decision/efecto-aprobar.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const sinPlan = await bloqueoPorPlan(sesion.studioId);
  if (sinPlan) return sinPlan;

  const { id } = await params;

  const recomendacion = await dbGetRecomendacion(id);
  if (recomendacion === undefined) return lecturaFallida();
  if (!recomendacion) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  if (recomendacion.studioId !== sesion.studioId) {
    return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  }

  // El botón dijo lo que iba a pasar y la pantalla lo manda (`efecto`, y en un
  // cobro los `reciboIds` que enseñaba la tarjeta). Si la recomendación ya no
  // hace eso, o ya no cobra esos recibos, 409 y a recargar
  // (`comprobarAprobacion`): nada se cobra ni se envía sin que el botón lo haya
  // dicho. Los canales de la socia, los de ahora.
  const cuerpo: unknown = await req.json().catch(() => null);
  const canales = await canalesDeSocias(sesion.studioId, [recomendacion]);
  const comprobacion = comprobarAprobacion(recomendacion, cuerpo, canales(recomendacion));
  if (!comprobacion.ok) return NextResponse.json({ error: comprobacion.error }, { status: 409 });
  const { efecto, reciboIds } = comprobacion;

  const resultado = await dbTransicionarRecomendacion(id, sesion.studioId, 'PENDIENTE', 'APROBADA', {
    resueltoPor: sesion.userId,
    resueltoEn: new Date().toISOString(),
  });
  if (!resultado.ok) return transicionFallida(resultado);

  // La transición de arriba ya la dejó APROBADA. Si el encolado falla (Inngest
  // caído, la clave rotada) y no se deshace, se queda aprobada para siempre sin
  // que nadie la ejecute: un cobro que no se cobra nunca mientras la pantalla
  // dice que está en marcha, y el motor sin poder volver a proponerlo, porque
  // `dbUpsertRecomendacion` no toca una APROBADA con la misma dedupe. Volver a
  // PENDIENTE le da la salida: el error de verdad y el botón otra vez. Mismo
  // patrón que el envío de una campaña (app/api/marketing/campanas/[id]/enviar).
  try {
    // El efecto y los recibos van en el evento: el ejecutor no hace más de lo
    // que se acaba de comprobar, aunque la fila cambiara entre esta comprobación
    // y la transición (lib/inngest/decision.ts, `recibosACobrar`).
    await inngest.send({
      name: EVENTS.DECISION_APPROVED,
      data: { recomendacionId: id, efecto, ...(reciboIds ? { reciboIds } : {}) },
    });
  } catch (e) {
    const vuelta = await dbTransicionarRecomendacion(id, sesion.studioId, 'APROBADA', 'PENDIENTE', { resueltoPor: null, resueltoEn: null });
    // `vueltaAtras: 'fallida'` es la que se queda APROBADA sin nadie que la
    // ejecute (el envío y la vuelta atrás fallaron los dos): hay que mirarla.
    Sentry.captureException(e instanceof Error ? e : new Error('decisiones aprobar: encolado'), {
      level: 'error', tags: { area: 'decision-os' },
      extra: { recomendacionId: id, studioId: sesion.studioId, vueltaAtras: vuelta.ok ? 'PENDIENTE' : vuelta.noEstaba ? 'ya-cerrada' : 'fallida' },
    });
    // El envío pudo dar error con el evento ya dentro (un timeout después de
    // entregarlo): si ya no estaba APROBADA es que el ejecutor la tomó y la
    // cerró. Decir «no se ha podido poner en marcha» sería falso —se ejecutó—, y
    // volver a enseñar el botón invitaría a repetirlo. Un 200: la pantalla la da
    // por aprobada y pregunta cómo ha terminado (/estado).
    if (!vuelta.ok && vuelta.noEstaba) return NextResponse.json({ estado: 'APROBADA' });
    return NextResponse.json({ error: 'No se ha podido poner en marcha. Vuelve a intentarlo en un momento.' }, { status: 503 });
  }

  return NextResponse.json({ estado: 'APROBADA' });
}
