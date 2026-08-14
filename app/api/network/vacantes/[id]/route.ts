import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff, verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { mapFilaAVacante, type FilaRedVacante } from '@/lib/network/mapeo';
import { esEspecialidadValida, esHorarioValido, esTipoTrabajoValido, esTarifaRangoValida } from '@/lib/network/catalogo';

const SELECT_COLUMNAS = `
  id, studio_id, titulo, especialidades, horarios, tipo_trabajo, tarifa_rango,
  requisitos, descripcion, estado, creado_en, actualizado_en, cerrado_en
`;

// Detalle de una vacante — visible para cualquier authenticated si está
// 'published' (marketplace, ficha de una oportunidad), o para el staff del
// estudio dueño en cualquier estado (para editarla). Nunca para `anon`
// (mismo criterio ya cerrado para red_perfiles: sin indexar en Google en
// esta ronda de Fase 2).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data, error } = await admin
    .from('red_vacantes')
    .select(`${SELECT_COLUMNAS}, studios ( nombre, ciudad )`)
    .eq('id', id)
    .maybeSingle();
  if (error) return errorInterno('network:vacantes:id:GET', error, 'No se ha podido cargar la vacante.');
  if (!data) return NextResponse.json({ vacante: null });

  const fila = data as unknown as FilaRedVacante & { studios: { nombre: string | null; ciudad: string | null } | null };
  if (fila.estado !== 'published') {
    // No publicada: solo la ve el staff del estudio dueño.
    const sesionStaff = await verificarSesionStaff(req);
    if (!sesionStaff || sesionStaff.studioId !== fila.studio_id) {
      return NextResponse.json({ vacante: null });
    }
  }

  return NextResponse.json({
    vacante: mapFilaAVacante(fila, { estudioNombre: fila.studios?.nombre ?? null, estudioCiudad: fila.studios?.ciudad ?? null }),
  });
}

// Editar campos (no estado — endpoint aparte, mismo criterio que
// /api/network/perfil/estado). Solo staff del estudio dueño con permiso de
// equipo.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para editar vacantes.' }, { status: 403 });
  }

  const { id } = await params;
  const { data: existente } = await admin.from('red_vacantes').select('id, studio_id').eq('id', id).maybeSingle();
  if (!existente || existente.studio_id !== sesion.studioId) {
    return NextResponse.json({ error: 'Vacante no encontrada.' }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorPeticion('Petición inválida.');

  const row: Record<string, unknown> = {};
  if ('titulo' in body) {
    const titulo = String(body.titulo ?? '').trim();
    if (!titulo) return errorPeticion('El título no puede quedar vacío.');
    row.titulo = titulo;
  }
  if ('descripcion' in body) {
    const descripcion = String(body.descripcion ?? '').trim();
    if (!descripcion) return errorPeticion('La descripción no puede quedar vacía.');
    row.descripcion = descripcion;
  }
  if ('especialidades' in body) {
    const lista = Array.isArray(body.especialidades) ? body.especialidades : [];
    if (!lista.every(esEspecialidadValida)) return errorPeticion('Hay una especialidad no reconocida.');
    row.especialidades = lista;
  }
  if ('horarios' in body) {
    const lista = Array.isArray(body.horarios) ? body.horarios : [];
    if (!lista.every(esHorarioValido)) return errorPeticion('Hay un horario no reconocido.');
    row.horarios = lista;
  }
  if ('tipoTrabajo' in body) {
    if (!esTipoTrabajoValido(body.tipoTrabajo)) return errorPeticion('El tipo de colaboración no es válido.');
    row.tipo_trabajo = body.tipoTrabajo;
  }
  if ('tarifaRango' in body) {
    if (!esTarifaRangoValida(body.tarifaRango)) return errorPeticion('La tarifa no es válida.');
    row.tarifa_rango = body.tarifaRango;
  }
  if ('requisitos' in body) {
    row.requisitos = body.requisitos == null || body.requisitos === '' ? null : String(body.requisitos).trim();
  }
  if (Object.keys(row).length === 0) return errorPeticion('Nada que actualizar.');

  const { data, error } = await admin
    .from('red_vacantes')
    .update({ ...row, actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:vacantes:id:PATCH', error, 'No se han podido guardar los cambios.');

  return NextResponse.json({ vacante: mapFilaAVacante(data as unknown as FilaRedVacante) });
}
