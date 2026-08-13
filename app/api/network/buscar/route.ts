import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { mapFilaAPerfilPublico, type FilaRedPerfilPublica } from '@/lib/network/mapeo';
import { ordenarResultadosNetwork } from '@/lib/network/ranking';
import {
  esEspecialidadValida, esHorarioValido, esTipoTrabajoValido, esDisponibilidadEstadoValido,
} from '@/lib/network/catalogo';
import type { FiltroBusquedaNetwork } from '@/lib/network/tipos';

// Buscador de profesionales — docs/NETWORK-IMPLEMENTATION-PLAN.md §4/§8.
//
// Service-role + verificarSesionStaff (no verificarUsuarioSupabase): a
// diferencia del perfil propio, esto es una pantalla del panel de un
// estudio (propietaria/manager/recepción buscando quién puede cubrir un
// hueco), así que se le exige el mismo tipo de sesión que al resto de rutas
// del dashboard. Nótese que esto NO es el límite de seguridad de verdad —
// la RLS (`red_perfiles_select_publicado`) ya permite a CUALQUIER
// `authenticated` leer perfiles publicados con independencia de rol; este
// guard es solo para que la ruta se comporte igual que sus vecinas del
// panel, no para restringir qué datos son visibles.
//
// Solo columnas públicas: nunca se piden email_contacto/telefono_contacto/
// auth_user_id (ver mapFilaAPerfilPublico) — nada que redactar después
// porque nunca salieron de Postgres.
const SELECT_COLUMNAS_PUBLICAS = `
  id, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, estado, identidad_verificada_en,
  creado_en, actualizado_en, ultimo_acceso_en
`;

// Tope sin paginar: mismo criterio pragmático que otros listados de este
// repo (ver memoria "conciliador-es-el-camino-principal", tope 100 sin
// paginar) — con la escala actual de Network, 200 resultados es más que
// suficiente para no perder ningún caso real, y paginar de verdad es
// prematuro antes de tener volumen que lo justifique.
const LIMITE_RESULTADOS = 200;

function listaParam(sp: URLSearchParams, clave: string): string[] {
  const valor = sp.get(clave);
  return valor ? valor.split(',').map(v => v.trim()).filter(Boolean) : [];
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const ciudad = sp.get('ciudad')?.trim() || null;
  const especialidades = listaParam(sp, 'especialidades').filter(esEspecialidadValida);
  const disponibilidad = listaParam(sp, 'disponibilidad').filter(esDisponibilidadEstadoValido);
  const horarios = listaParam(sp, 'horarios').filter(esHorarioValido);
  const tipoTrabajo = listaParam(sp, 'tipoTrabajo').filter(esTipoTrabajoValido);
  const experienciaMinimaRaw = sp.get('experienciaMinima');
  const experienciaMinima = experienciaMinimaRaw && Number.isFinite(Number(experienciaMinimaRaw))
    ? Number(experienciaMinimaRaw)
    : null;

  let query = admin
    .from('red_perfiles')
    .select(SELECT_COLUMNAS_PUBLICAS)
    .eq('estado', 'published')
    .limit(LIMITE_RESULTADOS);

  if (ciudad) query = query.ilike('ciudad', `%${ciudad}%`);
  if (especialidades.length > 0) query = query.overlaps('especialidades', especialidades);
  if (disponibilidad.length > 0) query = query.in('disponibilidad_estado', disponibilidad);
  if (horarios.length > 0) query = query.overlaps('disponibilidad_horarios', horarios);
  if (tipoTrabajo.length > 0) query = query.overlaps('tipo_trabajo', tipoTrabajo);
  if (experienciaMinima != null) query = query.gte('anios_experiencia', experienciaMinima);

  const { data, error } = await query;
  if (error) return errorInterno('network:buscar', error, 'No se han podido cargar los resultados.');

  const filas = (data ?? []) as unknown as FilaRedPerfilPublica[];

  // Badge "Experiencia verificada" (Fase 8) en LOTE: una única query con
  // `.in(perfil_id)` para los N perfiles del resultado, nunca una consulta
  // por tarjeta — es la única señal barata de calcular así (el resto de
  // badges, p.ej. email verificado, exige un lookup de Auth por persona y
  // se queda solo en el detalle de un perfil, ver app/api/network/perfil/[id]).
  const ids = filas.map(f => f.id);
  const { data: experienciasConfirmadas } = ids.length
    ? await admin.from('red_experiencias').select('perfil_id').in('perfil_id', ids).eq('estado_verificacion', 'confirmada')
    : { data: [] as { perfil_id: string }[] };
  const perfilesConExperienciaVerificada = new Set((experienciasConfirmadas ?? []).map(e => e.perfil_id as string));

  const filtro: FiltroBusquedaNetwork = {
    ciudad, especialidades: especialidades as FiltroBusquedaNetwork['especialidades'],
    disponibilidad: disponibilidad as FiltroBusquedaNetwork['disponibilidad'],
    horarios: horarios as FiltroBusquedaNetwork['horarios'],
    tipoTrabajo: tipoTrabajo as FiltroBusquedaNetwork['tipoTrabajo'],
    experienciaMinima,
  };
  const perfiles = filas.map(f => mapFilaAPerfilPublico(f, perfilesConExperienciaVerificada.has(f.id)));
  const ordenados = ordenarResultadosNetwork(perfiles, filtro);

  return NextResponse.json({ perfiles: ordenados });
}
