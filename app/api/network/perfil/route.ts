import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mapFilaAPerfil, type FilaRedPerfil } from '@/lib/network/mapeo';
import {
  esEspecialidadValida, esHorarioValido, esTipoTrabajoValido, esTarifaRangoValida,
} from '@/lib/network/catalogo';

// Perfil profesional de Tentare Network (docs/NETWORK-IMPLEMENTATION-PLAN.md
// §1). Identidad por auth_user_id, NUNCA por studio_id — verificarSesionStaff
// exige pertenecer a un estudio y por eso no sirve aquí; verificarUsuarioSupabase
// solo valida el JWT, que es justo lo que hace falta: cualquier persona con
// cuenta de Supabase Auth en Tentare (staff de cualquier rol, en cualquier
// estudio o en ninguno) puede tener un perfil de Network.

const SELECT_COLUMNAS = `
  id, auth_user_id, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, email_contacto, telefono_contacto,
  estado, identidad_verificada_en, creado_en, actualizado_en, ultimo_acceso_en
`;

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('red_perfiles')
    .select(SELECT_COLUMNAS)
    .eq('auth_user_id', usuario.userId)
    .maybeSingle();
  if (error) return errorInterno('network:perfil:GET', error, 'No se ha podido cargar tu perfil.');

  return NextResponse.json({ perfil: data ? mapFilaAPerfil(data as unknown as FilaRedPerfil) : null });
}

// Campos aceptados desde el formulario de /network/mi-perfil. `estado`
// (draft/published/hidden/suspended) se gestiona en un endpoint aparte
// (Fase 3: publicación) — nunca desde aquí.
function saneaCambios(body: Record<string, unknown>): { row: Record<string, unknown>; error?: string } {
  const row: Record<string, unknown> = {};

  if ('nombre' in body) {
    const nombre = String(body.nombre ?? '').trim();
    if (!nombre) return { row, error: 'El nombre no puede quedar vacío.' };
    row.nombre = nombre;
  }
  if ('ciudad' in body) row.ciudad = body.ciudad == null || body.ciudad === '' ? null : String(body.ciudad).trim();
  if ('zona' in body) row.zona = body.zona == null || body.zona === '' ? null : String(body.zona).trim();
  if ('radioKm' in body) {
    const n = body.radioKm == null ? null : Number(body.radioKm);
    if (n != null && (!Number.isFinite(n) || n < 0)) return { row, error: 'El radio no es válido.' };
    row.radio_km = n;
  }
  if ('descripcion' in body) row.descripcion = body.descripcion == null || body.descripcion === '' ? null : String(body.descripcion).trim();
  if ('especialidades' in body) {
    const lista = Array.isArray(body.especialidades) ? body.especialidades : [];
    if (!lista.every(esEspecialidadValida)) return { row, error: 'Hay una especialidad no reconocida.' };
    row.especialidades = lista;
  }
  if ('aniosExperiencia' in body) {
    const n = body.aniosExperiencia == null ? null : Number(body.aniosExperiencia);
    if (n != null && (!Number.isFinite(n) || n < 0)) return { row, error: 'Los años de experiencia no son válidos.' };
    row.anios_experiencia = n;
  }
  if ('tarifaRango' in body) {
    if (body.tarifaRango != null && !esTarifaRangoValida(body.tarifaRango)) return { row, error: 'La tarifa no es válida.' };
    row.tarifa_rango = body.tarifaRango ?? null;
  }
  if ('disponibilidadEstado' in body) {
    const v = String(body.disponibilidadEstado ?? '');
    if (!['disponible', 'disponible_sustituciones', 'buscando_trabajo', 'no_disponible'].includes(v)) {
      return { row, error: 'El estado de disponibilidad no es válido.' };
    }
    row.disponibilidad_estado = v;
  }
  if ('disponibilidadHorarios' in body) {
    const lista = Array.isArray(body.disponibilidadHorarios) ? body.disponibilidadHorarios : [];
    if (!lista.every(esHorarioValido)) return { row, error: 'Hay un horario no reconocido.' };
    row.disponibilidad_horarios = lista;
  }
  if ('tipoTrabajo' in body) {
    const lista = Array.isArray(body.tipoTrabajo) ? body.tipoTrabajo : [];
    if (!lista.every(esTipoTrabajoValido)) return { row, error: 'Hay un tipo de trabajo no reconocido.' };
    row.tipo_trabajo = lista;
  }
  if ('emailContacto' in body) row.email_contacto = body.emailContacto == null || body.emailContacto === '' ? null : String(body.emailContacto).trim();
  if ('telefonoContacto' in body) row.telefono_contacto = body.telefonoContacto == null || body.telefonoContacto === '' ? null : String(body.telefonoContacto).trim();
  if ('fotoUrl' in body) row.foto_url = body.fotoUrl == null ? null : String(body.fotoUrl);

  return { row };
}

export async function PUT(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorPeticion('Petición inválida.');

  const { row, error: errorValidacion } = saneaCambios(body);
  if (errorValidacion) return errorPeticion(errorValidacion);
  if (Object.keys(row).length === 0) return errorPeticion('Nada que actualizar.');

  const { data: existente, error: errLeer } = await admin
    .from('red_perfiles')
    .select('id, estado')
    .eq('auth_user_id', usuario.userId)
    .maybeSingle();
  if (errLeer) return errorInterno('network:perfil:PUT:leer', errLeer, 'No se ha podido guardar tu perfil.');

  // Este endpoint usa getSupabaseAdmin() (service_role): la RLS que bloquea
  // el UPDATE de un perfil suspendido (20260813112713) no se aplica aquí, la
  // RLS solo frena al `authenticated` propio. Mismo guard explícito que ya
  // tiene PATCH /api/network/perfil/estado.
  if (existente?.estado === 'suspended') {
    return errorPeticion('Tu perfil ha sido suspendido por moderación y no puedes modificarlo. Contacta con soporte si crees que es un error.', 403);
  }

  const ahora = new Date().toISOString();

  if (existente) {
    const { data, error } = await admin
      .from('red_perfiles')
      .update({ ...row, actualizado_en: ahora, ultimo_acceso_en: ahora })
      .eq('id', existente.id)
      .select(SELECT_COLUMNAS)
      .single();
    if (error) return errorInterno('network:perfil:PUT:actualizar', error, 'No se ha podido guardar tu perfil.');
    return NextResponse.json({ perfil: mapFilaAPerfil(data as unknown as FilaRedPerfil) });
  }

  if (!row.nombre) return errorPeticion('El nombre es obligatorio para crear tu perfil.');

  const { data, error } = await admin
    .from('red_perfiles')
    .insert({
      id: `red-${uid()}`,
      auth_user_id: usuario.userId,
      ...row,
      actualizado_en: ahora,
      ultimo_acceso_en: ahora,
    })
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:perfil:PUT:crear', error, 'No se ha podido crear tu perfil.');

  return NextResponse.json({ perfil: mapFilaAPerfil(data as unknown as FilaRedPerfil) });
}
