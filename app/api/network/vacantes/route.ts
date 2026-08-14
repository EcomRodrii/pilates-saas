import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { uid } from '@/lib/utils';
import { mapFilaAVacante, type FilaRedVacante } from '@/lib/network/mapeo';
import { esEspecialidadValida, esHorarioValido, esTipoTrabajoValido, esTarifaRangoValida } from '@/lib/network/catalogo';

// Vacantes de Tentare Network (Fase 2, "estudio → busca instructora") —
// "Mis vacantes" del panel: GET lista todas las del estudio (cualquier
// estado, con el contador de candidaturas), POST crea una nueva en 'draft'.
// Mismo criterio de permiso que red_verificaciones_experiencia: publicar
// una vacante y decidir sobre candidatas es una decisión de equipo/
// contratación, gateada con puedeGestionarEquipo — no cualquier staff, a
// diferencia de "contactar" a una instructora.

const SELECT_COLUMNAS = `
  id, studio_id, titulo, especialidades, horarios, tipo_trabajo, tarifa_rango,
  requisitos, descripcion, estado, creado_en, actualizado_en, cerrado_en
`;

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('red_vacantes')
    .select(SELECT_COLUMNAS)
    .eq('studio_id', sesion.studioId)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('network:vacantes:GET', error, 'No se han podido cargar tus vacantes.');

  const filas = (data ?? []) as unknown as FilaRedVacante[];
  if (filas.length === 0) return NextResponse.json({ vacantes: [] });

  // Contador de candidaturas por vacante — sin columna desincronizable,
  // una query agregada sobre la tabla real (mismo criterio que
  // "estudiosQueTeGuardaron" en el perfil propio).
  const { data: candidaturas } = await admin
    .from('red_candidaturas')
    .select('vacante_id')
    .in('vacante_id', filas.map(f => f.id));
  const conteos = new Map<string, number>();
  for (const c of (candidaturas ?? []) as { vacante_id: string }[]) {
    conteos.set(c.vacante_id, (conteos.get(c.vacante_id) ?? 0) + 1);
  }

  const vacantes = filas.map(f => mapFilaAVacante(f, { totalCandidaturas: conteos.get(f.id) ?? 0 }));
  return NextResponse.json({ vacantes });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para publicar vacantes.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const titulo = String(body?.titulo ?? '').trim();
  const descripcion = String(body?.descripcion ?? '').trim();
  if (!titulo || !descripcion) return errorPeticion('El título y la descripción son obligatorios.');

  const especialidades = Array.isArray(body?.especialidades) ? body.especialidades : [];
  if (!especialidades.every(esEspecialidadValida)) return errorPeticion('Hay una especialidad no reconocida.');

  const horarios = Array.isArray(body?.horarios) ? body.horarios : [];
  if (!horarios.every(esHorarioValido)) return errorPeticion('Hay un horario no reconocido.');

  const tipoTrabajo = body?.tipoTrabajo;
  if (!esTipoTrabajoValido(tipoTrabajo)) return errorPeticion('El tipo de colaboración no es válido.');

  const tarifaRango = body?.tarifaRango ?? 'a_negociar';
  if (!esTarifaRangoValida(tarifaRango)) return errorPeticion('La tarifa no es válida.');

  const requisitos = body?.requisitos == null || body.requisitos === '' ? null : String(body.requisitos).trim();

  const { data, error } = await admin
    .from('red_vacantes')
    .insert({
      id: `redvac-${uid()}`,
      studio_id: sesion.studioId, // autoridad: el estudio del JWT, nunca del body
      publicado_por: sesion.userId,
      titulo, descripcion, requisitos,
      especialidades, horarios, tipo_trabajo: tipoTrabajo, tarifa_rango: tarifaRango,
    })
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:vacantes:POST', error, 'No se ha podido crear la vacante.');

  return NextResponse.json({ vacante: mapFilaAVacante(data as unknown as FilaRedVacante) });
}
