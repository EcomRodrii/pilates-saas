import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { plazasLibresEncendido } from '@/lib/interruptor-por-estudio';
import { fetchAllRows, mapPlazaFija } from '@/lib/supabase-data';
import { sesionesYReservasDelRango } from '@/lib/calendario/rango-servidor';
import { rangoDePlazasLibres } from '@/lib/calendario/plazas-libres';
import { contarPlazasLibres, type LecturasPlazasLibres } from '@/lib/calendario/plazas-libres-servidor';
import { errorInterno } from '@/lib/errores-servidor';
import { finDelDiaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '@/lib/utils';
import type { RowPlazasFijas } from '@/lib/db-types';

export const dynamic = 'force-dynamic';

// «Plazas libres» del Calendario (P3.9). Sin `desde`/`hasta` es la sonda
// (`{ disponible }`); con ellos, las cifras de cada clase del rango (como mucho
// un mes). Todo se cuenta en el servidor: con un mes, `/api/calendario` cortaría
// las reservas a mil filas en silencio y la pantalla diría que hay sitio en una
// clase llena. Solo ids y cifras: los nombres los pone el panel.
//
// ⚠️ El estudio sale SIEMPRE de la sesión y el rol se comprueba AQUÍ (las
// lecturas van con service-role): el mismo permiso que gestionar el calendario.
// Apagado mientras el interruptor `CALENDARIO_PLAZAS_LIBRES` no lo encienda.
// Qué se hace con los datos (y por qué falla cerrado) vive en
// `lib/calendario/plazas-libres-servidor.ts`, con sus pruebas; aquí solo se
// conectan las lecturas.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarCalendario(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const encendido = plazasLibresEncendido(sesion.studioId);

  const params = req.nextUrl.searchParams;
  if (!params.has('desde') && !params.has('hasta')) {
    return NextResponse.json({ disponible: encendido }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!encendido) return NextResponse.json({ disponible: false }, { headers: { 'Cache-Control': 'no-store' } });

  const hoy = hoyEnEstudio();
  const rango = rangoDePlazasLibres(params.get('desde'), params.get('hasta'), hoy);
  if (!rango.ok) return NextResponse.json({ error: rango.error }, { status: 400 });

  const limited = await enforceRateLimit(req, 'calendario-plazas-libres', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const studioId = sesion.studioId;
  const lecturas: LecturasPlazasLibres = {
    rango: async (desde, hasta) => {
      const r = await sesionesYReservasDelRango(admin, studioId, desde, hasta);
      if (!r) return null;
      return {
        sesiones: r.sesiones.map(s => ({
          id: s.id, inicio: s.inicio, fin: s.fin, salaId: s.salaId, tipoClaseId: s.tipoClaseId, aforoMaximo: s.aforoMaximo, cancelada: s.cancelada,
        })),
        reservas: r.reservas.map(x => ({ id: x.id, sesionId: x.sesionId, socioId: x.socioId, estado: x.estado, ofertaExpiraEn: x.ofertaExpiraEn ?? null })),
      };
    },
    plazasFijas: async () => {
      const r = await fetchAllRows<RowPlazasFijas>(studioId, 'plazas_fijas', (from, to) => admin.from('plazas_fijas')
        .select('*').eq('studio_id', studioId).in('estado', ['ACTIVA', 'PAUSADA']).order('id').range(from, to));
      return r.error ? null : r.data.map(mapPlazaFija);
    },
    // Si una plaza ofrecida a la lista de espera cuenta como ocupada: lo elige cada estudio (7-oct-2026).
    ofertaOcupa: async () => {
      const { data, error } = await admin.from('studios').select('lista_espera_reserva_plaza_ofrecida').eq('id', studioId).maybeSingle();
      return error ? null : (data as { lista_espera_reserva_plaza_ofrecida?: boolean } | null)?.lista_espera_reserva_plaza_ofrecida === true;
    },
    apartadas: async (ids) => {
      const { data, error } = await admin.rpc('plazas_apartadas_de', { p_studio_id: sesion.studioId, p_sesion_ids: ids });
      return error ? null : ((data ?? []) as { sesion_id: string; plazas: number }[]).map(f => ({ sesion_id: f.sesion_id, plazas: Number(f.plazas) }));
    },
    // Paginadas: los trozos de 100 sesiones solo acortan la URL; PostgREST corta a mil filas.
    retiradas: async (ids) => {
      const r = await fetchAllRows<{ id: string }>(studioId, 'reservas', (from, to) => admin.from('reservas').select('id')
        .eq('studio_id', studioId).in('sesion_id', ids).eq('estado', 'CANCELADA').eq('cancelada_motivo', 'plaza_fija_retirada')
        .order('id').range(from, to));
      return r.error ? null : r.data.map(x => x.id);
    },
    cierres: async (desde, hasta) => {
      const { data, error } = await admin.from('cierres_estudio').select('desde, hasta')
        .eq('studio_id', studioId).lte('desde', hasta).gte('hasta', desde);
      return error ? null : ((data ?? []) as { desde: string; hasta: string }[]);
    },
    averias: async (desde, hasta) => {
      const { data, error } = await admin.from('bloqueos_maquina').select('id, sala_id, spot_id, desde, hasta')
        .eq('studio_id', studioId).lt('desde', hasta).or(`hasta.is.null,hasta.gt.${desde}`);
      if (error) return null;
      return ((data ?? []) as { id: string; sala_id: string; spot_id: string | null; desde: string; hasta: string | null }[])
        .map(b => ({ id: b.id, studioId, salaId: b.sala_id, spotId: b.spot_id, desde: b.desde, hasta: b.hasta, motivo: null, creadoEn: b.desde }));
    },
  };

  try {
    const ahora = new Date();
    const desdeIso = new Date(Math.max(new Date(inicioDelDiaEstudio(rango.desde)).getTime(), ahora.getTime())).toISOString();
    const { ofertaOcupa, sesiones } = await contarPlazasLibres(lecturas, { desdeIso, hastaIso: finDelDiaEstudio(rango.hasta), ahoraMs: ahora.getTime() });
    // `ofertaOcupa` va en la respuesta para que la leyenda diga la verdad en cada estudio;
    // `contadoEn`, para decir de cuándo es la foto.
    return NextResponse.json(
      { disponible: true, hoy, desde: rango.desde, hasta: rango.hasta, ofertaOcupa, contadoEn: ahora.toISOString(), sesiones },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorInterno('calendario/plazas-libres:GET', err, 'No se han podido contar las plazas libres.');
  }
}
