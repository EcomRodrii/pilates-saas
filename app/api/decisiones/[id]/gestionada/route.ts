import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { inngest, EVENTS } from '@/lib/inngest/client';
import { dbGetRecomendacion, dbTransicionarRecomendacion, dbInsertOutcome, dbLogActividadReciente } from '@/lib/decision/db';
import { admiteYaContactada, efectoAlAprobar } from '@/lib/decision/efecto-aprobar';
import { canalesDeSocias } from '@/lib/decision/canales-socia';
import { bloqueoPorPlan } from '@/lib/decision/plan-servidor';
import { lecturaFallida, transicionFallida } from '@/lib/decision/respuesta-transicion';
import { ventanaDiasDe } from '@/lib/decision/outcomes';

// POST /api/decisiones/[id]/gestionada — «Ya la he contactado». La propietaria
// ya le ha escrito o la ha llamado por su cuenta (el botón de WhatsApp de la
// tarjeta, una llamada), y «Enviarle el mensaje» le mandaría OTRO. Aquí no se
// aprueba nada ni se dispara el ejecutor (DECISION_APPROVED): la recomendación
// pasa de PENDIENTE a EJECUTADA, firmada por ella.
//
// EJECUTADA es lo que de verdad pasó: la siguió. Así cuenta como seguida para el
// Umbral (`dbCalcularSeguimientoPorTipo`), entra en cooldown como cualquier otra
// ejecutada (`enCooldown`, prioridad.ts) y se mide igual que si el mensaje lo
// hubiera mandado Tentare: si la socia vuelve, Actividad lo dice («Seguiste
// esto: … Funcionó.»).
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
  // Solo donde aprobar le escribiría a la socia, con el mismo criterio que el
  // botón (canales de ahora incluidos). Un cobro no se da por hecho sin
  // cobrarlo: quedaría EJECUTADO sin que haya entrado un euro.
  const canales = await canalesDeSocias(sesion.studioId, [recomendacion]);
  const efecto = efectoAlAprobar(recomendacion, canales(recomendacion));
  if (!admiteYaContactada(efecto)) {
    return NextResponse.json({
      error: efecto === 'COBRAR'
        ? 'Un cobro no se puede dar por hecho sin cobrarlo.'
        : 'Aprobarla no le envía nada a la clienta: márcala con «Hecho».',
    }, { status: 409 });
  }

  const resueltoEn = new Date().toISOString();
  const resultado = await dbTransicionarRecomendacion(id, sesion.studioId, 'PENDIENTE', 'EJECUTADA', {
    resueltoPor: sesion.userId,
    resueltoEn,
  });
  if (!resultado.ok) return transicionFallida(resultado);

  // A partir de aquí la transición ya es un hecho y nada puede deshacerla, así
  // que nada de lo que sigue tumba la respuesta: el outcome y la línea de
  // Actividad informan y avisan a Sentry por su cuenta, y la medición, si no se
  // puede encolar, se pierde sin más (el outcome se queda sin medir).
  await dbInsertOutcome({
    studioId: recomendacion.studioId, recomendacionId: id, evento: 'EJECUTADA', outcome: 'PENDIENTE',
    senalObservada: null, ventanaDias: ventanaDiasDe(recomendacion.tipo), medidoEn: null,
    impactoReal: null, confianzaMedicion: null, // lo rellena medirOutcomeFn al cerrar la ventana
  });
  try {
    await inngest.send({ name: EVENTS.DECISION_MEASURE, data: { recomendacionId: id } });
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error('decisiones gestionada: medición'), {
      level: 'warning', tags: { area: 'decision-os' }, extra: { recomendacionId: id },
    });
  }

  await dbLogActividadReciente({
    studioId: recomendacion.studioId, tipo: 'DECISION_GESTIONADA',
    texto: `La contactaste tú: ${recomendacion.titulo}`, socioId: recomendacion.socioId,
    origen: 'EQUIPO', // la contactó la propietaria; Tentare no le mandó nada
  });

  return NextResponse.json({ estado: 'EJECUTADA' });
}
