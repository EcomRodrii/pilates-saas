// ─────────────────────────────────────────────────────────────────────────────
// «Cierre del centro»: la semana de vacaciones, el puente, la reforma.
//
// Aplicar un cierre hace tres cosas además de guardarlo, y ninguna es nueva —
// las tres reutilizan piezas que ya existían:
//
//   · Cancela las clases del rango y avisa → `cancelarSesionPorMotivo`, la
//     misma que usa el corte por mínimo de asistentes. Comparten criterio: la
//     cancelación NO es decisión de la socia, así que se le devuelve el bono.
//   · Prorroga bonos y recuperaciones → la RPC `ampliar_caducidades` (#1621),
//     con el mismo tope de 365 días que ya valida ella.
//   · Impedir reservar en esas fechas NO se hace aquí: vive en la RPC
//     `reservar_plaza` (migr 20260905160000). Tiene que seguir siendo cierto
//     para una sesión creada DESPUÉS de declarar el cierre, y eso solo lo
//     garantiza la base de datos.
//
// La prórroga alcanza a TODAS las socias del estudio, no solo a las que tenían
// reserva esa semana: si el centro cierra siete días, el bono de cualquiera
// pierde siete días de vigencia, hubiera reservado o no.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { cancelarSesionPorMinimoNoAlcanzado } from '@/lib/db/supabase-data-admin';
import { inicioDelDiaEstudio, finDelDiaEstudio } from '@/lib/utils.ts';
import { diasDeCierre } from './dias-de-cierre.ts';

export { diasDeCierre };

/** Tope de la RPC `ampliar_caducidades`. Un cierre más largo que un año no es
 *  un cierre, es un traspaso: se guarda igual, pero no se prorroga a ciegas. */
const MAX_DIAS_PRORROGA = 365;


export interface ResumenCierre {
  cierreId: string;
  dias: number;
  clasesCanceladas: number;
  bonosAmpliados: number;
  recuperacionesAmpliadas: number;
  /** Lo que no se pudo hacer, con su motivo. Se informa, no se esconde. */
  incidencias: string[];
}

export async function aplicarCierreEstudio(params: {
  studioId: string; desde: string; hasta: string; motivo?: string | null;
}): Promise<ResumenCierre | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Service role no configurada' };
  if (params.hasta < params.desde) return { error: 'La fecha de fin no puede ser anterior a la de inicio' };

  const dias = diasDeCierre(params.desde, params.hasta);
  const incidencias: string[] = [];

  const cierreId = `cie-${params.studioId}-${params.desde}-${params.hasta}`;
  const { error: errCierre } = await admin.from('cierres_estudio').insert({
    id: cierreId, studio_id: params.studioId,
    desde: params.desde, hasta: params.hasta, motivo: params.motivo ?? null,
  });
  // 23505 = ya existe ese cierre exacto. Es idempotente a propósito: reintentar
  // no debe fallar ni duplicar, y las clases que quedasen sin cancelar de un
  // intento anterior se terminan de cancelar abajo.
  if (errCierre && errCierre.code !== '23505') {
    return { error: `No se pudo guardar el cierre: ${errCierre.message}` };
  }

  // Las sesiones del rango, en DÍAS DEL ESTUDIO. Ver inicioDelDiaEstudio: con
  // días UTC se escaparían las clases de madrugada del primer día.
  const { data: sesiones, error: errSes } = await admin
    .from('sesiones').select('id')
    .eq('studio_id', params.studioId)
    .eq('cancelada', false)
    .gte('inicio', inicioDelDiaEstudio(params.desde))
    .lt('inicio', finDelDiaEstudio(params.hasta));
  if (errSes) return { error: `No se pudieron leer las clases: ${errSes.message}` };

  let clasesCanceladas = 0;
  for (const s of sesiones ?? []) {
    // Una a una y sin abortar el lote: si una clase falla, las demás se cancelan
    // igual. Media semana cerrada es peor que una clase sin cancelar, y el
    // resumen dice cuál se quedó fuera.
    const res = await cancelarSesionPorMinimoNoAlcanzado({
      studioId: params.studioId, sesionId: s.id as string, motivo: 'cierre_centro',
    });
    if ('error' in res) incidencias.push(`Clase ${s.id}: ${res.error}`);
    else clasesCanceladas++;
  }

  let bonosAmpliados = 0;
  let recuperacionesAmpliadas = 0;
  if (dias >= 1 && dias <= MAX_DIAS_PRORROGA) {
    const { data: socios, error: errSocios } = await admin
      .from('socios').select('id').eq('studio_id', params.studioId).is('borrado_en', null);
    if (errSocios) {
      incidencias.push(`No se pudieron prorrogar las caducidades: ${errSocios.message}`);
    } else if (socios?.length) {
      const { data: ampliado, error: errAmp } = await admin.rpc('ampliar_caducidades', {
        p_studio_id: params.studioId,
        p_socio_ids: socios.map(s => s.id as string),
        p_dias: dias,
      });
      if (errAmp) incidencias.push(`No se pudieron prorrogar las caducidades: ${errAmp.message}`);
      else {
        const fila = Array.isArray(ampliado) ? ampliado[0] : ampliado;
        bonosAmpliados = Number(fila?.bonos_ampliados ?? 0);
        recuperacionesAmpliadas = Number(fila?.recuperaciones_ampliadas ?? 0);
      }
    }
  } else if (dias > MAX_DIAS_PRORROGA) {
    incidencias.push(`El cierre dura ${dias} días: las caducidades no se prorrogan solas por encima de ${MAX_DIAS_PRORROGA}.`);
  }

  return { cierreId, dias, clasesCanceladas, bonosAmpliados, recuperacionesAmpliadas, incidencias };
}
