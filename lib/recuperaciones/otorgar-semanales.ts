// ─────────────────────────────────────────────────────────────────────────────
// Barrido semanal: reparte las recuperaciones de la semana que acaba de cerrar.
//
// «Profe, ¿puedo recuperar la del martes?» — la pregunta que se repite cincuenta
// veces al mes. Con esto la socia no tiene que pedirla: si canceló a tiempo y la
// semana se le fue sin poder recuperar el hueco, le aparece sola y ya puede
// gastarla ella (`reservar_plaza` consume una recuperación al toparse con el
// límite semanal — esa mitad ya existía).
//
// ⚠️ AL CERRAR LA SEMANA Y NO AL CANCELAR, y no es un capricho de arquitectura:
// cancelar YA libera el hueco de esa semana (`reservar_plaza` no cuenta las
// canceladas), así que dar la recuperación en el momento de cancelar le daría
// las dos cosas —el hueco liberado y una clase extra— por cada cancelación.
//
// ⚠️ SOLO PLANES CON LÍMITE SEMANAL. Una recuperación no sirve para otra cosa
// que saltarse ese límite: quien va con bono ya recupera sola (se le devuelve la
// sesión) y quien no tiene límite puede volver a reservar sin tope. Dárselas
// sería ocuparles el tope de 4 vivas con algo que no pueden gastar.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { mapPlanTarifa, mapSuscripcion, hidratarTiposDePlanes } from '@/lib/supabase-data';
import { planCubreTipoClase } from '@/lib/bono-logic.ts';
import { inicioDelDiaEstudio, finDelDiaEstudio, uid } from '@/lib/utils';
import { derechoDeRecuperaciones } from './derecho-semanal.ts';
import { semanaCerrada } from './otorgar-semanales-fechas.ts';

export { semanaCerrada };

export interface ResumenSemana {
  estudios: number;
  otorgadas: number;
  /** Detectadas pero no otorgadas: tope de 4 vivas, o ya existía una por esa reserva. */
  saltadas: number;
  semana: { desde: string; hasta: string };
}


export async function otorgarRecuperacionesSemanales(
  ahora: Date = new Date(),
): Promise<ResumenSemana | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Service role no configurada' };

  const semana = semanaCerrada(ahora);
  const desdeISO = inicioDelDiaEstudio(semana.desde);
  const hastaISO = finDelDiaEstudio(semana.hasta);
  const vacio: ResumenSemana = { estudios: 0, otorgadas: 0, saltadas: 0, semana };
  let estudiosMirados = 0;

  const { data: estudios } = await admin
    .from('studios').select('id').eq('recuperacion_auto_semanal', true);
  if (!estudios?.length) return vacio;

  let otorgadas = 0;
  let saltadas = 0;

  for (const est of estudios) {
    const studioId = est.id as string;
    estudiosMirados++;

    // Las sesiones de la semana, con su tipo de clase. Las canceladas por el
    // estudio se excluyen: ahí la compensación es otra (devolución de bono al
    // cancelar la clase) y sumar una recuperación sería pagarlo dos veces.
    const { data: sesiones } = await admin
      .from('sesiones').select('id, tipo_clase_id')
      .eq('studio_id', studioId).eq('cancelada', false)
      .gte('inicio', desdeISO).lt('inicio', hastaISO);
    if (!sesiones?.length) continue;

    const tipoDeSesion = new Map(sesiones.map(s => [s.id as string, (s.tipo_clase_id as string | null) ?? null]));

    const { data: reservas } = await admin
      .from('reservas').select('id, socio_id, sesion_id, estado, cancelada_tardia, creado_en')
      .eq('studio_id', studioId)
      .in('sesion_id', sesiones.map(s => s.id as string));
    if (!reservas?.length) continue;

    const socios = [...new Set(reservas.map(r => r.socio_id as string).filter(Boolean))];
    if (!socios.length) continue;

    const [{ data: susRows }, { data: planRows }] = await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', studioId).in('socio_id', socios).eq('estado', 'ACTIVA'),
      admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
    ]);
    const planes = await hidratarTiposDePlanes(admin as never, studioId, (planRows ?? []).map(mapPlanTarifa));
    const planPorId = new Map(planes.map(p => [p.id, p]));

    for (const socioId of socios) {
      const suyas = reservas.filter(r => r.socio_id === socioId);
      const susActivas = (susRows ?? []).map(mapSuscripcion).filter(s => s.socioId === socioId);

      for (const sus of susActivas) {
        const plan = sus.planId ? planPorId.get(sus.planId) : null;
        const limite = plan?.limiteSemanal ?? null;
        if (!plan || limite == null || limite <= 0) continue;

        const cubre = (sesionId: string) => planCubreTipoClase(plan, tipoDeSesion.get(sesionId) ?? null);

        const usadas = suyas.filter(r =>
          (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') && cubre(r.sesion_id as string)).length;
        // `cancelada_tardia === false` a propósito, no `!== true`: NULL es «no
        // se sabe» (cancelada antes de existir la columna) y eso no se compensa.
        const canceladas = suyas
          .filter(r => r.estado === 'CANCELADA' && r.cancelada_tardia === false && cubre(r.sesion_id as string))
          .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)));

        const derecho = derechoDeRecuperaciones(limite, usadas, canceladas.length);
        for (const r of canceladas.slice(0, derecho)) {
          // `origen_reserva_id` es la reserva cancelada: la RPC dedupe por él,
          // así que repetir el barrido no otorga dos veces. También aplica el
          // tope de 4 vivas y la política de caducidad del estudio.
          const { data: res } = await admin.rpc('crear_recuperacion', {
            p_id: `recup-${uid()}`,
            p_studio_id: studioId,
            p_socio_id: socioId,
            p_origen_reserva_id: r.id as string,
            p_motivo: 'Cancelaste a tiempo y no te dio tiempo a recuperarla esa semana',
          });
          if (res === 'CREADA') otorgadas++; else saltadas++;
        }
      }
    }
  }

  return { ...vacio, estudios: estudiosMirados, otorgadas, saltadas };
}
