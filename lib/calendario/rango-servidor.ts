import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
// Relativas a propósito: así lo pueden cargar las pruebas de `node --test`.
import { todasLasFilas, type Pagina } from '../clientas/estado-servidor.ts';
import type { Reserva, Sesion } from '../types.ts';

// Las clases de un rango y sus reservas, en el SERVIDOR, con la forma del panel
// (`Sesion`/`Reserva`) para pasarlas por las mismas funciones puras que la
// agenda de Inicio (`construirAgendaDelDia`) e Informes (`clasesDelTramo`).
//
// A diferencia de app/api/calendario/route.ts (que no se toca aquí):
//   - `reservas` y `sustituciones` van acotadas también por `studio_id`, no
//     solo por `sesion_id`: con service-role, la RLS no filtra nada;
//   - todo paginado (un rango de semanas pasa de mil reservas), y los ids de
//     sesión en trozos (una URL con miles de ids no cabe: 414);
//   - columnas explícitas, y de `sustituciones` NO se lee `motivo` (puede ser
//     salud): llega `null`, y con él la agenda dice «sin instructora» a secas.
//
// `null` si falla cualquier lectura: «no he podido mirar» no es «no hay clases».

const IDS_POR_CONSULTA = 100;

interface FilaSesion {
  id: string; tipo_clase_id: string | null; sala_id: string | null; instructor_id: string | null;
  inicio: string; fin: string; aforo_maximo: number | null; cancelada: boolean | null; incidencia_texto: string | null;
}
interface FilaReserva {
  id: string; sesion_id: string; socio_id: string | null; estado: string; check_in_en: string | null;
  confirmacion_pedida_en: string | null; confirmado_en: string | null; oferta_expira_en: string | null; posicion_espera: number | null;
}
interface FilaSustitucion { id: string; sesion_id: string; estado: string }

export interface RangoDelEstudio {
  sesiones: Sesion[];
  reservas: Reserva[];
  /** Sin `motivo`, a propósito (ver arriba). Ordenadas por creación, como espera `enriquecerSesiones`. */
  sustituciones: { id: string; sesion_id: string; estado: string; motivo: null }[];
  tiposClase: Map<string, string>;
  salas: Map<string, string>;
}

/** Clases con `inicio` en [desde, hasta) (instantes ISO), canceladas incluidas. */
export async function sesionesYReservasDelRango(
  admin: SupabaseClient, studioId: string, desde: string, hasta: string,
): Promise<RangoDelEstudio | null> {
  const [sesionesR, tiposR, salasR] = await Promise.all([
    todasLasFilas<FilaSesion>((d, h) => admin.from('sesiones')
      .select('id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, incidencia_texto')
      .eq('studio_id', studioId).gte('inicio', desde).lt('inicio', hasta)
      .order('id').range(d, h) as unknown as Pagina<FilaSesion>),
    todasLasFilas<{ id: string; nombre: string }>((d, h) => admin.from('tipos_clase').select('id, nombre')
      .eq('studio_id', studioId).order('id').range(d, h) as unknown as Pagina<{ id: string; nombre: string }>),
    todasLasFilas<{ id: string; nombre: string }>((d, h) => admin.from('salas').select('id, nombre')
      .eq('studio_id', studioId).order('id').range(d, h) as unknown as Pagina<{ id: string; nombre: string }>),
  ]);
  if (sesionesR.error || tiposR.error || salasR.error) return null;

  const ids = sesionesR.data.map(s => s.id);
  const reservas: FilaReserva[] = [];
  const sustituciones: (FilaSustitucion & { creado_en: string })[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_CONSULTA) {
    const lote = ids.slice(i, i + IDS_POR_CONSULTA);
    const [r, s] = await Promise.all([
      todasLasFilas<FilaReserva>((d, h) => admin.from('reservas')
        .select('id, sesion_id, socio_id, estado, check_in_en, confirmacion_pedida_en, confirmado_en, oferta_expira_en, posicion_espera')
        .eq('studio_id', studioId).in('sesion_id', lote)
        .order('id').range(d, h) as unknown as Pagina<FilaReserva>),
      todasLasFilas<FilaSustitucion & { creado_en: string }>((d, h) => admin.from('sustituciones')
        .select('id, sesion_id, estado, creado_en')
        .eq('studio_id', studioId).in('sesion_id', lote)
        .order('creado_en', { ascending: true }).order('id').range(d, h) as unknown as Pagina<FilaSustitucion & { creado_en: string }>),
    ]);
    if (r.error || s.error) return null;
    reservas.push(...r.data);
    sustituciones.push(...s.data);
  }
  sustituciones.sort((a, b) => a.creado_en.localeCompare(b.creado_en));

  return {
    sesiones: sesionesR.data.map(s => ({
      id: s.id, studioId, tipoClaseId: s.tipo_clase_id, salaId: s.sala_id, instructorId: s.instructor_id,
      inicio: s.inicio, fin: s.fin, aforoMaximo: s.aforo_maximo ?? 0, cancelada: s.cancelada === true,
      incidenciaTexto: s.incidencia_texto,
    }) as unknown as Sesion),
    reservas: reservas.map(r => ({
      id: r.id, studioId, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado, checkInEn: r.check_in_en,
      confirmacionPedidaEn: r.confirmacion_pedida_en, confirmadoEn: r.confirmado_en, ofertaExpiraEn: r.oferta_expira_en,
      posicionEspera: r.posicion_espera,
    }) as unknown as Reserva),
    sustituciones: sustituciones.map(s => ({ id: s.id, sesion_id: s.sesion_id, estado: s.estado, motivo: null })),
    tiposClase: new Map(tiposR.data.map(t => [t.id, t.nombre])),
    salas: new Map(salasR.data.map(s => [s.id, s.nombre])),
  };
}
